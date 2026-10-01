# -*- coding: utf-8 -*-
"""
goat-gateway: priority 分层 + 额度驱动的动态 weight（2026-10-01）

需求（用户原话）：
  1. 「给 deepseek 官方 api 的优先级调低一点，非必要不用这个」
  2. 「给月额度更近的那个更大的优先级，你可以把这个利用程序自动调配」
     —— "月额度更近" = monthUsed/monthCap 已用比例更高（该账号更快撞上限，
        剩余额度不消耗掉就随月度重置浪费）。数据侧印证：qq 月用量 99.4% >
        163 的 82.9%，而用户手动给 qq 设的 weight=3 也确实更高。

实现：
  * priority 分层：selectKey 只在本轮可用候选里「优先级最高的那一层」做均衡，
    低层 key 仅在高层全部不可用（冷却 / 模型不支持 / 本轮已试过）时参与。
    → 官方 key 设 priority:0 即成为兜底层。
  * 动态 weight：网关定期只读 quota-http（127.0.0.1:8790/quota），按已用比例算
    权重，**只覆盖内存里的 weight，不回写 keys.json**（免得与 mtime 热重载打架）。
    拉取失败静默回落到静态 weight。
  * 两者都向后兼容：不写 priority 的 key 默认同一层；quotaSync 关闭时行为与改动前一致。

每个替换必须恰好命中 1 次，否则整体不落盘。
"""
import sys, pathlib

SRC = pathlib.Path('gateway.mjs')
src = SRC.read_text(encoding='utf-8')
orig = src

REPL = []
def sub(name, old, new):
    REPL.append((name, old, new))

# ── Q1: DEFAULTS 加 quotaSync ────────────────────────────────────────────
sub('Q1 defaults', '''  maxBodyBytes: 64 * 1024 * 1024,
  bodyTimeoutMs: 120000,
  maxSessions: 2000,
  upstreamTimeoutMs: 900000,
  logKeepDays: 30,
};''', '''  maxBodyBytes: 64 * 1024 * 1024,
  bodyTimeoutMs: 120000,
  maxSessions: 2000,
  upstreamTimeoutMs: 900000,
  logKeepDays: 30,
  // 额度驱动的动态权重（2026-10-01 加）。只读 quota-http，不自己调上游。
  //   mode: 'used' = 月已用比例高的优先（默认）；'left' = 月剩余多的优先（均衡派）。
  //   min/maxWeight: 动态权重的取值区间，映射 [0,1] 的已用比例。
  quotaSync: {
    enabled: true,
    url: 'http://127.0.0.1:8790/quota',
    intervalMs: 60000,
    timeoutMs: 15000,
    mode: 'used',
    minWeight: 0.2,
    maxWeight: 5,
  },
};''')

# ── Q2: loadKeys 保留 priority / quotaAccount ──────────────────────────
sub('Q2 loadKeys', '''      modelMap: (k.modelMap && typeof k.modelMap === 'object' && !Array.isArray(k.modelMap)) ? k.modelMap : null,
    }));''', '''      modelMap: (k.modelMap && typeof k.modelMap === 'object' && !Array.isArray(k.modelMap)) ? k.modelMap : null,
      // priority（2026-10-01 加）：越大越优先。selectKey 只在最高优先级那一层里做均衡，
      // 低层 key 仅当高层全部不可用时才参与。缺省 100 —— 全部 key 不写时行为与改动前一致。
      // 用途：官方 key 设 0 → 兜底层，「非必要不用」。
      priority: (() => {
        const p = Number(k.priority);
        return Number.isFinite(p) ? p : 100;
      })(),
      // quotaAccount（2026-10-01 加）：从 quota-http 的哪一行取额度。缺省用 key 的 name。
      quotaAccount: typeof k.quotaAccount === 'string' && k.quotaAccount ? k.quotaAccount : (k.name || ''),
    }));''')

# ── Q3: quota 同步模块 + effWeight ──────────────────────────────────────
sub('Q3 quota module', '''let allowCache = { mtime: 0, ids: null };''', '''// ── 额度驱动的动态权重（2026-10-01 加）──────────────────────────────────
//
// 规则（用户拍板）：「给月额度更近的那个更大的优先级」—— monthUsed/monthCap 已用比例
// 更高的 GOAT 账号更快撞上限，它的剩余额度不消耗掉就随月度重置浪费，所以优先用它。
//
// 数据源是既有 quota-http 服务（127.0.0.1:8790/quota，见 quota-http.mjs）——它聚合
// 两个 GOAT 账号的 5h/周/月窗口 + 官方余额。网关只读它，不自己调上游。
//
// 三条设计约束：
//   1. 动态权重只覆盖 selectKey 里的 weight，**绝不回写 keys.json** —— 否则会与 mtime
//      热重载互相打架（用户手改一次就被下一轮同步冲掉）。
//   2. 拉取失败静默回落到 keys.json 里的静态 weight，quota 服务故障绝不影响转发。
//   3. 官方余额行没有 month 窗口 → monthUsedRatio 返回 null → 不进动态表，仍用静态值。
let quotaWeights = new Map();
let quotaState = { at: 0, ok: false, error: '', detail: [] };

function monthUsedRatio(row) {
  const used = Number(row && row.monthUsed);
  const cap = Number(row && row.monthCap);
  if (!Number.isFinite(used) || !Number.isFinite(cap) || cap <= 0) return null;
  return Math.min(1, Math.max(0, used / cap));
}

async function syncQuota() {
  const qs = CFG.quotaSync;
  if (!qs || qs.enabled === false || !qs.url) return;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Math.max(1000, Number(qs.timeoutMs) || 15000));
    let json;
    try {
      const r = await fetch(String(qs.url), { headers: { accept: 'application/json' }, signal: ctl.signal });
      json = await r.json();
    } finally {
      clearTimeout(timer);
    }
    const rows = Array.isArray(json && json.rows) ? json.rows : [];
    const lo = Number.isFinite(Number(qs.minWeight)) ? Number(qs.minWeight) : 0.2;
    const hi = Number.isFinite(Number(qs.maxWeight)) ? Number(qs.maxWeight) : 5;
    const left = String(qs.mode || 'used').toLowerCase() === 'left';
    const next = new Map();
    const detail = [];
    for (const row of rows) {
      const name = String((row && row.name) || '');
      const ratio = monthUsedRatio(row);
      if (!name || ratio === null) continue;
      const w = lo + (hi - lo) * (left ? 1 - ratio : ratio);
      next.set(name, w);
      detail.push(`${name}: ${(ratio * 100).toFixed(1)}% -> w${w.toFixed(2)}`);
    }
    quotaWeights = next;
    quotaState = { at: Date.now(), ok: true, error: '', detail };
  } catch (e) {
    quotaState = { ...quotaState, at: Date.now(), ok: false, error: String((e && e.message) || e) };
  }
}

// selectKey 用它取「有效权重」：quota 同步成功就用动态值，否则回落静态 weight。
function effWeight(k) {
  const qw = quotaWeights.get(k.quotaAccount || k.name);
  if (Number.isFinite(qw) && qw > 0) return qw;
  return k.weight > 0 ? k.weight : 1;
}

let allowCache = { mtime: 0, ids: null };''')

# ── Q4: selectKey 分层 ──────────────────────────────────────────────────
sub('Q4 selectKey head', '''function selectKey(candidates, fp, prefixFp = '') {
  const strategy = String(CFG.strategy || 'session').toLowerCase();

  if (strategy === 'round-robin') return pickKey(candidates.filter((k) => !isCooling(k.name)));

  if ((strategy === 'session' || strategy === 'prefix') && fp) {
    const bound = state.sessions[fp];
    if (bound) {
      const held = candidates.find((k) => k.name === bound.key);''', '''function selectKey(candidates, fp, prefixFp = '') {
  const strategy = String(CFG.strategy || 'session').toLowerCase();
  if (!candidates.length) return null;

  // ── priority 分层（2026-10-01 加）──────────────────────────────────────
  // 只在本轮可用候选中「优先级最高的那一层」做负载均衡；低优先级的 key 只有高层全部
  // 不可用（冷却 / 模型不支持 / 已在本次请求里试过）时才参与。
  // 用途：把 DeepSeek 官方 key 降为兜底层（priority 更低）——「非必要不用」。
  // 缺省 priority 100，所以全部 key 不写时与改动前逐位一致。
  const prioOf = (k) => (Number.isFinite(Number(k.priority)) ? Number(k.priority) : 100);
  const topPriority = Math.max(...candidates.map(prioOf));
  const pool = candidates.filter((k) => prioOf(k) === topPriority);

  if (strategy === 'round-robin') return pickKey(pool.filter((k) => !isCooling(k.name)));

  if ((strategy === 'session' || strategy === 'prefix') && fp) {
    const bound = state.sessions[fp];
    if (bound) {
      const held = pool.find((k) => k.name === bound.key);''')

sub('Q4b session fresh', '''    const fresh = candidates.filter((k) => !isCooling(k.name));
    if (!fresh.length) return null;
    // 首次见到该会话，或它原来绑定的 key 已不可用（冷却/被本轮试过）→ 重新分配并改写绑定。''', '''    const fresh = pool.filter((k) => !isCooling(k.name));
    if (!fresh.length) return null;
    // 首次见到该会话，或它原来绑定的 key 已不可用（冷却/被本轮试过/不属于当前最高
    // priority 层）→ 重新分配并改写绑定。''')

sub('Q4c scoreOf', '''    const scoreOf = (k) => load[k.name] / (k.weight > 0 ? k.weight : 1);''', '''    // 权重来源（2026-10-01）：优先用 quota 同步得到的动态权重（月已用比例驱动），
    // 拉取失败或该 key 无额度行时回落到 keys.json 的静态 weight。
    const scoreOf = (k) => load[k.name] / effWeight(k);''')

sub('Q4d sticky fresh', '''  const held = state.sticky ? candidates.find((k) => k.name === state.sticky) : null;
  if (held && !isCooling(held.name)) return held;

  const fresh = candidates.filter((k) => !isCooling(k.name));''', '''  const held = state.sticky ? pool.find((k) => k.name === state.sticky) : null;
  if (held && !isCooling(held.name)) return held;

  const fresh = pool.filter((k) => !isCooling(k.name));''')

# ── Q5: reload 时也同步一次 quota ───────────────────────────────────────
sub('Q5 reload', '''  resetAgents('config reload');
  if (CFG.listen.port !== oldPort) {''', '''  resetAgents('config reload');
  syncQuota().catch(() => {});
  if (CFG.listen.port !== oldPort) {''')

# ── Q6: /health 顶层加 quota 状态 ───────────────────────────────────────
sub('Q6 health top', '''      upstreamNote: '未声明 upstream 的 key 的缺省上游；每个 key 的实际上游见 keys[].upstream',''', '''      upstreamNote: '未声明 upstream 的 key 的缺省上游；每个 key 的实际上游见 keys[].upstream',
      priorityTiers: (() => {
        const m = {};
        for (const k of keys) m[k.priority] = (m[k.priority] || 0) + 1;
        return m;
      })(),
      quotaSync: {
        enabled: CFG.quotaSync?.enabled !== false,
        url: CFG.quotaSync?.url || '',
        mode: CFG.quotaSync?.mode || 'used',
        ok: quotaState.ok,
        ageSec: quotaState.at ? Math.round((now - quotaState.at) / 1000) : null,
        error: quotaState.error,
        detail: quotaState.detail,
      },''')

# ── Q7: /health 逐 key 报 priority 与有效权重 ───────────────────────────
sub('Q7 health keys', '''          lastUsedAt: ks.lastUsedAt,
          note: k.note,
          upstream: upstreamLabel(resolveUpstream(k)),
          models: k.models ? k.models.length : '(all)',
        };''', '''          lastUsedAt: ks.lastUsedAt,
          note: k.note,
          upstream: upstreamLabel(resolveUpstream(k)),
          models: k.models ? k.models.length : '(all)',
          priority: k.priority,
          quotaAccount: k.quotaAccount,
          weightStatic: k.weight,
          weightEffective: Number(effWeight(k).toFixed(3)),
          weightFromQuota: quotaWeights.has(k.quotaAccount || k.name),
        };''')

# ── Q8: 启动时拉起 quota 同步 ───────────────────────────────────────────
sub('Q8 startup', '''pruneLogs();
setInterval(pruneLogs, 6 * 3600 * 1000).unref();''', '''pruneLogs();
setInterval(pruneLogs, 6 * 3600 * 1000).unref();

// 额度驱动的动态权重：启动即同步一次，之后按 intervalMs 滚动刷新。
// 失败不影响转发 —— selectKey 会回落到静态 weight。
syncQuota().then(() => {
  log(`QUOTA-SYNC ${quotaState.ok ? 'ok' : 'failed'} ${quotaState.ok ? quotaState.detail.join(' | ') : quotaState.error}`);
}).catch(() => {});
setInterval(() => {
  syncQuota().catch(() => {});
}, Math.max(10000, Number(CFG.quotaSync?.intervalMs) || 60000)).unref();''')

# ── 执行 ────────────────────────────────────────────────────────────────
fails = []
for name, old, new in REPL:
    n = src.count(old)
    if n != 1:
        fails.append(f'{name}: 命中 {n} 次（期望 1）')
        continue
    src = src.replace(old, new)

if fails:
    print('PATCH FAILED — 未落盘：')
    for f in fails:
        print('  -', f)
    sys.exit(1)

SRC.write_text(src, encoding='utf-8')
print(f'PATCH OK — {len(REPL)} 处全部命中 1 次')
print(f'lines: {orig.count(chr(10))} -> {src.count(chr(10))}')
