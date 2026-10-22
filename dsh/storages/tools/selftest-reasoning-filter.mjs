#!/usr/bin/env node
// selftest-reasoning-filter.mjs —— 集成验证 goat-gateway 的「非中文 reasoning 不回灌」补丁。
//
// 为什么需要它：补丁改的是**请求体**（`body = Buffer.from(JSON.stringify(parsed))`），
// 而 forward() 用 sendBody 重算 content-length。单元测试只能证明 helper 的逻辑，
// 证明不了「真的把改过的 body 发出去了、长度对得上、别的角色/字段没被动」。
// 所以这里起一个真 gateway 实例 + 一个假上游，直接看上游收到了什么。
//
// 用法:
//   node selftest-reasoning-filter.mjs                     # 测生产 gateway.mjs
//   node selftest-reasoning-filter.mjs --gateway <path>    # 测别的 gateway.mjs（阴性对照/版本对比）
//
// 注意：`.reasoning-filter.json` 的路径由 gateway 的 ROOT 决定（= gateway.mjs 所在目录/logs），
// 不受环境变量控制，所以本用例会临时创建/恢复那个真实路径的文件（前状态会被还原）。

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const gi = argv.indexOf('--gateway');
const GATEWAY = gi >= 0 ? argv[gi + 1] : 'D:\\Toolbox\\goat-gateway\\gateway.mjs';
const ROOT = path.dirname(GATEWAY);
const FILTER_CFG = path.join(ROOT, 'logs', '.reasoning-filter.json');
const PORT = 18790;

const DSH_UA = 'deepseek-harness/0.2.0-rc.2 (+https://github.com/deepseek-ai/deepseek-harness)';
const REASONIX_UA = 'Go-http-client/1.1';

const received = [];
let child = null;
let childLog = '';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-echofilter-'));
const configPath = path.join(tmp, 'config.json');
const keysPath = path.join(tmp, 'keys.json');
const statePath = path.join(tmp, 'state.json');
const logDir = path.join(tmp, 'logs');

const EN = 'The user asks me to sum the token buckets. Let me check the numbers again and be careful about cache hits.';
const ZH = '用户问的是 token 桶的分布，让我核对一下数字，重点是缓存命中的那一档。';

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

function mkBody(extra = {}) {
  return {
    model: 'test-model',
    stream: true,
    max_tokens: 100,
    messages: [
      { role: 'system', content: 'You are a helpful software engineer assistant.' },
      { role: 'user', content: '中文提问：缓存命中的单价是多少？' },
      { role: 'assistant', content: '', reasoning_content: EN, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'bash', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '{"ok":true}' },
      { role: 'assistant', content: '', reasoning_content: ZH },
    ],
    ...extra,
  };
}

const upstream = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch {}
    received.push({ ua: String(req.headers['user-agent'] || ''), len: Buffer.byteLength(raw), cl: req.headers['content-length'], parsed, raw });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"ok"}}],"usage":{"prompt_tokens":1,"completion_tokens":1,"prompt_tokens_details":{"cached_tokens":0}}}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  });
});

async function ask(ua, body = mkBody()) {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer client-side', 'user-agent': ua },
    body: JSON.stringify(body),
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

function lastReceived() {
  assert(received.length > 0, '上游没收到任何请求');
  return received[received.length - 1];
}

function setFilterCfg(obj) {
  fs.mkdirSync(path.dirname(FILTER_CFG), { recursive: true });
  if (obj === null) {
    if (fs.existsSync(FILTER_CFG)) fs.unlinkSync(FILTER_CFG);
  } else {
    fs.writeFileSync(FILTER_CFG, JSON.stringify(obj, null, 2));
  }
}

async function main() {
  const hadCfg = fs.existsSync(FILTER_CFG);
  const cfgBackup = hadCfg ? fs.readFileSync(FILTER_CFG) : null;
  setFilterCfg(null); // 先确保关闭，做阴性对照

  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = upstream.address().port;

  writeJson(configPath, {
    listen: { host: '127.0.0.1', port: PORT },
    upstream: { origin: `http://127.0.0.1:${upstreamPort}`, basePath: '/provider/v1', localPrefix: '/v1' },
    maxAttemptsPerRequest: 2,
    attemptsPerKey: 1,
    retryDelayMs: 50,
    maxBodyBytes: 64 * 1024 * 1024,
    bodyTimeoutMs: 2000,
    upstreamTimeoutMs: 20000,
    logKeepDays: 30,
    strategy: 'sticky',
  });
  writeJson(keysPath, { keys: [{ name: 'A', key: 'key-A', enabled: true }] });
  writeJson(statePath, {
    rr: 0,
    sticky: 'A',
    sessions: {},
    keys: {},
    stats: { requests: 0, forwarded: 0, retries: 0, switched: 0, since: new Date().toISOString() },
  });

  child = spawn(process.execPath, [GATEWAY], {
    env: { ...process.env, GATEWAY_CONFIG: configPath, GATEWAY_KEYS: keysPath, GATEWAY_STATE: statePath, GATEWAY_LOG_DIR: logDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { childLog += d.toString(); });
  child.stderr.on('data', (d) => { childLog += d.toString(); });
  await waitHealth();

  // ── A. 开关文件不存在 ⇒ 一个字都不许动（阴性对照）──────────────────
  const rA = await ask(DSH_UA);
  assert(rA.status === 200, `A status=${rA.status} ${rA.text.slice(0, 200)}`);
  const a = lastReceived();
  assert(a.cl === String(a.len), `A content-length 与实收字节不一致: ${a.cl} vs ${a.len}`);
  assert(a.parsed.messages[2].reasoning_content === EN, 'A 关闭时英文 reasoning_content 必须原样保留');
  assert(a.parsed.messages[4].reasoning_content === ZH, 'A 中文 reasoning_content 原样');
  console.log('PASS A 开关关闭 = 完全不改（原样转发）');

  // ── B. 打开开关 ⇒ 英文回灌被删、中文保留、其余字段不动 ─────────────
  const before = Buffer.byteLength(JSON.stringify(mkBody()), 'utf8');
  setFilterCfg({ enabled: true, minCjk: 0.25, mode: 'strip', uaHints: ['deepseek-harness'] });
  const rB = await ask(DSH_UA);
  assert(rB.status === 200, `B status=${rB.status} ${rB.text.slice(0, 200)}`);
  const b = lastReceived();
  const m = b.parsed.messages;
  assert(!('reasoning_content' in m[2]), `B 英文 reasoning_content 应被删掉: ${JSON.stringify(m[2]).slice(0, 200)}`);
  assert(m[2].tool_calls && m[2].tool_calls.length === 1, 'B tool_calls 不能被动');
  assert(m[2].role === 'assistant', 'B role 不能被动');
  assert(m[4].reasoning_content === ZH, 'B 中文 reasoning_content 必须保留');
  assert(m[0].content === 'You are a helpful software engineer assistant.', 'B system 不动');
  assert(m[1].content.includes('缓存命中'), 'B user 消息不动');
  assert(m[3].content === '{"ok":true}', 'B tool 消息不动');
  assert(Number(b.cl) === b.len, `B content-length 必须重算: header=${b.cl} 实收=${b.len}（原始=${before}）`);
  assert(b.len < before, `B 请求体应变小: ${b.len} vs ${before}`);
  assert(b.parsed.model === 'test-model', 'B model 字段不动');
  await sleep(120);
  assert(/ECHO-FILTER .*dropped=1 kept=1/.test(childLog), `B 网关日志应有 ECHO-FILTER dropped=1 kept=1，实得: ${(childLog.match(/ECHO-FILTER[^\n]*/) || ['无'])[0]}`);
  console.log(`PASS B 打开开关 = 英文被删/中文保留（body ${before} -> ${b.len} bytes，content-length 已重算，tool_calls 未受影响）`);

  // ── C. reasonix 的 UA 不受影响 ────────────────────────────────────
  const rC = await ask(REASONIX_UA);
  assert(rC.status === 200, `C status=${rC.status}`);
  const c = lastReceived();
  assert(c.parsed.messages[2].reasoning_content === EN, 'C 非 dsh UA 必须原样（reasonix 的回灌不动）');
  console.log('PASS C UA 过滤生效（reasonix 的 Go-http-client/1.1 不受影响）');

  // ── D. mode=empty：字段保留但置空（给要求字段存在的上游兜底）─────────
  setFilterCfg({ enabled: true, minCjk: 0.25, mode: 'empty', uaHints: ['deepseek-harness'] });
  const rD = await ask(DSH_UA);
  assert(rD.status === 200, `D status=${rD.status}`);
  const d = lastReceived();
  assert('reasoning_content' in d.parsed.messages[2] && d.parsed.messages[2].reasoning_content === '', `D mode=empty 应保留字段并置空: ${JSON.stringify(d.parsed.messages[2])}`);
  assert(d.parsed.messages[4].reasoning_content === ZH, 'D 中文仍保留');
  console.log('PASS D mode=empty 保留字段并置空');

  // ── E. 阈值真的从配置读：minCjk=0.99 ⇒ 连中文块（ratio≈0.93）也被判为非中文 ──
  setFilterCfg({ enabled: true, minCjk: 0.99, mode: 'strip', uaHints: ['deepseek-harness'] });
  const rE = await ask(DSH_UA);
  assert(rE.status === 200, `E status=${rE.status}`);
  const e = lastReceived();
  assert(!('reasoning_content' in e.parsed.messages[2]), 'E 英文块应被删');
  assert(!('reasoning_content' in e.parsed.messages[4]), `E minCjk=0.99 时中文块（ratio≈0.93）也应被删，证明阈值确实读自配置: ${JSON.stringify(e.parsed.messages[4])}`);
  console.log('PASS E minCjk 读自配置（0.99 时中文块也被裁）');

  console.log(`PASS 全部用例（gateway=${GATEWAY}）`);
  child.kill();
  child = null;

  // 还原开关文件到用例前的状态
  if (hadCfg) fs.writeFileSync(FILTER_CFG, cfgBackup);
  else setFilterCfg(null);
  return 0;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((e) => {
    console.error(String(e && e.stack ? e.stack : e));
    if (child) { try { child.kill(); } catch {} }
    try {
      if (fs.existsSync(FILTER_CFG)) {
        // 出错也尽量不留一个「已启用」的开关在磁盘上（除非用例前就有）
        fs.unlinkSync(FILTER_CFG);
      }
    } catch {}
    process.exit(1);
  });
