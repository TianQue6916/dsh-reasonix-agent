// ── 多上游 selftest（2026-10-01）─────────────────────────────────────────
//
// 验证「官方 key 与 GOAT key 平级入池」这套改造：
//   1. 模型过滤：请求 gpt-6-luna 时官方 key 不得进候选（否则白撞 400 + 白冷却）
//   2. 平级分配：请求 deepseek 系模型时，两个上游都被分到会话
//   3. model 改写：官方上游收到的是裸 id（deepseek-flash），GOAT 上游收到原 id
//   4. per-key 路径与认证：官方 basePath 空串 → /chat/completions；GOAT → /provider/v1/...
//   5. /health 逐 key 报自己的上游
//   6. /v1/models 固定用缺省上游拉（官方只有 2 个模型，问它会把选择器打回 2 项）
//   7. 全池都不支持某 model → 400 gateway_no_key_for_model（不是 503）
//
// 用法：node selftest-multiupstream.mjs

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATEWAY = path.join(HERE, 'gateway.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-multiup-'));
const configPath = path.join(tmp, 'config.json');
const keysPath = path.join(tmp, 'keys.json');
const statePath = path.join(tmp, 'state.json');
const allowPath = path.join(tmp, 'model-allowlist.json');
const logDir = path.join(tmp, 'logs');

const PORT = 18789;

const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('ASSERT FAIL: ' + m); };

// ── mock 上游：记录每一次收到的请求 ──────────────────────────────────────
function makeUpstream(tag, recv) {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch {}
      recv.push({ tag, path: req.url, auth: req.headers.authorization || '', model: parsed && parsed.model });

      if (req.method === 'GET' && req.url.endsWith('/models')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          object: 'list',
          data: [
            { id: 'gpt-6-luna' },
            { id: 'deepseek/deepseek-v4.1-flash' },
            { id: 'model-only-official-has' },   // 用来证明 /models 不是从官方拉的
          ],
        }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'cmpl', object: 'chat.completion', model: parsed && parsed.model,
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }));
    });
  });
}

const goatRecv = [];
const officialRecv = [];
const goatUp = makeUpstream('goat', goatRecv);
const officialUp = makeUpstream('official', officialRecv);

async function ask(model, user) {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer client-side' },
    body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: user }] }),
  });
  const text = await r.text();
  return { status: r.status, text };
}

async function waitHealth(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(100);
  }
  throw new Error('gateway health timeout');
}

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
  const goatPort = goatUp.address().port;
  const officialPort = officialUp.address().port;

  writeJson(configPath, {
    listen: { host: '127.0.0.1', port: PORT },
    upstream: { origin: `http://127.0.0.1:${goatPort}`, basePath: '/provider/v1', localPrefix: '/v1' },
    strategy: 'session',
    maxAttemptsPerRequest: 4,
    attemptsPerKey: 2,
    retryDelayMs: 20,
    retryableStatus: [401, 402, 403, 408, 429, 500, 502, 503, 504],
    cooldownMs: { unauthorized: 1800000, quota: 600000, rateLimit: 60000, server: 15000, network: 20000 },
    bodyTimeoutMs: 3000,
    upstreamTimeoutMs: 30000,
    agentMaxAgeMs: 300000,
    logKeepDays: 30,
  });

  writeJson(keysPath, {
    keys: [
      // 不声明 upstream / models —— 必须与改造前的行为逐位一致（缺省继承）
      { name: 'goat1', key: 'user-goat-key', enabled: true },
      // 官方 key：自带 upstream + 模型白名单 + id 映射
      {
        name: 'official1',
        key: 'sk-official-key',
        enabled: true,
        upstream: { origin: `http://127.0.0.1:${officialPort}`, basePath: '' },
        models: ['deepseek/deepseek-v4.1-flash'],
        modelMap: { 'deepseek/deepseek-v4.1-flash': 'deepseek-flash' },
      },
    ],
  });

  writeJson(allowPath, { models: ['gpt-6-luna', 'deepseek/deepseek-v4.1-flash'] });

  child = spawn(process.execPath, [GATEWAY], {
    env: {
      ...process.env,
      GATEWAY_CONFIG: configPath,
      GATEWAY_KEYS: keysPath,
      GATEWAY_STATE: statePath,
      GATEWAY_LOG_DIR: logDir,
      GATEWAY_ALLOWLIST: allowPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (c) => { childLog += c.toString(); });
  child.stderr.on('data', (c) => { childLog += c.toString(); });

  await waitHealth();

  // ── 1. /v1/models 必须从缺省上游（GOAT）拉 ───────────────────────────
  await step('models endpoint uses default upstream', async () => {
    officialRecv.length = 0;
    goatRecv.length = 0;
    const r = await fetch(`http://127.0.0.1:${PORT}/v1/models`);
    const j = await r.json();
    assert(j.data.length === 2, `allowlist 过滤后应为 2 项，实际 ${j.data.length}`);
    assert(goatRecv.length >= 1, 'GOAT 上游应被问到 /models');
    assert(officialRecv.length === 0, `官方上游不该被问到 /models，但收到 ${officialRecv.length} 次`);
  });

  // ── 2. gpt-6-luna 永不落官方 ─────────────────────────────────────────
  await step('gpt model never reaches official key', async () => {
    officialRecv.length = 0;
    goatRecv.length = 0;
    for (let i = 0; i < 10; i++) {
      const r = await ask('gpt-6-luna', `gpt-sess-${i}`);
      assert(r.status === 200, `请求应 200，实际 ${r.status}: ${r.text.slice(0, 200)}`);
    }
    assert(goatRecv.length === 10, `GOAT 应收到 10 次，实际 ${goatRecv.length}`);
    assert(officialRecv.length === 0, `官方 key 不得被选中，实际收到 ${officialRecv.length} 次`);
  });

  // ── 3. deepseek 系请求两边都分到（平级入池）─────────────────────────
  await step('deepseek model is split across both keys', async () => {
    officialRecv.length = 0;
    goatRecv.length = 0;
    for (let i = 0; i < 12; i++) {
      const r = await ask('deepseek/deepseek-v4.1-flash', `deep-sess-${i}`);
      assert(r.status === 200, `请求应 200，实际 ${r.status}: ${r.text.slice(0, 200)}`);
    }
    assert(goatRecv.length > 0, 'GOAT 应分到一部分会话');
    assert(officialRecv.length > 0, `官方应分到一部分会话（平级），实际 0 / 12`);
    const total = goatRecv.length + officialRecv.length;
    assert(total === 12, `两边合计应 12，实际 ${total}`);

    // 官方收到的 model 必须已被改写为裸 id
    const badModel = officialRecv.filter((x) => x.model !== 'deepseek-flash');
    assert(badModel.length === 0, `官方上游应收到 deepseek-flash，异常样本：${JSON.stringify(badModel.slice(0, 2))}`);

    // GOAT 侧不得被官方映射污染
    const badGoat = goatRecv.filter((x) => x.model !== 'deepseek/deepseek-v4.1-flash');
    assert(badGoat.length === 0, `GOAT 上游应收到原 id，异常样本：${JSON.stringify(badGoat.slice(0, 2))}`);
  });

  // ── 4. per-key 路径与认证 ────────────────────────────────────────────
  await step('per-key path and auth header', async () => {
    assert(officialRecv.every((x) => x.path === '/chat/completions'),
      `官方 basePath 为空串 → 应为 /chat/completions，实际 ${JSON.stringify([...new Set(officialRecv.map((x) => x.path))])}`);
    assert(officialRecv.every((x) => x.auth === 'Bearer sk-official-key'),
      '官方上游应使用官方 key 认证');
    assert(goatRecv.every((x) => x.path === '/provider/v1/chat/completions'),
      `GOAT 应为 /provider/v1/chat/completions，实际 ${JSON.stringify([...new Set(goatRecv.map((x) => x.path))])}`);
    assert(goatRecv.every((x) => x.auth === 'Bearer user-goat-key'),
      'GOAT 上游应使用 GOAT key 认证');
  });

  // ── 5. /health 逐 key 报上游 ─────────────────────────────────────────
  await step('health reports per-key upstream', async () => {
    const h = await waitHealth();
    const g = h.keys.find((k) => k.name === 'goat1');
    const o = h.keys.find((k) => k.name === 'official1');
    assert(g && o, 'health 应列出两个 key');
    assert(g.upstream === `http://127.0.0.1:${goatPort}/provider/v1`, `goat1 upstream 应为缺省上游，实际 ${g.upstream}`);
    assert(o.upstream === `http://127.0.0.1:${officialPort}`, `official1 upstream 应为官方 origin，实际 ${o.upstream}`);
    assert(Array.isArray(o.models) === false && o.models === 1, `official1 应声明 1 个模型，实际 ${JSON.stringify(o.models)}`);
    assert(g.models === '(all)', `goat1 未声明 models 应为 (all)，实际 ${JSON.stringify(g.models)}`);
  });

  // ── 6. 双向过滤：GOAT 声明白名单后，官方独占的模型走官方；全不支持则 400 ──
  await step('bidirectional model filter and 400 on unsupported model', async () => {
    writeJson(keysPath, {
      keys: [
        { name: 'goat1', key: 'user-goat-key', enabled: true, models: ['gpt-6-luna'] },
        {
          name: 'official1', key: 'sk-official-key', enabled: true,
          upstream: { origin: `http://127.0.0.1:${officialPort}`, basePath: '' },
          models: ['deepseek/deepseek-v4.1-flash'],
          modelMap: { 'deepseek/deepseek-v4.1-flash': 'deepseek-flash' },
        },
      ],
    });
    await sleep(1100); // 等 mtime 热重载（fs.statSync mtimeMs 粒度）

    officialRecv.length = 0;
    goatRecv.length = 0;
    for (let i = 0; i < 6; i++) {
      const r = await ask('deepseek/deepseek-v4.1-flash', `excl-${i}`);
      assert(r.status === 200, `请求应 200，实际 ${r.status}`);
    }
    assert(goatRecv.length === 0, `goat1 已声明不支持该 model，不该收到请求，实际 ${goatRecv.length}`);
    assert(officialRecv.length === 6, `官方应独得全部 6 次，实际 ${officialRecv.length}`);

    // 全池都不支持 → 400（而不是 503 或白撞上游）
    officialRecv.length = 0;
    goatRecv.length = 0;
    const r = await ask('totally-unknown-model', 'nobody-supports-me');
    assert(r.status === 400, `应 400，实际 ${r.status}: ${r.text.slice(0, 200)}`);
    let j = null;
    try { j = JSON.parse(r.text); } catch {}
    assert(j && j.error && j.error.type === 'gateway_no_key_for_model',
      `error.type 应为 gateway_no_key_for_model，实际 ${JSON.stringify(j && j.error)}`);
    assert(goatRecv.length === 0 && officialRecv.length === 0, '400 分支不得触碰任何上游');
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
  console.log('ALL MULTI-UPSTREAM TESTS PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.log('FATAL ' + (e && e.stack || e));
  console.log('--- gateway log tail ---');
  console.log(childLog.slice(-4000));
  try { child && child.kill(); } catch {}
  process.exit(1);
});
