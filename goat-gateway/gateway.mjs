// gateway.mjs — Command Code GOAT 多 key 网关
//
// 作用：在 127.0.0.1 上暴露一个 OpenAI 兼容入口，把请求转发到 api.commandcode.ai，
//      并在多个 GOAT 套餐 key 之间「轮询均衡 + 故障自动跳过」。
//      对 reasonix / dsh 完全透明：它们只看到 baseURL 变成本机地址，key 由网关代换。
//
// 退出码：0 正常退出，2 配置/启动失败。

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createLoopGuard, SseDeltaParser, DEFAULT_LOOP_GUARD } from './loop-guard.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const p = (...a) => path.join(ROOT, ...a);

// 允许用环境变量隔离实例（方便 selftest，不影响生产默认路径）
const CONFIG_PATH = process.env.GATEWAY_CONFIG || p('config.json');
const KEYS_PATH = process.env.GATEWAY_KEYS || p('keys.json');
const STATE_FILE = process.env.GATEWAY_STATE || p('state.json');
const LOG_DIR = process.env.GATEWAY_LOG_DIR || p('logs');
const ALLOWLIST_PATH = process.env.GATEWAY_ALLOWLIST || p('model-allowlist.json');

const DEFAULTS = {
  listen: { host: '127.0.0.1', port: 8788 },
  upstream: {
    origin: 'https://api.commandcode.ai',
    basePath: '/provider/v1',
    localPrefix: '/v1',
    // 统一上游 User-Agent：不再原样透传客户端指纹。
    // 原因：reasonix(Go-http-client) 与 dsh(undici) 头不同，Cloudflare 对它们的风控命中率不同，
    // 会出现「同一个 key，一个客户端 200、另一个 1010」。置空字符串 = 保持透传。
    userAgent: 'commandcode-goat-gateway/1.0',
    // 这些客户端自定义头只在本地用于「会话粘 key」，对上游没有意义，还会多一个指纹。
    stripClientHeaders: ['x-reasonix-', 'x-session-id', 'x-conversation-id', 'x-topic-id'],
    // 上游连接复用开关（2026-09-24 加入）。
    // 现象：复用长连接时，上游 SSE 速度会从 ~300 tok/s 一路衰减到个位数
    //（同一分钟内：直连 315 tok/s / 走网关 9 tok/s，且网关侧耗时 16s→58s→90s→221s 递增）。
    // false = 每个上游请求新建 TLS 连接，牺牲握手时间换稳定吞吐。true = 复用（旧行为）。
    keepAlive: true,
    // 上游连接最大存活时间（毫秒）。超过后下一个请求重建 Agent（新 TLS + 重新解析 DNS）。
    // 动机：2026-09-24 15:23~15:39 网关侧出现十几分钟的「上游流突然变慢」
    //（网关 9~90 tok/s，同一分钟直连 315 tok/s；网关侧耗时 16s→58s→90s→221s 
    // 递增），_gateway/reload 重建连接后立刻恢复 3.5s。0 = 不回收。
    agentMaxAgeMs: 300000,
    // 首 chunk 超时（毫秒）：从请求发出到上游第一个 body chunk 到达。大上下文 prefill 可能
    // 合法地花几十秒到几分钟，所以这里给 180s 兜底；0 = 关闭。
    // 注意：只有还没向客户端发出任何字节时才能透明重试/换 key，和下面的 idle 超时是同一前提。
    firstChunkTimeoutMs: 180000,
    // 流式响应空闲超时（毫秒）：首个 chunk 之后，超过该时间没有任何新 chunk 就断开。
    // 动机：上游偶发 200 后长时间不出字/断流，单请求被拖到 200s+，永久污染 dsh 的
    // 「整个会话累计 decode TPS」。生产建议 30000（30s）；0 = 关闭。
    streamIdleTimeoutMs: 30000,
  },
  // strategy=prefix 时的前缀亲和参数（默认 strategy=session，不生效）：
  //   windowMs：新会话分配计数的窗口长度；maxNewSessionsPerKey：每 key 窗口内新会话软上限；
  //   prefixTtlMs：「前缀 → key」绑定 TTL；maxPrefixes：最多记住多少前缀。
  prefixAffinity: {
    windowMs: 1800000,
    maxNewSessionsPerKey: 10,
    prefixTtlMs: 1800000,
    maxPrefixes: 4000,
  },
  maxAttemptsPerRequest: 4,
  attemptsPerKey: 1,
  retryDelayMs: 250,
  retryableStatus: [401, 402, 403, 408, 429, 500, 502, 503, 504],
  // 冷却时长（毫秒）：额度/鉴权类失败冷却久一点，瞬时错误冷却短
  cooldownMs: {
    unauthorized: 1800000, // 401/403 —— key 无效或无权限，30 分钟
    quota: 600000,         // 402 —— 额度/欠费，10 分钟
    rateLimit: 60000,      // 429 —— 限流，1 分钟
    server: 15000,         // 5xx —— 上游故障，15 秒
    network: 20000,        // 网络异常，20 秒
  },
  maxBodyBytes: 64 * 1024 * 1024,
  bodyTimeoutMs: 120000,
  maxSessions: 2000,
  upstreamTimeoutMs: 900000,
  logKeepDays: 30,
  // 额度驱动的动态权重（2026-10-01 加）。只读 quota-http，不自己调上游。
  //   mode:
  //     'used'      = 月已用比例高者权重大（默认：尽快把快到期的月额度花掉）
  //     'left'      = 月剩余比例高者权重大（均衡派）
  //     'resetSoon' = 周期窗口 resetAt 更近者权重大（「套餐结束时间更近的优先」）
  //     'resetLate' = 周期窗口 resetAt 更远者权重大
  //   resetWindow: 时间型口径读哪个窗口的 resetAt —— GOAT 只有 5h / weekly 两个
  //     rolling window 带时间戳，月度池属 billing cycle、没有日期；官方余额行
  //     没有窗口，时间型口径下自动跳过、保持静态 weight。
  //   min/maxWeight: 把 score∈[0,1] 线性映射到的权重区间。
  quotaSync: {
    enabled: true,
    url: 'http://127.0.0.1:8790/quota',
    intervalMs: 60000,
    timeoutMs: 15000,
    mode: 'used',
    resetWindow: 'weekly',
    minWeight: 0.2,
    maxWeight: 5,
  },
};

// ── 配置与 key 池（reload 时可重读；keys.json 支持 mtime 热重载）──────────
function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

let CFG = null;

function loadConfig() {
  let rawCfg;
  try {
    rawCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    if (CFG) {
      log(`CONFIG-WARN 读取/解析失败，保留上一版配置：${e.message}`);
      return CFG;
    }
    rawCfg = {};
  }
  return {
    ...DEFAULTS,
    ...rawCfg,
    listen: { ...DEFAULTS.listen, ...(rawCfg.listen || {}) },
    upstream: { ...DEFAULTS.upstream, ...(rawCfg.upstream || {}) },
    cooldownMs: { ...DEFAULTS.cooldownMs, ...(rawCfg.cooldownMs || {}) },
    loopGuard: { ...DEFAULT_LOOP_GUARD, ...(rawCfg.loopGuard || {}) },
  };
}

CFG = loadConfig();

// ── upstream 解析（多上游）──────────────────────────────────────────────
//
// 2026-10-01：key 池从「单一上游的多个同质账号」升级为「可跨上游的异质 key 池」，
// 于是官方 key（api.deepseek.com）能与 GOAT key（api.commandcode.ai）平级参与
// session 粘滞 / 冷却 / 重试。
//
// 兼容性靠「缺省继承」实现：key 不写 upstream 就完全用 CFG.upstream —— 既有 GOAT key
// 一行都不用改，行为逐位不变。basePath 允许是空串（官方 origin 直接接 /chat/completions，
// 中间没有版本段）。
function resolveUpstream(keyEntry) {
  const u = (keyEntry && keyEntry.upstream) || {};
  const origin = typeof u.origin === 'string' && u.origin ? u.origin : CFG.upstream.origin;
  const basePath = typeof u.basePath === 'string' ? u.basePath : CFG.upstream.basePath;
  return { origin, basePath, url: new URL(origin) };
}
function upstreamLabel(u) {
  return u.origin + u.basePath;
}
// 按协议取默认端口 —— 旧代码写死 `|| 443`，对 http 上游是错的（只在带显式端口的
// selftest 上游上碰巧没暴露）。
function defaultPort(protocol) {
  return protocol === 'http:' ? 80 : 443;
}

// ── 上游连接池：按 origin 分开 ───────────────────────────────────────────
//
// keep-alive 连接绑定到具体的 (protocol, host, port)，不能跨 origin 复用 ——
// 所以 agent 从单例变成 Map<origin, {agent, bornAt}>。定期重建的理由不变：
// 长寿命连接可能进入「慢速」状态，换新连接即恢复。
let agents = new Map();

function makeAgent(u) {
  const lib = u.url.protocol === 'http:' ? http : https;
  const keepAlive = CFG.upstream ? CFG.upstream.keepAlive !== false : true;
  return new lib.Agent({ keepAlive, maxSockets: 128, maxFreeSockets: keepAlive ? 32 : 0, timeout: 60000 });
}

function resetAgents(reason) {
  for (const e of agents.values()) {
    try { e.agent.destroy(); } catch {}
  }
  agents.clear();
  if (reason) log(`AGENT-RECYCLE ${reason}`);
}

function getAgent(u) {
  const key = u.url.origin;
  const maxAge = Number(CFG.upstream?.agentMaxAgeMs ?? 300000);
  let e = agents.get(key);
  if (e && maxAge > 0 && Date.now() - e.bornAt > maxAge) {
    try { e.agent.destroy(); } catch {}
    log(`AGENT-RECYCLE origin=${key} age=${Date.now() - e.bornAt}ms > ${maxAge}ms`);
    e = null;
  }
  if (!e) {
    e = { agent: makeAgent(u), bornAt: Date.now() };
    agents.set(key, e);
  }
  return e.agent;
}

function reloadRuntimeConfig() {
  const oldPort = CFG.listen.port;
  CFG = loadConfig();
  LOOP_GUARD = createLoopGuard(CFG.loopGuard, log, LOG_DIR);
  resetAgents('config reload');
  syncQuota().catch(() => {});
  if (CFG.listen.port !== oldPort) {
    log(`WARN config reload: listen.port 从 ${oldPort} 变成 ${CFG.listen.port}；端口需要重启进程才会生效`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let keysCache = { mtime: 0, keys: [] };
function loadKeys() {
  let st;
  try {
    st = fs.statSync(KEYS_PATH);
  } catch {
    return keysCache.keys;
  }
  if (st.mtimeMs === keysCache.mtime) return keysCache.keys;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
  } catch (e) {
    log(`KEYS-WARN 读取/解析失败，保留上一版 keys：${e.message}`);
    return keysCache.keys;
  }
  if (!raw || !Array.isArray(raw.keys)) {
    log('KEYS-WARN keys.json 结构非法，保留上一版 keys');
    return keysCache.keys;
  }
  const keys = (raw.keys || [])
    .filter((k) => k && typeof k.key === 'string' && k.key.trim().length > 0)
    .map((k) => ({
      name: k.name || k.key.slice(0, 12),
      key: k.key.trim(),
      enabled: k.enabled !== false,
      note: k.note || '',
      // 权重（2026-09-29 加）：默认 1。只影响「新会话」的分配倾向 —— 越大越容易被选中。
      // 用在 selectKey() 的 score = 绑定会话数 / weight 上。
      weight: (() => {
        const w = Number(k.weight);
        return Number.isFinite(w) && w > 0 ? w : 1;
      })(),
      // ── 多上游（2026-10-01 加）──────────────────────────────────────────
      // upstream：该 key 打向哪个 origin/basePath；不写 = 继承 CFG.upstream。
      upstream: (k.upstream && typeof k.upstream === 'object' && !Array.isArray(k.upstream)) ? k.upstream : null,
      // models：该 key 在「客户端模型 id」维度上能服务的集合。不写/空数组 = 不限制。
      // 用于候选集过滤：请求 gpt-6-luna 时官方 key 直接不进候选，而不是让它去撞 400。
      models: Array.isArray(k.models)
        ? k.models.filter((x) => typeof x === 'string' && x.length > 0)
        : null,
      // modelMap：客户端 id → 该上游原生 id。命中时 forward() 会改写 body.model。
      // 例：deepseek/deepseek-v4.1-flash → deepseek-flash（官方用的是裸 id）。
      modelMap: (k.modelMap && typeof k.modelMap === 'object' && !Array.isArray(k.modelMap)) ? k.modelMap : null,
      // priority（2026-10-01 加）：越大越优先。selectKey 只在最高优先级那一层里做均衡，
      // 低层 key 仅当高层全部不可用时才参与。缺省 100 —— 全部 key 不写时行为与改动前一致。
      // 用途：官方 key 设 0 → 兜底层，「非必要不用」。
      priority: (() => {
        const p = Number(k.priority);
        return Number.isFinite(p) ? p : 100;
      })(),
      // quotaAccount（2026-10-01 加）：从 quota-http 的哪一行取额度。缺省用 key 的 name。
      quotaAccount: typeof k.quotaAccount === 'string' && k.quotaAccount ? k.quotaAccount : (k.name || ''),
    }));
  keysCache = { mtime: st.mtimeMs, keys };
  return keys;
}

/**
 * 模型白名单（2026-09-30 加）。
 *
 * upstream 的 /v1/models 列的是「平台提供的全部模型」(86 个)，而本套餐只有 61 个有权限。
 * dsh 会把那份列表同步成模型选择器 —— 于是 claude-* / gpt-6-sol / gemini-* 全出现在 UI 里，
 * 点下去必然失败（403 MODEL_NOT_IN_PLAN / 认证失败），很容易被误判成"网关坏了"。
 *
 * 与 keys.json 同样的 mtime 热重载：改完 model-allowlist.json 立即生效，不必重启进程。
 * @returns 白名单 Set；文件缺失/为空时返回 null，表示「不干预」——这是安全兜底，
 *          宁可不过滤，也绝不能因为配置出错而把模型列表清空。
 */
// ── 额度驱动的动态权重（2026-10-01 加）──────────────────────────────────
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
    const mode = String(qs.mode || 'used').toLowerCase();
    const qsw = String(qs.resetWindow || 'weekly').toLowerCase() === 'fivehour' ? 'fiveHourReset' : 'weeklyReset';
    const timed = mode === 'resetsoon' || mode === 'resetlate';
    const now = Date.now();
    const remOf = (row) => {
      const t = Number(row && row[qsw]);
      return Number.isFinite(t) && t > 0 ? t - now : null;
    };

    // 时间型口径要先把所有 key 的「剩余时长」摊开做 min-max 归一化：
    // 最快到期的那个 → urgency = 1（最紧迫）。
    let minRem = Infinity;
    let maxRem = -Infinity;
    if (timed) {
      for (const row of rows) {
        const r = remOf(row);
        if (r === null) continue;
        if (r < minRem) minRem = r;
        if (r > maxRem) maxRem = r;
      }
      if (!Number.isFinite(minRem)) throw new Error(`no ${qsw} in quota rows`);
    }

    const next = new Map();
    const detail = [];
    for (const row of rows) {
      const name = String((row && row.name) || '');
      if (!name || (row && row.error)) continue;
      let score;
      let label;
      if (timed) {
        const r = remOf(row);
        if (r === null) continue; // 官方余额行没有周期窗口 → 跳过，保持静态 weight
        const span = maxRem - minRem;
        const urgency = span > 0 ? (maxRem - r) / span : 0.5; // 剩余越短 → 越接近 1
        score = mode === 'resetsoon' ? urgency : 1 - urgency;
        label = `剩 ${(r / 3600000).toFixed(1)}h`;
      } else {
        const ratio = monthUsedRatio(row);
        if (ratio === null) continue;
        score = mode === 'left' ? 1 - ratio : ratio;
        label = `月 ${(ratio * 100).toFixed(1)}%`;
      }
      const w = lo + (hi - lo) * score;
      next.set(name, w);
      detail.push(`${name}: ${label} -> w${w.toFixed(2)}`);
    }
    quotaWeights = next;
    quotaState = { at: now, ok: true, error: '', mode, detail };
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

let allowCache = { mtime: 0, ids: null };
function loadModelAllowlist() {
  try {
    const st = fs.statSync(ALLOWLIST_PATH);
    if (st.mtimeMs === allowCache.mtime) return allowCache.ids;
    const raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
    const list = Array.isArray(raw && raw.models)
      ? raw.models.filter((x) => typeof x === 'string' && x.length > 0)
      : [];
    allowCache = { mtime: st.mtimeMs, ids: list.length ? new Set(list) : null };
    log(`ALLOWLIST ${allowCache.ids ? 'loaded ' + allowCache.ids.size + ' models' : 'empty -> no filtering'}`);
    return allowCache.ids;
  } catch {
    allowCache = { mtime: 0, ids: null };
    return null;
  }
}

// ── 运行时状态（冷却、轮询指针、计数）─────────────────────────────────────
const state = readJSON(STATE_FILE, null) || {
  rr: 0,
  sticky: '',
  sessions: {},
  prefixBindings: {},
  prefixWindow: { start: 0, counts: {}, rr: 0 },
  keys: {},
  stats: { requests: 0, forwarded: 0, retries: 0, switched: 0, since: new Date().toISOString() },
};
state.stats ||= { requests: 0, forwarded: 0, retries: 0, switched: 0, since: new Date().toISOString() };
state.keys ||= {};
state.sticky ||= '';
state.sessions ||= {};
state.prefixBindings ||= {};
state.prefixWindow ||= { start: 0, counts: {}, rr: 0 };

let stateDirty = false;
let stateSaving = false;
function saveState() {
  if (!stateDirty || stateSaving) return;
  stateSaving = true;
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    try {
      fs.renameSync(tmp, STATE_FILE);
    } catch (e) {
      // Windows 某些文件系统上 rename 覆盖可能失败，退回 copy+unlink。
      fs.copyFileSync(tmp, STATE_FILE);
      try { fs.unlinkSync(tmp); } catch {}
    }
    stateDirty = false;
  } catch (e) {
    stateDirty = true;
    log(`WARN 状态写入失败: ${e.message}`);
    try { fs.unlinkSync(tmp); } catch {}
  } finally {
    stateSaving = false;
  }
}
setInterval(saveState, 2000).unref();

function kstate(name) {
  state.keys[name] ||= { ok: 0, fail: 0, cooldownUntil: 0, lastStatus: 0, lastError: '', lastUsedAt: '' };
  return state.keys[name];
}
function isCooling(name) {
  return kstate(name).cooldownUntil > Date.now();
}
function isCloudflareBlock(detail) {
  // Cloudflare 的 1010 是“浏览器/客户端指纹被拦”，不是 key 失效；
  // 用 30 分钟 unauthorized 冷却会把两个账号都误伤，所以单独识别。
  return /error code:\s*1010|cloudflare|cf-ray|attention required/i.test(String(detail || ''));
}
function isModelNotInPlan(detail) {
  // 403 里混着一类不是「key 失效」的错误：套餐不含该 model。
  //   {"message":"MODEL_NOT_IN_PLAN: GPT-6 Astra available in Provider and above plans or extra on demand usage",
  //    "type":"permission_error","code":"FORBIDDEN"}
  // 套餐限制对所有 key 一视同仁，换 key 不可能解决；而 403 默认走 unauthorized 冷却
  // （cooldownMs.unauthorized = 10 分钟），于是「一个 model 不在套餐」会把整个网关打瘺。
  // 2026-09-29 实测：一个探测请求打中 gpt-6-astra，两个 key 各冷却 10 分钟，
  // 之后 15 分钟内每个请求都 503「所有 key 均失败（已尝试 无）」（tried= 为空）。
  return /MODEL_NOT_IN_PLAN|not available in .{0,60}plan/i.test(String(detail || ''));
}
// 额度耗尽（2026-10-01）。上游对 individual-goat 计划是用 **HTTP 400** 表达额度不足的：
//   {"type":"invalid_request_error","message":"You have insufficient credits to make this request..."}
// 而 400 既不在 retryableStatus 里（所以旧代码连 body 都不看就原样透传），旧分类逻辑又只在
// 402 上判 quota ⇒ 耗尽的 key 永不冷却、永不换 key，state.sessions 还把会话钉死在它上面。
// 实测代价：qq 月额度用到 99.24% 后，1717 个会话里 914 个仍全部绑在 qq，163 的 11.95 余量完全不可见。
function isQuotaExhausted(detail) {
  return /insufficient credits|out of credits|quota exceeded|exceeded your current quota|credit balance is too low|billing hard limit/i.test(
    String(detail || ''),
  );
}

function cooldownReason(status, detail = '') {
  if (isCloudflareBlock(detail)) return ['network', CFG.cooldownMs.network];
  // 额度耗尽：优先于下面所有状态码规则（含 400 这种非标准表达）。
  if (isQuotaExhausted(detail)) return ['quota', CFG.cooldownMs.quota];
  // 第三类 403（2026-09-29）：不是 key 失效，而是「这个 model 的后端 provider 没绑定」。
  // 证据：同一个 key 打 deepseek/deepseek-v4.1-flash 得 200，打 google/gemini-3.7-flash 得
  //   403 {"message":"Authentication failed. Please check your credentials.","type":"permission_error"}
  // 根因在那个 model 上，换 key 无用；按 key 走 unauthorized 冷却（原 1800s）会让整个
  // 网关停摆，客户端只看得到「所有 key 均失败」。给一个短冷却保住可用性。
  if (/Authentication failed\. Please check your credentials/i.test(String(detail || '')))
    return ['authModel', Number(CFG.cooldownMs.authModel) || 30000];
  if (status === 401 || status === 403) return ['unauthorized', CFG.cooldownMs.unauthorized];
  if (status === 402) return ['quota', CFG.cooldownMs.quota];
  if (status === 429) return ['rateLimit', CFG.cooldownMs.rateLimit];
  if (status >= 500) return ['server', CFG.cooldownMs.server];
  return ['network', CFG.cooldownMs.network];
}
function applyCooldown(name, status, detail) {
  const [reason, ms] = cooldownReason(status, detail);
  const ks = kstate(name);
  ks.fail += 1;
  ks.lastStatus = status;
  ks.lastError = String(detail || '').slice(0, 300);
  ks.cooldownUntil = Date.now() + ms;
  ks.cooldownReason = reason;
  stateDirty = true;
  log(`COOLDOWN key=${name} reason=${reason} status=${status} for=${Math.round(ms / 1000)}s :: ${ks.lastError}`);
}
function clearCooldown(name) {
  const ks = kstate(name);
  ks.cooldownUntil = 0;
  ks.cooldownReason = '';
  ks.ok += 1;
  ks.lastUsedAt = new Date().toISOString();
  stateDirty = true;
}

// 轮询（仅 strategy=round-robin 时用）：在「已启用且未冷却」的 key 里按顺序取下一个
function pickKey(pool) {
  const n = pool.length;
  if (!n) return null;
  state.rr = (state.rr + 1) % 1000000;
  return pool[state.rr % n];
}

// ── 会话指纹：按会话粘 key 判定的「身份」──────────────────────────────────
//
// 优先使用 x-reasonix-session-id / x-session-id 等 session header；
// 没有 header 时用第一条 user message 做稳定指纹，最后才退回前两条消息。
// 无 messages 的请求（如 GET /v1/models）返回空串，走全局粘滞分支。
function sessionFingerprint(parsed, headers = {}) {
  for (const name of ['x-reasonix-session-id', 'x-session-id', 'x-conversation-id', 'x-topic-id']) {
    const v = headers[name];
    if (typeof v === 'string' && v.trim()) {
      return 'h:' + crypto.createHash('sha1').update(v.trim()).digest('hex').slice(0, 16);
    }
  }
  if (!parsed || !Array.isArray(parsed.messages) || !parsed.messages.length) return '';
  try {
    const firstUser = parsed.messages.find((m) => m && m.role === 'user');
    const basis = firstUser ? [firstUser] : parsed.messages.slice(0, 2);
    const head = basis.map((m) => {
      const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
      return `${m.role || '?'}|${c}`;
    });
    return crypto.createHash('sha1').update(head.join('\u0000')).digest('hex').slice(0, 16);
  } catch {
    return '';
  }
}

// sessions 表只用于「记住某会话绑在哪个 key」，超过上限按最久未用淘汰
function pruneSessions() {
  const names = Object.keys(state.sessions);
  if (names.length <= CFG.maxSessions) return;
  names.sort((a, b) => (state.sessions[a].t || 0) - (state.sessions[b].t || 0));
  for (const n of names.slice(0, names.length - CFG.maxSessions)) delete state.sessions[n];
}

// 选 key（默认 strategy=session）
//
// 为什么不做轮询：上游 prompt cache（KV cache）按账号隔离，同一段对话前缀交替打到两个账号，
// 两边缓存都被打断，换 key 的那个请求输入几乎全按未命中计费 —— 本套餐命中 ¥0.02019/M
// vs 未命中 ¥1.0095/M（差 ~50 倍）。三种策略：
//   session（默认）同一会话永远粘同一个 key（保缓存），不同会话按指纹分散（用上双账号并发）
//   sticky         全局只粘一个 key，只在其失败时换（最保守）
//   round-robin    交替使用（仅调试，会打断缓存、显著抬高成本）
// 会话指纹可能是 16 位十六进制（消息指纹），也可能是 "h:<16hex>"（客户端 session header）。
// 早期直接 parseInt(fp.slice(0,8),16)：header 形态会得到 NaN，balanced[NaN] === undefined，
// 随后读 .name 抛异常 → 整个请求 500。这里统一转成稳定整数。
// ── 前缀亲和（strategy=prefix）────────────────────────────────────────────
// 目标：把「共享同一段 system/tools/model 前缀」的新会话尽量放到同一个上游账号，
// 以提高跨会话 prompt cache 命中；同时用窗口内新会话数软上限避免单账号被打爆。
// 注意：这里无法读到上游真实 KV cache，只能用自己的「前缀 → key」近似；
// 已有会话仍然由 state.sessions[fp] 忠实绑定，本策略只影响新会话的首次分配。
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function prefixFingerprint(parsed) {
  if (!parsed || typeof parsed !== 'object') return '';
  try {
    const system = Array.isArray(parsed.messages)
      ? parsed.messages.filter((m) => m && m.role === 'system')
      : [];
    const tools = parsed.tools;
    const hasTools = Array.isArray(tools) ? tools.length > 0 : Boolean(tools);
    if (!system.length && !hasTools) return '';
    const basis = { model: parsed.model || '', tools: tools ?? null, system };
    return 'p:' + crypto.createHash('sha1').update(stableStringify(basis)).digest('hex').slice(0, 16);
  } catch {
    return '';
  }
}

function currentPrefixWindow() {
  const windowMs = Math.max(0, Number(CFG.prefixAffinity?.windowMs ?? 1800000));
  state.prefixWindow ||= { start: 0, counts: {}, rr: 0 };
  state.prefixWindow.counts ||= {};
  if (!windowMs || Date.now() - (state.prefixWindow.start || 0) >= windowMs) {
    state.prefixWindow = { start: Date.now(), counts: {}, rr: 0 };
    stateDirty = true;
  }
  return state.prefixWindow;
}

function prunePrefixBindings() {
  const ttl = Math.max(0, Number(CFG.prefixAffinity?.prefixTtlMs ?? 1800000));
  const max = Math.max(0, Number(CFG.prefixAffinity?.maxPrefixes ?? 4000));
  const now = Date.now();
  state.prefixBindings ||= {};
  for (const [k, v] of Object.entries(state.prefixBindings)) {
    if (ttl > 0 && now - (v.t || 0) > ttl) delete state.prefixBindings[k];
  }
  const names = Object.keys(state.prefixBindings);
  if (max > 0 && names.length > max) {
    names.sort((a, b) => (state.prefixBindings[a].t || 0) - (state.prefixBindings[b].t || 0));
    for (const n of names.slice(0, names.length - max)) delete state.prefixBindings[n];
  }
}

function choosePrefixKey(fresh, prefixFp) {
  const cfg = CFG.prefixAffinity || {};
  const cap = Math.max(0, Number(cfg.maxNewSessionsPerKey ?? 10));
  const win = currentPrefixWindow();
  const counts = win.counts;
  const bump = (name) => {
    counts[name] = (counts[name] || 0) + 1;
    stateDirty = true;
  };

  // 1) 这个前缀最近已经绑过某个 key，且该 key 在窗口内还没到软上限
  if (prefixFp) {
    const bound = state.prefixBindings?.[prefixFp];
    if (bound) {
      const held = fresh.find((k) => k.name === bound.key);
      if (held && (cap <= 0 || (counts[held.name] || 0) < cap)) {
        bound.t = Date.now();
        bump(held.name);
        return held;
      }
    }
  }

  // 2) 选窗口内新会话数最少的 key；并列时轮转，避免固定偏向
  let min = Infinity;
  for (const k of fresh) {
    const c = counts[k.name] || 0;
    if (c < min) min = c;
  }
  const tied = fresh.filter((k) => (counts[k.name] || 0) === min);
  win.rr = ((win.rr || 0) + 1) % Math.max(1, tied.length);
  const pick = tied[win.rr % tied.length];
  bump(pick.name);

  // 3) 只有前缀还没有绑定、或原绑定的 key 已不在候选里，才改写前缀绑定。
  //    这样「前缀的热 key」不会被 overflow 请求覆盖掉。
  if (prefixFp) {
    const prev = state.prefixBindings?.[prefixFp];
    if (!prev || !fresh.some((k) => k.name === prev.key)) {
      state.prefixBindings ||= {};
      state.prefixBindings[prefixFp] = { key: pick.name, t: Date.now() };
      log(
        `PREFIX-BIND ${prefixFp.slice(0, 10)} ${prev ? prev.key + ' -> ' : ''}${pick.name}` +
          ` (window: ${fresh.map((k) => `${k.name}=${counts[k.name] || 0}`).join(' ')})`,
      );
      prunePrefixBindings();
      stateDirty = true;
    } else {
      prev.t = Date.now();
    }
  }
  return pick;
}

function fingerprintBucket(fp, n) {
  const v = String(fp);
  const hex = v.startsWith('h:') ? v.slice(2) : v;
  let num = parseInt(hex.slice(0, 8), 16);
  if (!Number.isFinite(num)) {
    num = parseInt(crypto.createHash('sha1').update(v).digest('hex').slice(0, 8), 16);
  }
  return (Number.isFinite(num) ? num : 0) % n;
}

function selectKey(candidates, fp, prefixFp = '') {
  const strategy = String(CFG.strategy || 'session').toLowerCase();
  if (!candidates.length) return null;

  // ── priority 分层（2026-10-01 加）──────────────────────────────────────
  // 按 priority 从高到低逐层降级，只在「第一个还有未冷却 key 的层」里做负载均衡。
  // 低优先级的 key 只有高层全部冷却（或已被本请求试过 / 模型不支持）时才参与。
  // 用途：把 DeepSeek 官方 key 降为兜底层（priority 更低）——「非必要不用」。
  // 缺省 priority 100，所以全部 key 不写时与改动前逐位一致（只有一个层）。
  const prioOf = (k) => (Number.isFinite(Number(k.priority)) ? Number(k.priority) : 100);
  const tiers = [...new Set(candidates.map(prioOf))].sort((a, b) => b - a);
  // 所有层都全冷却时保持最高层 —— 后续 fresh 为空 → 返回 null，行为与改动前一致。
  let pool = tiers.length ? candidates.filter((k) => prioOf(k) === tiers[0]) : [];
  for (const p of tiers) {
    const layer = candidates.filter((k) => prioOf(k) === p);
    if (layer.some((k) => !isCooling(k.name))) { pool = layer; break; }
  }

  if (strategy === 'round-robin') return pickKey(pool.filter((k) => !isCooling(k.name)));

  if ((strategy === 'session' || strategy === 'prefix') && fp) {
    const bound = state.sessions[fp];
    if (bound) {
      const held = pool.find((k) => k.name === bound.key);
      if (held && !isCooling(held.name)) {
        bound.t = Date.now(); // 只用于 LRU 淘汰，不标脏（免得每 2 秒重写 state.json）
        return held;
      }
    }
    const fresh = pool.filter((k) => !isCooling(k.name));
    if (!fresh.length) return null;
    // 首次见到该会话，或它原来绑定的 key 已不可用（冷却/被本轮试过/不属于当前最高
    // priority 层）→ 重新分配并改写绑定。
    // 分配规则：
    //   session（默认）→ 优先落到「当前绑定会话最少」的 key，均衡双账号并发；并列时按指纹决定。
    //   prefix          → 若该前缀已有热 key 且窗口内未超软上限，优先复用；否则选窗口内新会话最少的 key。
    // 一旦切走就不再切回 —— 该会话在新 key 上继续，原 key 的缓存对它已无价值。
    const load = {};
    for (const k of fresh) load[k.name] = 0;
    for (const v of Object.values(state.sessions)) {
      if (v.key in load) load[v.key] += 1;
    }
    // 加权均衡（2026-09-29）：score = 绑定会话数 / weight。
    // 全部 weight=1 时与改动前的「取负载最小」逐位等价；weight>1 的 key 要背更多会话才打平，
    // 于是新会话更偏向它。用 +1e-9 容忍浮点误差，不对浮点用 ===。
    // 权重来源（2026-10-01）：优先用 quota 同步得到的动态权重（月已用比例驱动），
    // 拉取失败或该 key 无额度行时回落到 keys.json 的静态 weight。
    const scoreOf = (k) => load[k.name] / effWeight(k);
    let pick;
    if (strategy === 'prefix' && prefixFp) {
      pick = choosePrefixKey(fresh, prefixFp);
    } else {
      const minScore = Math.min(...fresh.map(scoreOf));
      const balanced = fresh.filter((k) => scoreOf(k) <= minScore + 1e-9);
      pick = balanced[fingerprintBucket(fp, balanced.length)];
    }
    const prev = state.sessions[fp];
    if (!prev || prev.key !== pick.name) {
      log(
        `SESSION-BIND ${fp.startsWith('h:') ? fp.slice(0, 9) : fp.slice(0, 8)} ${prev ? prev.key + ' -> ' : ''}${pick.name}` +
          ` (sessions per key: ${fresh.map((k) => `${k.name}=${load[k.name]}`).join(' ')})`,
      );
    }
    state.sessions[fp] = { key: pick.name, t: Date.now(), hits: (prev?.hits || 0) + 1 };
    stateDirty = true;
    pruneSessions();
    return pick;
  }

  // 无会话指纹，或 strategy=sticky：退化为全局粘滞
  const held = state.sticky ? pool.find((k) => k.name === state.sticky) : null;
  if (held && !isCooling(held.name)) return held;

  const fresh = pool.filter((k) => !isCooling(k.name));
  if (!fresh.length) return null;
  const next = fresh[0];
  if (next.name !== state.sticky) {
    log(`STICKY-SWITCH ${state.sticky || '(none)'} -> ${next.name}`);
    state.sticky = next.name;
    stateDirty = true;
  }
  return next;
}

// ── 日志 ────────────────────────────────────────────────────────────────
fs.mkdirSync(LOG_DIR, { recursive: true });
function log(line) {
  const ts = new Date().toISOString();
  const text = `${ts} ${line}\n`;
  process.stdout.write(text);
  try {
    const day = ts.slice(0, 10);
    fs.appendFileSync(path.join(LOG_DIR, `gateway-${day}.log`), text);
  } catch {}
}
function pruneLogs() {
  try {
    const cut = Date.now() - CFG.logKeepDays * 86400000;
    for (const f of fs.readdirSync(LOG_DIR)) {
      const full = path.join(LOG_DIR, f);
      if (fs.statSync(full).mtimeMs < cut) fs.unlinkSync(full);
    }
  } catch {}
}

// ── loop-guard：degenerate repetition 检测（2026-10-01 接入）─────────────
// 动机：agent 卡进「好。/写。/输出。」这类退化循环时，流是活的、token 照常计费，
// 现有的 streamIdleTimeoutMs 完全无效（它只测「有没有数据」，不测「数据有没有信息」）。
// 检测逻辑全在 loop-guard.mjs；这里只做接线。
//   mode='shadow'：只写 logs/loop-guard.jsonl，绝不碰转发路径。
//   mode='abort' ：命中即断上游 —— 只有断上游才能真正停止计费。
let LOOP_GUARD = createLoopGuard(CFG.loopGuard, log, LOG_DIR);

// ── hop-by-hop 头处理 ───────────────────────────────────────────────────
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
function stripHopByHop(headers) {
  for (const k of Object.keys(headers)) {
    if (HOP_BY_HOP.has(k.toLowerCase())) delete headers[k];
  }
  return headers;
}

// 从 SSE tail 中提取最后一个 "usage":{...}，支持 prompt_tokens_details 这类嵌套对象。
// 旧实现用 /"usage":\{[^}]*\}/ 会在第一个内层 } 处截断，导致日志里的 usage 不是合法 JSON。
function extractLastUsage(text) {
  const key = '"usage"';
  let idx = text.lastIndexOf(key);
  if (idx < 0) return '';
  let start = text.indexOf('{', idx + key.length);
  if (start < 0) return '';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1).replace(/\s+/g, '');
    }
  }
  return '';
}

// ── 多上游的模型兼容性与 id 映射（2026-10-01 加）────────────────────────
//
// 「key 平级」只在同一上游的能力范围内才成立：GOAT key 覆盖 61 个模型，官方 key 只有
// deepseek-flash / deepseek-v4-pro 两个，且后者用裸 id。所以候选集要多一维过滤，
// 转发前还要把客户端 id 翻译成上游原生 id。
//
// 两个函数都遵循「不声明 = 不干预」：key 没写 models 就永远进候选（既有 GOAT key 的
// 行为逐位不变），没写 modelMap 就原样转发。
function modelSupported(keyEntry, model) {
  if (!model) return true;                                  // 非 chat 请求（GET 等）不参与过滤
  const ms = keyEntry && keyEntry.models;
  if (!Array.isArray(ms) || ms.length === 0) return true;
  return ms.includes(model);
}

function mapModelFor(keyEntry, model) {
  const mm = keyEntry && keyEntry.modelMap;
  if (!model || !mm) return model;
  const to = mm[model];
  return typeof to === 'string' && to ? to : model;
}

// 改写 body.model；任何异常都退回原 body —— 宁可让上游自己去拒绝，也绝不因为
// 映射表写错而把正常请求毁在网关里。
function rewriteModel(body, newModel) {
  if (!body || !body.length) return body;
  try {
    const obj = JSON.parse(body.toString('utf8'));
    if (!obj || typeof obj !== 'object') return body;
    obj.model = newModel;
    return Buffer.from(JSON.stringify(obj), 'utf8');
  } catch {
    return body;
  }
}

// ── 路径映射：本地 /v1/xxx  →  上游 /provider/v1/xxx ─────────────────────
function mapPath(url, up) {
  const u = new URL(url, 'http://localhost');
  let pathname = u.pathname;
  const localPrefix = CFG.upstream.localPrefix;
  const basePath = up ? up.basePath : CFG.upstream.basePath;
  if (localPrefix && pathname.startsWith(localPrefix)) pathname = pathname.slice(localPrefix.length);
  if (!pathname.startsWith('/')) pathname = '/' + pathname;
  // 只规范化拼接处，别碰 query —— 否则 ?a=x//y 这类参数会被破坏
  return basePath.replace(/\/+$/, '') + pathname + u.search;
}

// ── 单次上游转发；成功即原样转发给客户端并返回 {ok:true}（含流空闲超时保护）───
function forward(clientReq, clientRes, keyEntry, body, meta) {
  return new Promise((resolve) => {
    let clientGone = false;
    let responseStarted = false;
    let streamIdleTimer = null;
    let firstChunkTimer = null;
    const clearStreamIdle = () => {
      if (streamIdleTimer) {
        clearTimeout(streamIdleTimer);
        streamIdleTimer = null;
      }
    };
    const clearFirstChunk = () => {
      if (firstChunkTimer) {
        clearTimeout(firstChunkTimer);
        firstChunkTimer = null;
      }
    };
    const clearIdleTimers = () => {
      clearStreamIdle();
      clearFirstChunk();
    };
    const up = resolveUpstream(keyEntry);
    const target = mapPath(clientReq.url, up);
    // 模型改写：客户端 id → 该 key 上游的原生 id。只在命中映射表时才重新序列化 body，
    // 不影响 GOAT 那些 id 本来就一致的请求（绝大多数）。
    const upstreamModel = mapModelFor(keyEntry, meta.model);
    const sendBody = upstreamModel === meta.model ? body : rewriteModel(body, upstreamModel);
    const headers = stripHopByHop({ ...clientReq.headers });
    // 诊断用：先留住客户端原始 UA（下面会被统一改写成网关 UA）。
    // reasonix=Go-http-client/reasonix-*，dsh=undici —— 便于把日志按客户端归类。
    const origUa = String(clientReq.headers['user-agent'] || '');
    delete headers.host;
    delete headers.authorization;
    delete headers['content-length'];
    // 客户端自定义会话头只在本地选 key 用；转发给上游毫无用处，只会多一个可被风控的指纹
    for (const prefix of CFG.upstream.stripClientHeaders || []) {
      const pre = String(prefix).toLowerCase();
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase().startsWith(pre)) delete headers[k];
      }
    }
    // 统一 User-Agent（可配置；空字符串表示继续透传客户端原值）
    if (CFG.upstream.userAgent) headers['user-agent'] = String(CFG.upstream.userAgent);
    // 强制 upstream 不要压缩响应体（2026-09-30 修）──────────────────────────────
    //
    // WHY：headers 是从客户端**透传**过来的，而 dsh(Node undici) 默认发
    // `accept-encoding: gzip, deflate`。upstream 于是把 403 的 body 压成 gzip，
    // 而本网关读 body 时**不解压** —— 下游拿到的 detail 就成了 '…'
    // 这种二进制。后果不是"少了个提示"，而是**全部文本判别失效**：
    //     isModelNotInPlan(detail)  ✗ 匹配不到 MODEL_NOT_IN_PLAN
    //     cooldownReason(detail)    ✗ 匹配不到 "Authentication failed"
    //   → 请求落进默认分支，按 unauthorized 冷却 180s
    //   → **两个 key 一起被打死**，之后一律 503「所有 key 均失败（已尝试 无）」
    //
    // 实测证据（2026-09-30 09:12）：用户在桌面端试 gpt-6-sol 期间，连通性探测从
    // 第 15 个模型起全部 503；state.json 里 lastError 是 gzip 魔数 1f 8b 08，
    // 网关日志文件也被 GNU file 判成 data 而非文本。
    //
    // 只发 identity 即可根治，且 JSON 明文解析不受影响。
    headers['accept-encoding'] = 'identity';
    // 客户端请求已被 Node 解 chunk；转发时重新按 Buffer 设置 content-length，避免带上原始 chunked 头。
    headers.authorization = `Bearer ${keyEntry.key}`;
    if (sendBody && sendBody.length) headers['content-length'] = String(sendBody.length);
    else if (clientReq.method === 'POST') headers['content-length'] = '0';

    const reqId = clientReq._reqId;
    const model = meta.model;
    const isStream = meta.stream;
    const sess = meta.fp ? meta.fp.slice(0, 8) : '-';
    const idleMs = Math.max(0, Number(CFG.upstream?.streamIdleTimeoutMs) || 0);
    const firstChunkMs = Math.max(0, Number(CFG.upstream?.firstChunkTimeoutMs) || 0);

    // loop-guard：同一个 clientReq 可能重试换 key，每次尝试必须用独立键，
    // 否则两次尝试的文本会被拼进同一个窗口，统计失去意义。
    clientReq._attemptSeq = (clientReq._attemptSeq || 0) + 1;
    const guardKey = `${reqId}#${clientReq._attemptSeq}`;
    const guard = LOOP_GUARD;
    const guardOn = guard.enabled && isStream;
    const sseParser = guardOn ? new SseDeltaParser() : null;
    let guardFired = false;
    if (guardOn) guard.begin({ reqId: guardKey, model, sess, key: keyEntry.name, stream: isStream });

    let streamDone = false;
    const armStreamIdle = () => {
      if (!idleMs || streamDone) return;
      clearStreamIdle();
      streamIdleTimer = setTimeout(() => {
        if (streamDone) return;
        log(`STREAM-IDLE id=${reqId} key=${keyEntry.name} idle=${idleMs}ms where=stream-gap`);
        upReq.destroy(new Error(`upstream stream idle timeout after ${idleMs}ms`));
      }, idleMs);
      if (streamIdleTimer.unref) streamIdleTimer.unref();
    };
    const armFirstChunk = () => {
      if (!firstChunkMs || streamDone) return;
      clearFirstChunk();
      firstChunkTimer = setTimeout(() => {
        if (streamDone) return;
        log(`STREAM-IDLE id=${reqId} key=${keyEntry.name} idle=${firstChunkMs}ms where=waiting-first-chunk`);
        upReq.destroy(new Error(`upstream first-chunk timeout after ${firstChunkMs}ms`));
      }, firstChunkMs);
      if (firstChunkTimer.unref) firstChunkTimer.unref();
    };

    const upLib = up.url.protocol === 'http:' ? http : https;
    const upReq = upLib.request(
      {
        protocol: up.url.protocol,
        hostname: up.url.hostname,
        port: up.url.port || defaultPort(up.url.protocol),
        path: target,
        method: clientReq.method,
        headers,
        agent: getAgent(up),
      },
      (upRes) => {
        const status = upRes.statusCode || 0;
        const elapsed = () => Date.now() - upReq._startTs;

        // 400 也要走这条「先读 body 再决定」的路：上游用 400 + insufficient credits 表达额度耗尽
        //（见 isQuotaExhausted）。若读完发现它只是个普通 400，就原样补发给客户端（PASSTHROUGH-400）。
        const sniff400 = Number(status) === 400;
        if (CFG.retryableStatus.includes(status) || sniff400) {
          // 失败响应：读一小段用于日志/诊断，绝不发给客户端 —— 这样客户端还没收到任何字节，
          // 换 key 重试对它是完全透明的。
          let done = false;
          const finish = (result) => {
            if (done) return;
            done = true;
            clearIdleTimers();
            resolve(result);
          };
          const chunks = [];
          let len = 0;
          upRes.on('data', (c) => {
            clearFirstChunk();
            armStreamIdle();
            if (len < (sniff400 ? 262144 : 8192)) {
              chunks.push(c);
              len += c.length;
            }
          });
          upRes.on('aborted', () => {
            finish({ ok: false, status: 0, body: 'upstream aborted before body end', clientGone });
          });
          upRes.on('error', (e) => {
            finish({
              ok: false,
              status: 0,
              body: `${e.code || 'ERROR'}: ${e.message}`,
              clientGone,
            });
          });
          upRes.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            log(
              `FAIL id=${reqId} ${clientReq.method} ${target} key=${keyEntry.name} status=${status} ${elapsed()}ms` +
                ` sess=${sess} model=${model} stream=${isStream}` +
                (isCloudflareBlock(text) ? ' cloudflare=1010' : '') +
                ` clientUa=${JSON.stringify(origUa)} ua=${JSON.stringify(String(headers['user-agent'] || ''))} body=${JSON.stringify(text.slice(0, 400))}`,
            );
            // 400 且不是额度耗尽：这是真正的客户端/参数错误，调用方必须看到上游原话。
            // 此刻还没向客户端写过任何字节（responseStarted 仍为 false），补发即可。
            if (sniff400 && !isQuotaExhausted(text)) {
              let sent = true;
              try {
                clientRes.writeHead(status, stripHopByHop({ ...upRes.headers }));
                if (clientReq.method !== 'HEAD') clientRes.write(text);
                clientRes.end();
                responseStarted = true;
              } catch (e) {
                sent = false;
                log(`PASSTHROUGH-400-WRITE-FAIL id=${reqId} ${e.message}`);
                try { clientRes.destroy(); } catch {}
                finish({ ok: false, status: 0, body: `client write failed: ${e.message}`, clientGone: true });
              }
              if (sent) {
                log(
                  `PASSTHROUGH-400 id=${reqId} ${clientReq.method} ${target} key=${keyEntry.name} status=${status} ${elapsed()}ms` +
                    ` bytes=${text.length} body=${JSON.stringify(text.slice(0, 200))}`,
                );
                finish({ ok: true, status, passedThrough: true });
              }
              return;
            }
            finish({ ok: false, status, body: text, clientGone });
          });
          return;
        }

        // 正常响应（含 SSE 流）：先等第一个 chunk 到达再 writeHead。
        // 这样「上游 200 后长时间不出字」仍算未对客户端表态，可以透明重试/换 key；
        // 一旦已有字节发给客户端（responseStarted=true），就只能做 idle 断开保护，不能再重试。
        const outHeaders = stripHopByHop({ ...upRes.headers });
        let headersFlushed = false;
        let tail = '';
        const finishStream = (result) => {
          if (streamDone) return;
          streamDone = true;
          clearIdleTimers();
          if (guardOn) guard.end(guardKey, result);
          resolve(result);
        };
        const flushHeaders = () => {
          if (headersFlushed) return true;
          try {
            clientRes.writeHead(status, outHeaders);
            headersFlushed = true;
            responseStarted = true;
            return true;
          } catch (e) {
            upRes.destroy();
            if (!clientRes.writableEnded) {
              try { clientRes.destroy(); } catch {}
            }
            finishStream({ ok: false, status: 0, body: `writeHead failed: ${e.message}`, clientGone: true });
            return false;
          }
        };
        // loop-guard：命中后的收尾。
        // shadow 模式什么都不做（LoopGuard 内部已记日志 + jsonl），只有 abort 模式才动手。
        const onGuardHit = (hit, channel) => {
          if (!hit || guardFired) return;
          if (guard.cfg.mode !== 'abort') return;
          guardFired = true;
          log(
            `LOOP-GUARD ABORT id=${reqId} key=${keyEntry.name} ch=${channel} at=${hit.atChars}ch` +
              ` reason=${hit.reason} fast=${hit.fast} slow=${hit.slow}` +
              (hit.period ? ` period=${hit.period.period}x${hit.period.repeats}` : ' period=none'),
          );
          // 断上游才是真正的止损：provider 一停就不再计费。
          try { upRes.destroy(); } catch {}
          // 给客户端一个合法的 SSE 收尾。直接 destroy 的话 dsh 会当成网络错误并走重试，
          // 反而更费额度 —— 必须让它正常读到 [DONE] 然后干净结束。
          try {
            if (!clientRes.writableEnded) {
              clientRes.write('data: [DONE]\n\n');
              clientRes.end();
            }
          } catch {}
          finishStream({ ok: true, status, streamError: 'loop-guard abort', loopGuard: hit });
        };

        upRes.on('data', (c) => {
          if (streamDone) return;
          if (clientGone) {
            clearIdleTimers();
            upRes.destroy();
            return;
          }
          if (!flushHeaders()) return;
          clearFirstChunk();
          armStreamIdle();
          const chunkStr = c.toString('utf8');
          if (tail.length < 65536) tail += chunkStr;
          // 先喂 loop-guard 再转发：命中时本 chunk 就不再传给客户端，少吐一段循环文本。
          // 解析必须在 write 之前，所以这里用 SseDeltaParser 增量切帧（跨 chunk 也能切对）。
          if (guardOn && !guardFired) {
            for (const ev of sseParser.feed(chunkStr)) {
              const d = SseDeltaParser.extract(ev);
              if (!d) continue;
              if (d.reasoning) onGuardHit(guard.feed(guardKey, d.reasoning, 'reasoning'), 'reasoning');
              if (d.content) onGuardHit(guard.feed(guardKey, d.content, 'text'), 'text');
            }
            if (guardFired) return;
          }
          try {
            if (!clientRes.write(c)) {
              upRes.pause();
              clientRes.once('drain', () => {
                if (!streamDone && !clientGone) upRes.resume();
              });
            }
          } catch (e) {
            log(`STREAM-ERR id=${reqId} key=${keyEntry.name} client write: ${e.message}`);
            upRes.destroy();
            finishStream({ ok: false, status: 0, body: `client write failed: ${e.message}`, clientGone: true });
          }
        });
        upRes.on('end', () => {
          if (streamDone) return;
          if (!flushHeaders()) return;
          if (!clientRes.writableEnded) {
            try { clientRes.end(); } catch {}
          }
          const usage = extractLastUsage(tail);
          log(
            `OK id=${reqId} ${clientReq.method} ${target} key=${keyEntry.name} status=${status} ${elapsed()}ms` +
              ` sess=${sess} model=${model} stream=${isStream} clientUa=${JSON.stringify(origUa)} ua=${JSON.stringify(String(headers['user-agent'] || ''))}` +
              `${usage ? ' usage=' + usage : ''}`,
          );
          finishStream({ ok: true, status, usage });
        });
        const endClientOnUpstreamFailure = () => {
          if (!clientGone && responseStarted && !clientRes.writableEnded) {
            try { clientRes.destroy(); } catch {}
          }
        };
        const failBeforeFirstByte = (reason) => {
          if (streamDone) return;
          // 还没有任何字节发给客户端：返回 ok:false，让 handle() 透明重试/换 key。
          log(`STREAM-ERR id=${reqId} key=${keyEntry.name} before-first-byte ${reason}`);
          try { upReq.destroy(); } catch {}
          finishStream({ ok: false, status: 0, body: reason, clientGone: false });
        };
        upRes.on('aborted', () => {
          if (streamDone) return;
          if (clientGone) {
            clearIdleTimers();
            return;
          }
          if (!responseStarted) return failBeforeFirstByte('upstream aborted before first byte');
          log(`STREAM-ERR id=${reqId} key=${keyEntry.name} upstream aborted`);
          endClientOnUpstreamFailure();
          finishStream({ ok: true, status, streamError: 'upstream aborted' });
        });
        upRes.on('error', (e) => {
          if (streamDone) return;
          if (clientGone) {
            clearIdleTimers();
            log(`CLIENT-ABORT id=${reqId} key=${keyEntry.name} stream`);
            finishStream({ ok: false, status: 0, body: 'client aborted', clientGone: true });
            return;
          }
          if (!responseStarted) return failBeforeFirstByte(e.message);
          log(`STREAM-ERR id=${reqId} key=${keyEntry.name} ${e.message}`);
          endClientOnUpstreamFailure();
          finishStream({ ok: true, status, streamError: e.message });
        });
      },
    );

    upReq._startTs = Date.now();
    upReq.setTimeout(CFG.upstreamTimeoutMs, () => {
      upReq.destroy(new Error(`upstream timeout after ${CFG.upstreamTimeoutMs}ms`));
    });
    upReq.on('error', (e) => {
      clearIdleTimers();
      if (clientGone) {
        streamDone = true;
        log(`CLIENT-ABORT id=${reqId} key=${keyEntry.name} before-headers`);
        resolve({ ok: false, status: 0, body: 'client aborted', clientGone: true });
        return;
      }
      // 响应头已经发给客户端之后，不能再换 key 透明重试：客户端已经看到了半截流。
      // 返回 ok:true 让 handle() 直接结束本请求，不冷却、不切 key。
      if (responseStarted) {
        streamDone = true;
        log(`STREAM-ERR id=${reqId} key=${keyEntry.name} after-headers ${e.message}`);
        if (!clientRes.writableEnded) {
          try { clientRes.destroy(); } catch {}
        }
        resolve({ ok: true, status: 0, streamError: e.message });
        return;
      }
      streamDone = true;
      log(`NETWORK id=${reqId} key=${keyEntry.name} ${e.code || ''} ${e.message}`);
      resolve({ ok: false, status: 0, body: `${e.code || 'ERROR'}: ${e.message}` });
    });

    // 客户端断开 → 立刻掐掉上游，别白烧 token。
    // 关键：这属于“用户/Reasonix 主动取消”，不是 key 故障；
    // 必须带 clientGone=true 返回，避免 handle() 把当前 key 冷却并随机切到另一个 key。
    clientRes.on('error', () => {
      // 客户端响应流出错通常等于对端断开；标记后不要冷却/切 key。
      clientGone = true;
    });
    clientRes.on('close', () => {
      if (!clientRes.writableEnded) {
        clientGone = true;
        clearIdleTimers();
        upReq.destroy(new Error('client aborted'));
      }
    });

    if (sendBody && sendBody.length) upReq.write(sendBody);
    armFirstChunk();
    upReq.end();
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let len = 0;
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      // 不要在这里 req.destroy()：先把 408 响应发出去，再由 handle() 关连接。
      finish(reject, new Error(`request body timeout after ${CFG.bodyTimeoutMs}ms`));
    }, Math.max(1, CFG.bodyTimeoutMs || 120000));
    req.on('data', (c) => {
      len += c.length;
      if (len > CFG.maxBodyBytes) {
        finish(reject, new Error(`request body too large (>${CFG.maxBodyBytes} bytes)`));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => finish(resolve, Buffer.concat(chunks)));
    req.on('aborted', () => finish(reject, new Error('request aborted before body end')));
    req.on('error', (e) => finish(reject, e));
    req.on('close', () => {
      if (!done && !req.complete) finish(reject, new Error('request closed before body end'));
    });
  });
}

function sendJSON(res, status, obj) {
  if (res.writableEnded || res.headersSent) return;
  const text = JSON.stringify(obj, null, 2);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

// ── 健康检查 / 自述端点（不转发上游）──────────────────────────────────────
function handleLocal(req, res, url) {
  const keys = loadKeys();
  const now = Date.now();
  if (url.pathname === '/health' || url.pathname === '/_gateway/health') {
    sendJSON(res, 200, {
      ok: true,
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      startedAt: state.stats.since,
      upstream: upstreamLabel(resolveUpstream(null)),
      upstreamNote: '未声明 upstream 的 key 的缺省上游；每个 key 的实际上游见 keys[].upstream',
      priorityTiers: (() => {
        const m = {};
        for (const k of keys) m[k.priority] = (m[k.priority] || 0) + 1;
        return m;
      })(),
      quotaSync: {
        enabled: CFG.quotaSync?.enabled !== false,
        url: CFG.quotaSync?.url || '',
        mode: CFG.quotaSync?.mode || 'used',
        resetWindow: CFG.quotaSync?.resetWindow || 'weekly',
        ok: quotaState.ok,
        ageSec: quotaState.at ? Math.round((now - quotaState.at) / 1000) : null,
        error: quotaState.error,
        detail: quotaState.detail,
      },
      strategy: (() => {
        const s = String(CFG.strategy || 'session').toLowerCase();
        if (s === 'round-robin') return 'round-robin + failover（注意：会打断 prompt cache）';
        if (s === 'session') return 'session：同一会话粘同一个 key + failover';
        if (s === 'prefix') return 'prefix：同前缀新会话优先同 key + 窗口软上限 + failover';
        return 'sticky：全局粘一个 key + failover';
      })(),
      stickyKey: state.sticky || '(尚未选过)',
      sessions: Object.keys(state.sessions).length,
      stats: state.stats,
      keys: keys.map((k) => {
        const ks = kstate(k.name);
        return {
          name: k.name,
          enabled: k.enabled,
          available: k.enabled && ks.cooldownUntil <= now,
          cooldownMsLeft: Math.max(0, ks.cooldownUntil - now),
          cooldownReason: ks.cooldownReason || '',
          ok: ks.ok,
          fail: ks.fail,
          lastStatus: ks.lastStatus,
          lastError: ks.lastError,
          lastUsedAt: ks.lastUsedAt,
          note: k.note,
          upstream: upstreamLabel(resolveUpstream(k)),
          models: k.models ? k.models.length : '(all)',
          priority: k.priority,
          quotaAccount: k.quotaAccount,
          weightStatic: k.weight,
          weightEffective: Number(effWeight(k).toFixed(3)),
          weightFromQuota: quotaWeights.has(k.quotaAccount || k.name),
        };
      }),
    });
    return true;
  }
  if (url.pathname === '/_gateway/reload' || url.pathname === '/reload') {
    reloadRuntimeConfig();
    keysCache.mtime = 0;
    const keys = loadKeys();
    stateDirty = true;
    log(`RELOAD config=${CONFIG_PATH} keys=${keys.map((k) => k.name).join(',') || '(none)'}`);
    sendJSON(res, 200, {
      ok: true,
      config: CONFIG_PATH,
      keys: keys.map((k) => ({ name: k.name, enabled: k.enabled })),
    });
    return true;
  }
  if (url.pathname === '/_gateway/reset') {
    for (const k of Object.keys(state.keys)) {
      state.keys[k].cooldownUntil = 0;
      state.keys[k].cooldownReason = '';
    }
    stateDirty = true;
    log('RESET all cooldowns cleared');
    sendJSON(res, 200, { ok: true, cleared: Object.keys(state.keys) });
    return true;
  }
  // 查看 / 手动指定主用 key：?name=163 指定，?clear=1 清空（下次请求按池顺序重选）
  if (url.pathname === '/_gateway/sticky') {
    const want = url.searchParams.get('name');
    if (url.searchParams.has('clear')) {
      state.sticky = '';
      stateDirty = true;
      log('STICKY cleared');
      sendJSON(res, 200, { ok: true, stickyKey: null });
      return true;
    }
    if (want) {
      const k = loadKeys().find((x) => x.name === want);
      if (!k) {
        sendJSON(res, 404, { ok: false, error: `keys.json 里没有名为 ${want} 的 key`, known: loadKeys().map((x) => x.name) });
        return true;
      }
      state.sticky = k.name;
      stateDirty = true;
      log(`STICKY set -> ${k.name}`);
      sendJSON(res, 200, { ok: true, stickyKey: k.name });
      return true;
    }
    sendJSON(res, 200, { ok: true, stickyKey: state.sticky || null, strategy: CFG.strategy || 'session' });
    return true;
  }
  // 会话绑定概览：哪些会话（指纹）绑在哪个 key 上（验证分散效果用）
  if (url.pathname === '/_gateway/sessions') {
    const entries = Object.entries(state.sessions);
    const byKey = {};
    for (const [, v] of entries) byKey[v.key] = (byKey[v.key] || 0) + 1;
    entries.sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 20)));
    sendJSON(res, 200, {
      ok: true,
      total: entries.length,
      byKey,
      recent: entries.slice(0, limit).map(([fp, v]) => ({
        session: fp.slice(0, 8),
        key: v.key,
        hits: v.hits || 0,
        lastUsedAt: v.t ? new Date(v.t).toISOString() : null,
      })),
    });
    return true;
  }
  return false;
}

// ── 主处理：选 key → 转发 → 失败换 key ────────────────────────────────────
let reqSeq = 0;
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (handleLocal(req, res, url)) return;

  // GET /v1/models 按白名单过滤，见 loadModelAllowlist() 的注释。
  // 只拦截这一个方法+路径；任何异常都回退到原本的透传，绝不让它影响正常请求。
  if (req.method === 'GET' && (url.pathname === '/v1/models' || url.pathname === '/models')) {
    const allow = loadModelAllowlist();
    if (allow !== null) {
      const live = loadKeys().filter((k) => k.enabled);
      // /v1/models 的语义是「本网关能服务的模型全集」，不能拿任意一个 key 去问：
      // 官方 key 只有 2 个模型，问它会把 dsh 的模型选择器直接打回 2 项。
      // 固定用「缺省上游」的 key 拉 —— 它的白名单是并集的超集（官方能服务的那些
      // 客户端 id，GOAT 白名单里都有）。
      const isDefaultUp = (k) => resolveUpstream(k).origin === CFG.upstream.origin;
      const chosen =
        live.find((k) => isDefaultUp(k) && !isCooling(k.name)) ||
        live.find(isDefaultUp) ||
        live.find((k) => !isCooling(k.name)) ||
        live[0];
      if (chosen !== undefined) {
        try {
          const chosenUp = resolveUpstream(chosen);
          const modelsUrl = chosenUp.origin + chosenUp.basePath.replace(/\/+$/, '') + '/models';
          const up = await fetch(modelsUrl, {
            method: 'GET',
            headers: { authorization: `Bearer ${chosen.key}`, 'accept-encoding': 'identity' },
            redirect: 'error',
          });
          const json = await up.json();
          const all = Array.isArray(json && json.data) ? json.data : [];
          const data = all.filter((m) => m && typeof m.id === 'string' && allow.has(m.id));
          log(`MODELS-FILTERED ${all.length} -> ${data.length} (allowlist ${allow.size})`);
          sendJSON(res, up.status, Object.assign({}, json, { data }));
          return;
        } catch (e) {
          log(`MODELS-WARN 过滤失败，回退透传：${String((e && e.message) || e)}`);
        }
      }
    }
  }

  req._reqId = ++reqSeq;
  state.stats.requests += 1;
  stateDirty = true;

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    const status = msg.includes('too large') ? 413 : msg.includes('timeout') ? 408 : 400;
    try { res.setHeader('connection', 'close'); } catch {}
    sendJSON(res, status, { error: { message: msg, type: 'gateway_body_error' } });
    try { req.destroy(); } catch {}
    return;
  }

  // 解析一次请求体：会话指纹（选 key 用）+ 日志字段，避免在 forward 里重复 parse
  let parsed = null;
  try {
    parsed = body.length ? JSON.parse(body.toString('utf8')) : null;
  } catch {
    parsed = null;
  }
  const meta = {
    model: parsed && typeof parsed.model === 'string' ? parsed.model : '',
    stream: !!(parsed && parsed.stream === true),
    fp: sessionFingerprint(parsed, req.headers),
    prefixFp: prefixFingerprint(parsed),
  };

  const enabledKeys = loadKeys().filter((k) => k.enabled);
  // 多上游过滤（2026-10-01）：官方 key 只服务 deepseek 系两个模型 —— 请求 gpt-6-luna 时
  // 它必须在候选集之外，否则会白吃一个上游 400/404 再进冷却。
  const all = enabledKeys.filter((k) => modelSupported(k, meta.model));
  if (!all.length) {
    if (enabledKeys.length && meta.model) {
      sendJSON(res, 400, {
        error: {
          message:
            `goat-gateway: 没有 key 能服务 model '${meta.model}'` +
            `（${enabledKeys.length} 个 enabled key 均声明不支持它）`,
          type: 'gateway_no_key_for_model',
          model: meta.model,
          keys: enabledKeys.map((k) => k.name),
        },
      });
      return;
    }
    sendJSON(res, 503, {
      error: { message: 'goat-gateway: keys.json 里没有可用 key', type: 'gateway_no_keys' },
    });
    return;
  }

  const attemptsPerKey = Math.max(1, Number(CFG.attemptsPerKey) || 1);
  const maxAttempts = Math.max(1, Math.min(
    Number(CFG.maxAttemptsPerRequest) || 1,
    all.length * attemptsPerKey,
  ));
  const failures = new Map(); // keyName -> 本轮已失败次数
  const attempted = new Set();
  let last = null;

  for (let i = 0; i < maxAttempts; i++) {
    // 只把「本轮失败次数还没到 attemptsPerKey」的 key 交给 selectKey。
    const candidates = all.filter((k) => (failures.get(k.name) || 0) < attemptsPerKey);
    const target = selectKey(candidates, meta.fp, meta.prefixFp);
    if (!target) break;
    attempted.add(target.name);

    if (i > 0) {
      state.stats.retries += 1;
      state.stats.switched += 1;
      stateDirty = true;
      const delay = Math.max(0, Number(CFG.retryDelayMs) || 0) * i;
      log(`RETRY id=${req._reqId} attempt=${i + 1}/${maxAttempts} -> key=${target.name} delay=${delay}ms`);
      if (delay > 0) await sleep(delay);
    }

    const r = await forward(req, res, target, body, meta);
    if (r.ok && r.passedThrough) {
      // forward() 已经把上游的普通 400 原样发给客户端了：不算失败、不冷却这个 key。
      state.stats.forwarded += 1;
      stateDirty = true;
      log(`PASS-THROUGH id=${req._reqId} key=${target.name} status=${r.status}`);
      return;
    }
    if (r.ok) {
      state.stats.forwarded += 1;
      if (r.streamError) {
        state.stats.failures = (state.stats.failures || 0) + 1;
        log(`STREAM-DONE id=${req._reqId} key=${target.name} streamError=${r.streamError}`);
      } else {
        clearCooldown(target.name);
      }
      stateDirty = true;
      return;
    }
    if (r.clientGone) return;

    // 套餐级 403：换 key 无效，不能把 key 打入冷却（否则全网关停摆），直接把上游错误告诉调用方。
    if (Number(r.status) === 403 && isModelNotInPlan(r.body)) {
      const ks = kstate(target.name);
      ks.lastStatus = r.status;
      ks.lastError = String(r.body || '').slice(0, 300);
      state.stats.failures = (state.stats.failures || 0) + 1;
      stateDirty = true;
      log(
        `PLAN-BLOCKED id=${req._reqId} key=${target.name} model=${meta.model} (key NOT cooled) :: ` +
          ks.lastError.slice(0, 200),
      );
      sendJSON(res, 403, {
        error: {
          message: 'goat-gateway: 该 model 不在当前账号套餐内（未冷却 key，换 key 无效）',
          type: 'gateway_model_not_in_plan',
          model: meta.model,
          upstream_status: 403,
          upstream: String(r.body || '').slice(0, 500),
        },
      });
      return;
    }

    last = r;
    const count = (failures.get(target.name) || 0) + 1;
    failures.set(target.name, count);
    // 401/402/403/429 属于“明确不能继续用这个 key”，立即冷却换 key；
    // 其它瞬时错误（5xx/网络/超时）允许在 attemptsPerKey 内先重试同一 key。
    // 401/402/403/429 属于「这个 key 明确不能用」，立即冷却换 key；
    // 唯独 Cloudflare 1010 是「客户端指纹被拦」，跟 key 无关：先在同一 key 上重试，
    // 避免一次风控就把两个账号一起冷却 20s（客户端那边表现成「卡住」）。
    const cfBlocked = isCloudflareBlock(r.body);
    const quota400 = Number(r.status) === 400 && isQuotaExhausted(r.body);
    const immediateCooldown =
      ([401, 402, 403, 429].includes(Number(r.status)) || quota400) && !cfBlocked;
    const limit = immediateCooldown ? 1 : attemptsPerKey;
    if (count >= limit) {
      applyCooldown(target.name, r.status, r.body);
    } else {
      log(
        `RETRY-SAME-KEY id=${req._reqId} key=${target.name} status=${r.status} fail=${count}/${attemptsPerKey}` +
          (cfBlocked ? ' cloudflare=1010' : ''),
      );
    }
  }

  // 全部失败：把最后一个上游错误原样（或包装）返回
  const stillCooling = all.filter((k) => isCooling(k.name)).map((k) => k.name);
  state.stats.failures = (state.stats.failures || 0) + 1;
  stateDirty = true;
  log(`EXHAUSTED id=${req._reqId} tried=${[...attempted].join(',')} cooling=[${stillCooling.join(',')}]`);
  sendJSON(res, last?.status && last.status >= 400 ? last.status : 503, {
    error: {
      message:
        `goat-gateway: 所有 key 均失败（已尝试 ${[...attempted].join(',') || '无'}）。` +
        `最后一个错误：${last?.body ? last.body.slice(0, 500) : 'n/a'}`,
      type: 'gateway_all_keys_failed',
      upstream_status: last?.status || 0,
    },
  });
}

// ── 启动 ────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    log(`FATAL-HANDLER ${e.stack || e.message}`);
    sendJSON(res, 500, { error: { message: String(e.message), type: 'gateway_internal' } });
  });
});
server.keepAliveTimeout = 120000;
server.headersTimeout = 130000;
server.requestTimeout = 0;

server.on('error', (e) => {
  log(`FATAL listen failed: ${e.message}`);
  process.exit(2);
});

server.listen(CFG.listen.port, CFG.listen.host, () => {
  const keys = loadKeys();
  log(
    `START goat-gateway pid=${process.pid} listen=http://${CFG.listen.host}:${CFG.listen.port}` +
      ` defaultUpstream=${upstreamLabel(resolveUpstream(null))}` +
      ` keys=[${keys.map((k) => k.name + (k.enabled ? '' : ':off') + '@' + upstreamLabel(resolveUpstream(k))).join(', ')}]`,
  );
});

pruneLogs();
setInterval(pruneLogs, 6 * 3600 * 1000).unref();

// 额度驱动的动态权重：启动即同步一次，之后按 intervalMs 滚动刷新。
// 失败不影响转发 —— selectKey 会回落到静态 weight。
syncQuota().then(() => {
  log(`QUOTA-SYNC ${quotaState.ok ? 'ok' : 'failed'} ${quotaState.ok ? quotaState.detail.join(' | ') : quotaState.error}`);
}).catch(() => {});
setInterval(() => {
  syncQuota().catch(() => {});
}, Math.max(10000, Number(CFG.quotaSync?.intervalMs) || 60000)).unref();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log(`STOP signal=${sig}`);
    saveState();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
process.on('uncaughtException', (e) => log(`UNCAUGHT ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => log(`UNHANDLED ${e && (e.stack || e.message || e)}`));
