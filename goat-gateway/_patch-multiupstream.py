# -*- coding: utf-8 -*-
"""
goat-gateway 多上游改造（2026-10-01）

目标：让「官方 key」与「GOAT key」在同一套 key 调配系统里平级参与
      session 粘滞 / 冷却 / 重试。

原则：缺省继承。key 不写 upstream 就完全走 CFG.upstream —— 既有 GOAT key
      一行都不用改，行为逐位不变。

每个替换必须恰好命中 1 次，否则整体不落盘。
"""
import sys, re, pathlib

SRC = pathlib.Path('gateway.mjs')
src = SRC.read_text(encoding='utf-8')
orig = src

REPL = []

def sub(name, old, new):
    REPL.append((name, old, new))

# ── R1: upstream 解析 + 按 origin 分池的 agent ───────────────────────────
sub('R1 upstream/agent-pool', '''CFG = loadConfig();
let upOrigin = new URL(CFG.upstream.origin);
let agent = null;
let agentBornAt = 0;

function makeAgent() {
  const lib = upOrigin.protocol === 'http:' ? http : https;
  const keepAlive = CFG.upstream ? CFG.upstream.keepAlive !== false : true;
  return new lib.Agent({ keepAlive, maxSockets: 128, maxFreeSockets: keepAlive ? 32 : 0, timeout: 60000 });
}

// 定期重建上游 Agent：长寿命连接可能进入「慢速」状态，换新连接即恢复。
function resetAgent(reason) {
  agent = makeAgent();
  agentBornAt = Date.now();
  if (reason) log(`AGENT-RECYCLE ${reason}`);
}
function getAgent() {
  const maxAge = Number(CFG.upstream?.agentMaxAgeMs ?? 300000);
  if (maxAge > 0 && agent && Date.now() - agentBornAt > maxAge) {
    resetAgent(`age=${Date.now() - agentBornAt}ms > ${maxAge}ms`);
  }
  return agent;
}
resetAgent();

function getTransport() {
  return upOrigin.protocol === 'http:' ? http : https;
}
''', '''CFG = loadConfig();

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
''')

# ── R2: config reload ────────────────────────────────────────────────────
sub('R2 reload', '''  upOrigin = new URL(CFG.upstream.origin);
  resetAgent('config reload');''', '''  resetAgents('config reload');''')

# ── R3: loadKeys 保留新字段 ──────────────────────────────────────────────
sub('R3 loadKeys', '''      weight: (() => {
        const w = Number(k.weight);
        return Number.isFinite(w) && w > 0 ? w : 1;
      })(),
    }));''', '''      weight: (() => {
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
    }));''')

# ── R4: mapPath 接受 upstream ────────────────────────────────────────────
sub('R4 mapPath', '''function mapPath(url) {
  const u = new URL(url, 'http://localhost');
  let pathname = u.pathname;
  const { localPrefix, basePath } = CFG.upstream;''', '''function mapPath(url, up) {
  const u = new URL(url, 'http://localhost');
  let pathname = u.pathname;
  const localPrefix = CFG.upstream.localPrefix;
  const basePath = up ? up.basePath : CFG.upstream.basePath;''')

# ── R5: 模型兼容性 / id 映射辅助函数 ────────────────────────────────────
sub('R5 model helpers', '''// ── 路径映射：本地 /v1/xxx  →  上游 /provider/v1/xxx ─────────────────────''', '''// ── 多上游的模型兼容性与 id 映射（2026-10-01 加）────────────────────────
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

// ── 路径映射：本地 /v1/xxx  →  上游 /provider/v1/xxx ─────────────────────''')

# ── R6: forward 开头解析 upstream + 模型改写 ────────────────────────────
sub('R6 forward head', '''    const target = mapPath(clientReq.url);
    const headers = stripHopByHop({ ...clientReq.headers });''', '''    const up = resolveUpstream(keyEntry);
    const target = mapPath(clientReq.url, up);
    // 模型改写：客户端 id → 该 key 上游的原生 id。只在命中映射表时才重新序列化 body，
    // 不影响 GOAT 那些 id 本来就一致的请求（绝大多数）。
    const upstreamModel = mapModelFor(keyEntry, meta.model);
    const sendBody = upstreamModel === meta.model ? body : rewriteModel(body, upstreamModel);
    const headers = stripHopByHop({ ...clientReq.headers });''')

# ── R7: content-length 用改写后的 body ──────────────────────────────────
sub('R7 content-length', '''    headers.authorization = `Bearer ${keyEntry.key}`;
    if (body && body.length) headers['content-length'] = String(body.length);''', '''    headers.authorization = `Bearer ${keyEntry.key}`;
    if (sendBody && sendBody.length) headers['content-length'] = String(sendBody.length);''')

# ── R8: 请求发往该 key 自己的上游 ───────────────────────────────────────
sub('R8 upReq', '''    const upReq = getTransport().request(
      {
        protocol: upOrigin.protocol,
        hostname: upOrigin.hostname,
        port: upOrigin.port || 443,
        path: target,
        method: clientReq.method,
        headers,
        agent: getAgent(),
      },''', '''    const upLib = up.url.protocol === 'http:' ? http : https;
    const upReq = upLib.request(
      {
        protocol: up.url.protocol,
        hostname: up.url.hostname,
        port: up.url.port || defaultPort(up.url.protocol),
        path: target,
        method: clientReq.method,
        headers,
        agent: getAgent(up),
      },''')

# ── R9: 发送改写后的 body ───────────────────────────────────────────────
sub('R9 write body', '''    if (body && body.length) upReq.write(body);''', '''    if (sendBody && sendBody.length) upReq.write(sendBody);''')

# ── R10: 候选集按模型过滤 ───────────────────────────────────────────────
sub('R10 candidates', '''  const all = loadKeys().filter((k) => k.enabled);
  if (!all.length) {
    sendJSON(res, 503, {
      error: { message: 'goat-gateway: keys.json 里没有可用 key', type: 'gateway_no_keys' },
    });
    return;
  }''', '''  const enabledKeys = loadKeys().filter((k) => k.enabled);
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
  }''')

# ── R11: /v1/models 必须用缺省上游的 key 拉 ─────────────────────────────
sub('R11 models source', '''      const live = loadKeys().filter((k) => k.enabled);
      const chosen = live.find((k) => !isCooling(k.name)) || live[0];
      if (chosen !== undefined) {
        try {
          const modelsUrl = CFG.upstream.origin + CFG.upstream.basePath.replace(/\\/+$/, '') + '/models';''', '''      const live = loadKeys().filter((k) => k.enabled);
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
          const modelsUrl = chosenUp.origin + chosenUp.basePath.replace(/\\/+$/, '') + '/models';''')

# ── R12: /health 的 upstream 字段 ───────────────────────────────────────
sub('R12 health upstream', '''      upstream: CFG.upstream.origin + CFG.upstream.basePath,''', '''      upstream: upstreamLabel(resolveUpstream(null)),
      upstreamNote: '未声明 upstream 的 key 的缺省上游；每个 key 的实际上游见 keys[].upstream',''')

# ── R13: /health 每个 key 报自己的上游 ──────────────────────────────────
sub('R13 health keys', '''          lastUsedAt: ks.lastUsedAt,
          note: k.note,
        };''', '''          lastUsedAt: ks.lastUsedAt,
          note: k.note,
          upstream: upstreamLabel(resolveUpstream(k)),
          models: k.models ? k.models.length : '(all)',
        };''')

# ── R14: 启动日志 ───────────────────────────────────────────────────────
sub('R14 startup log', '''      ` upstream=${CFG.upstream.origin}${CFG.upstream.basePath} keys=[${keys.map((k) => k.name + (k.enabled ? '' : ':off')).join(', ')}]`,''', '''      ` defaultUpstream=${upstreamLabel(resolveUpstream(null))}` +
      ` keys=[${keys.map((k) => k.name + (k.enabled ? '' : ':off') + '@' + upstreamLabel(resolveUpstream(k))).join(', ')}]`,''')


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
print(f'bytes: {len(orig.encode("utf-8"))} -> {len(src.encode("utf-8"))}')
print(f'lines: {orig.count(chr(10))} -> {src.count(chr(10))}')
