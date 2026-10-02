// ── path 独家认领 selftest（2026-10-02）──────────────────────────────────
//
// 验证 pathPrefixes 这套机制（把 /anthropic/* 从 GOAT 上游手里拿走，交给官方 key）：
//   1. 无人认领 → 各 key 照常参与，行为与改造前逐位一致
//   2. 有 key 认领 → 该 path 上只留认领者，未声明 pathPrefixes 的 key 一律出局
//   3. 认领只作用于认领的 path：/v1/* 聊天路径不受任何影响
//   4. 认领者自己不可用时，宁可 503 也不把请求送去错上游（关键安全性质）
//   5. /health 回显 pathPrefixes；400 诊断带 path
//
// 这个 selftest 的价值在于第 4 条：它是「显式认领制」相对「黑名单」的唯一代价，
// 必须被钉住 —— 否则以后有人给 selectKey 加兜底逻辑就会悄悄把 GOAT 上游又放回来。
//
// 用法：node selftest-path-prefixes.mjs

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATEWAY = path.join(HERE, 'gateway.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-path-'));
const configPath = path.join(tmp, 'config.json');
const keysPath = path.join(tmp, 'keys.json');
const statePath = path.join(tmp, 'state.json');
const allowPath = path.join(tmp, 'model-allowlist.json');
const logDir = path.join(tmp, 'logs');

const PORT = 18792;

const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('ASSERT FAIL: ' + m); };

// ── mock 上游：记录收到的 path / auth / model ────────────────────────────
const goatRecv = [];
const officialRecv = [];

// fail 是个可变开关：置 true 后该上游一律回 503（用来把 key 打进冷却，
// 比 close() 端口更干净 —— 关端口会留下 TIME_WAIT，还会让重连行为变得不透明）
function makeUpstream(tag, recv, fail) {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch {}
      const auth = req.headers.authorization || '';
      recv.push({
        tag,
        auth,
        key: auth.replace(/^Bearer\s+/, ''),
        path: req.url,
        model: parsed && parsed.model,
      });
      if (fail && fail.on) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'mock upstream down' } }));
        return;
      }
      if (req.method === 'GET' && String(req.url).endsWith('/models')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data: [{ id: 'gpt-6-luna' }] }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg', type: 'message', role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        model: parsed && parsed.model,
        usage: { input_tokens: 1, output_tokens: 1 },
      }));
    });
  });
}

const officialFail = { on: false };
const goatUp = makeUpstream('goat', goatRecv, null);
const officialUp = makeUpstream('official', officialRecv, officialFail);

let goatPort = 0;
let officialPort = 0;

writeJson(configPath, {
  listen: { host: '127.0.0.1', port: PORT },
  upstream: {
    origin: `http://127.0.0.1:${goatPort}`, // 占位，下面 listen 后重写
    basePath: '/provider/v1',
    localPrefix: '/v1',
  },
  strategy: 'session',
  maxAttemptsPerRequest: 4,
  attemptsPerKey: 1,
  retryDelayMs: 20,
  retryableStatus: [401, 402, 403, 408, 429, 500, 502, 503, 504],
  cooldownMs: { unauthorized: 1800000, quota: 600000, rateLimit: 60000, server: 15000, network: 20000 },
  bodyTimeoutMs: 3000,
  upstreamTimeoutMs: 30000,
  agentMaxAgeMs: 300000,
  logKeepDays: 30,
  quotaSync: { enabled: false },
});

function writeConfig() {
  writeJson(configPath, {
    listen: { host: '127.0.0.1', port: PORT },
    upstream: { origin: `http://127.0.0.1:${goatPort}`, basePath: '/provider/v1', localPrefix: '/v1' },
    strategy: 'session',
    maxAttemptsPerRequest: 4,
    attemptsPerKey: 1,
    retryDelayMs: 20,
    retryableStatus: [401, 402, 403, 408, 429, 500, 502, 503, 504],
    cooldownMs: { unauthorized: 1800000, quota: 600000, rateLimit: 60000, server: 15000, network: 20000 },
    bodyTimeoutMs: 3000,
    upstreamTimeoutMs: 30000,
    agentMaxAgeMs: 300000,
    logKeepDays: 30,
    quotaSync: { enabled: false },
  });
}

// claim = true 时给 official1 加 pathPrefixes（模拟生产里 "/anthropic/"）
function writeKeys(claim) {
  const official = {
    name: 'official1',
    key: 'sk-official-key',
    enabled: true,
    priority: 0,
    weight: 1,
    upstream: { origin: `http://127.0.0.1:${officialPort}`, basePath: '' },
    models: ['gpt-6-luna'],
    modelMap: { 'gpt-6-luna': 'gpt-6-luna-official' },
  };
  if (claim) official.pathPrefixes = ['/anthropic/'];
  writeJson(keysPath, {
    keys: [
      { name: 'goatA', key: 'goat-A-key', enabled: true, priority: 100, weight: 1 },
      { name: 'goatB', key: 'goat-B-key', enabled: true, priority: 100, weight: 1 },
      official,
    ],
  });
  // mtime 是秒级/毫秒级都可能，直接把 mtime 推到未来，确保 mtime 热重载一定命中
  const future = new Date(Date.now() + 3000);
  fs.utimesSync(keysPath, future, future);
}

async function post(p, body, extra = {}) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer client-side', ...extra },
    body: JSON.stringify(body),
  });
  return { status: r.status, text: await r.text() };
}

const askAnthropic = (model, user) =>
  post('/anthropic/v1/messages',
    { model, max_tokens: 16, messages: [{ role: 'user', content: [{ type: 'text', text: user }] }] },
    { 'anthropic-version': '2023-06-01' });

const askChat = (model, user) =>
  post('/v1/chat/completions', { model, stream: false, messages: [{ role: 'user', content: user }] });

async function health() {
  const r = await fetch(`http://127.0.0.1:${PORT}/health`);
  return await r.json();
}

async function reload() {
  await fetch(`http://127.0.0.1:${PORT}/_gateway/reload`, { method: 'POST' });
  await sleep(400);
}

async function resetCooldowns() {
  await fetch(`http://127.0.0.1:${PORT}/_gateway/reset`, { method: 'POST' });
  await sleep(100);
}

const byName = (h) => Object.fromEntries(h.keys.map((k) => [k.name, k]));
const countByKey = (recv) => {
  const c = {};
  for (const r of recv) c[r.key] = (c[r.key] || 0) + 1;
  return c;
};

let child;
let childLog = '';
let failures = 0;

async function step(name, fn) {
  try {
    await fn();
    console.log('PASS ' + name);
  } catch (e) {
    failures += 1;
    console.log('FAIL ' + name + ' :: ' + e.message);
  }
}

async function main() {
  await new Promise((r) => goatUp.listen(0, '127.0.0.1', r));
  await new Promise((r) => officialUp.listen(0, '127.0.0.1', r));
  goatPort = goatUp.address().port;
  officialPort = officialUp.address().port;

  writeConfig();
  writeKeys(false); // 阶段 A：无人认领
  writeJson(allowPath, { models: ['gpt-6-luna'] });

  child = spawn(process.execPath, [GATEWAY], {
    env: {
      ...process.env,
      GATEWAY_CONFIG: configPath,
      GATEWAY_KEYS: keysPath,
      GATEWAY_STATE: statePath,
      GATEWAY_ALLOWLIST: allowPath,
      GATEWAY_LOG_DIR: logDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (c) => { childLog += c; });
  child.stderr.on('data', (c) => { childLog += c; });

  const deadline = Date.now() + 10000;
  let up = false;
  while (Date.now() < deadline) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/health`); if (r.ok) { up = true; break; } } catch {}
    await sleep(100);
  }
  assert(up, 'gateway 未能起来');
  await sleep(300);

  // T1 ── 无人认领：/anthropic/* 照常落 GOAT 层（= 改造前行为）
  await step('T1 无人认领 pathPrefixes 时 /anthropic/* 仍由最高优先层服务', async () => {
    goatRecv.length = 0;
    officialRecv.length = 0;
    const r = await askAnthropic('gpt-6-luna', 'unclaimed');
    assert(r.status === 200, `应 200，实际 ${r.status}: ${r.text.slice(0, 200)}`);
    assert(goatRecv.length === 1, `应由 GOAT 层接走，实际 goatRecv=${goatRecv.length}`);
    assert(officialRecv.length === 0, `官方不该被触碰，实际 ${officialRecv.length}`);
    assert(goatRecv[0].path === '/provider/v1/anthropic/v1/messages',
      `GOAT 上游应收到拼接后的 /provider/v1/anthropic/v1/messages，实际 ${goatRecv[0].path}`);
  });

  // T2 ── 认领生效：只留认领者；path 拼接正确（官方 basePath='' → 原样）
  await step('T2 有 key 认领后 /anthropic/* 只走认领者，GOAT 零调用', async () => {
    writeKeys(true);
    await reload();
    goatRecv.length = 0;
    officialRecv.length = 0;
    for (let i = 0; i < 5; i++) {
      const r = await askAnthropic('gpt-6-luna', `claimed-${i}`);
      assert(r.status === 200, `第 ${i} 次应 200，实际 ${r.status}: ${r.text.slice(0, 200)}`);
    }
    assert(goatRecv.length === 0, `GOAT 在认领 path 上必须出局，实际收到 ${goatRecv.length}`);
    assert(officialRecv.length === 5, `官方应独得 5 次，实际 ${officialRecv.length}`);
    assert(officialRecv[0].key === 'sk-official-key', `应带官方 key，实际 ${officialRecv[0].key}`);
    assert(officialRecv[0].path === '/anthropic/v1/messages',
      `官方上游应收到 /anthropic/v1/messages（basePath 为空），实际 ${officialRecv[0].path}`);
    assert(officialRecv[0].model === 'gpt-6-luna-official',
      `modelMap 应改写为 gpt-6-luna-official，实际 ${officialRecv[0].model}`);
  });

  // T3 ── 认领只作用于该 path；/v1/* 完全不受影响
  await step('T3 认领不影响其它 path：/v1/chat/completions 仍落 GOAT 层', async () => {
    goatRecv.length = 0;
    officialRecv.length = 0;
    for (let i = 0; i < 4; i++) {
      const r = await askChat('gpt-6-luna', `chat-${i}`);
      assert(r.status === 200, `第 ${i} 次应 200，实际 ${r.status}: ${r.text.slice(0, 200)}`);
    }
    assert(goatRecv.length === 4, `聊 path 应仍由 GOAT 层服务，实际 ${goatRecv.length}`);
    assert(officialRecv.length === 0, `官方在 /v1/* 上仍是兜底层，不该被触碰，实际 ${officialRecv.length}`);
    const c = countByKey(goatRecv);
    assert(Object.keys(c).length >= 2, `同层内应均衡，实际 ${JSON.stringify(c)}`);
  });

  // T4 ── 关键安全性质：认领者不可用时宁可失败，也不把请求送去错上游
  await step('T4 认领者失效时返回失败而非回退到 GOAT 上游', async () => {
    officialFail.on = true;
    goatRecv.length = 0;
    officialRecv.length = 0;
    const r = await askAnthropic('gpt-6-luna', 'fallback-should-not-happen');
    assert(r.status >= 400, `认领者不可用时应失败，实际 ${r.status}`);
    assert(goatRecv.length === 0,
      `绝不允许回退到 GOAT 上游（那正是改造前的 404 bug），实际收到 ${goatRecv.length}`);
    assert(officialRecv.length >= 1, `官方应被尝试过，实际 ${officialRecv.length}`);
    officialFail.on = false;
    await resetCooldowns();
    await sleep(200);
  });

  // T5 ── /health 回显
  await step('T5 /health 逐 key 回显 pathPrefixes', async () => {
    const h = await health();
    const n = byName(h);
    assert(JSON.stringify(n.official1.pathPrefixes) === JSON.stringify(['/anthropic/']),
      `official1.pathPrefixes 应为 ['/anthropic/']，实际 ${JSON.stringify(n.official1.pathPrefixes)}`);
    assert(n.goatA.pathPrefixes === null || n.goatA.pathPrefixes === undefined,
      `未声明者应为 null，实际 ${JSON.stringify(n.goatA.pathPrefixes)}`);
  });

  // T6 ── 400 诊断带 path（认领者不认识该 model 时）
  await step('T6 没有 key 能服务时 400 诊断包含 path', async () => {
    goatRecv.length = 0;
    officialRecv.length = 0;
    const r = await askAnthropic('gpt-6-luna', 'no-claimant-for-this-model');
    // 官方是唯一认领者且它声明支持 gpt-6-luna，所以这里应当 200；
    // 改用一个两边都不支持的 model 来触发 400。
    assert(r.status === 200, `官方应能服务，实际 ${r.status}`);

    const r2 = await askAnthropic('does-not-exist/model', 'x');
    assert(r2.status === 400, `应 400，实际 ${r2.status}: ${r2.text.slice(0, 300)}`);
    let j = null;
    try { j = JSON.parse(r2.text); } catch {}
    assert(j && String(j.error && j.error.message || '').includes('/anthropic/v1/messages'),
      `400 诊断应包含 path，实际 ${r2.text.slice(0, 300)}`);
  });

  child.kill();
  await sleep(200);
  try { goatUp.close(); officialUp.close(); } catch {}
  console.log('');
  if (failures) {
    console.log(`FAILED: ${failures} step(s)`);
    console.log('--- gateway log tail ---');
    console.log(childLog.slice(-4000));
    process.exit(1);
  }
  console.log('ALL PATH-PREFIX TESTS PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.log('FATAL ' + (e && e.stack || e));
  console.log('--- gateway log tail ---');
  console.log(childLog.slice(-4000));
  try { child && child.kill(); } catch {}
  process.exit(1);
});
