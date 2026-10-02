/**
 * 回归用例：SSE 长流末尾的 usage 必须被 gateway 记录。
 *
 * 背景：gateway.mjs 旧写法
 *     if (tail.length < 65536) tail += chunkStr;
 * 是「前 64KiB 封顶」——长流一旦超过 64KiB 就不再累积，而 usage 只出现在流的最后一段，
 * 于是末尾 usage 永远提取不到。实测 Windows 生产日志：10-01 dsh 1530 OK / 219 usage；
 * 10-02 dsh 299/41、reasonix 117/20 ⇒ 覆盖率约 15%。
 * 修法：改成滑动窗口，始终保留**最后** 64KiB。
 *
 * 用法：
 *   node selftest-tail-window.mjs                     # 测 D:\Toolbox\goat-gateway\gateway.mjs（期望 PASS）
 *   node selftest-tail-window.mjs --gateway <备份路径>  # 阳性对照：对 patch 前的备份应 FAIL
 *
 * 之所以要跑阴性对照：如果旧文件也能过，说明本用例根本没测到那个窗口。
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ARGV = process.argv.slice(2);
const GI = ARGV.indexOf('--gateway');
const GATEWAY = GI >= 0 ? ARGV[GI + 1] : 'D:\\Toolbox\\goat-gateway\\gateway.mjs';
const PORT = 18789;
const PAD_FRAMES = 300;              // 300 × ~510B ≈ 150KiB，远超 64KiB 窗口
const PAD_BYTES_MIN = 96 * 1024;     // 自检：确认真的灌够了体积
const MARK_TOKENS = 424242;          // 取值刻意独一无二，便于在日志里定位

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-tail-'));
const configPath = path.join(TMP, 'config.json');
const keysPath = path.join(TMP, 'keys.json');
const statePath = path.join(TMP, 'state.json');
const logDir = path.join(TMP, 'logs');
fs.mkdirSync(logDir, { recursive: true });

let sentBytes = 0;
const upstream = http.createServer(async (req, res) => {
  for await (const _ of req) { /* drain */ }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const pad = JSON.stringify({ pad: 'x'.repeat(480) });
  const padFrame = `data: ${pad}\n\n`;
  for (let i = 0; i < PAD_FRAMES; i++) {
    sentBytes += Buffer.byteLength(padFrame);
    res.write(padFrame);
  }
  const usageFrame =
    `data: {"choices":[{"delta":{"content":"ok"}}],"usage":{"prompt_tokens":${MARK_TOKENS},` +
    `"completion_tokens":7,"prompt_tokens_details":{"cached_tokens":0}}}\n\n`;
  sentBytes += Buffer.byteLength(usageFrame);
  res.write(usageFrame);
  res.write('data: [DONE]\n\n');
  res.end();
});

function writeJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let child;
let childLog = '';

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

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
}

async function main() {
  console.log(`gateway under test: ${GATEWAY}`);
  assert(fs.existsSync(GATEWAY), `gateway not found: ${GATEWAY}`);
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = upstream.address().port;

  writeJson(configPath, {
    listen: { host: '127.0.0.1', port: PORT },
    upstream: {
      origin: `http://127.0.0.1:${upstreamPort}`,
      basePath: '/provider/v1',
      localPrefix: '/v1',
      firstChunkTimeoutMs: 5000,
      streamIdleTimeoutMs: 5000,
    },
    maxAttemptsPerRequest: 4,
    attemptsPerKey: 2,
    retryDelayMs: 50,
    retryableStatus: [401, 402, 403, 408, 429, 500, 502, 503, 504],
    cooldownMs: { unauthorized: 1800000, quota: 600000, rateLimit: 60000, server: 15000, network: 20000 },
    maxBodyBytes: 64 * 1024 * 1024,
    bodyTimeoutMs: 5000,
    maxSessions: 2000,
    upstreamTimeoutMs: 30000,
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

  const r = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer client-side' },
    body: JSON.stringify({ model: 'test-model', stream: true, messages: [{ role: 'user', content: 'long stream' }] }),
  });
  const body = await r.text();
  assert(r.status === 200, `status=${r.status}`);
  assert(body.includes('ok'), 'client body should contain the final ok delta');
  assert(body.includes('[DONE]'), 'client body should contain [DONE]');

  await sleep(300);

  assert(sentBytes >= PAD_BYTES_MIN, `upstream should have sent >= ${PAD_BYTES_MIN}B, sent ${sentBytes}`);
  assert(childLog.includes('OK '), `gateway log should contain an OK line\n--- log ---\n${childLog}`);

  const okLine = childLog.split(/\r?\n/).filter((l) => l.includes(' OK ')).pop() || '';
  const m = okLine.match(/usage=(\{.*\})/);
  assert(m, `长流末尾的 usage 必须被记录（这正是本用例要抓的 bug）\n  sent=${sentBytes}B\n  okLine=${okLine}`);

  const usage = JSON.parse(m[1]);
  assert(usage.prompt_tokens === MARK_TOKENS, `usage.prompt_tokens=${usage.prompt_tokens} 期望 ${MARK_TOKENS}`);
  assert(usage.completion_tokens === 7, `usage.completion_tokens=${usage.completion_tokens} 期望 7`);

  console.log(`PASS tail-window: 灌入 ${sentBytes} B（> 64KiB），末尾 usage 被完整记录：${JSON.stringify(usage)}`);
}

function cleanup() {
  try { if (child) child.kill(); } catch {}
  try { upstream.close(); } catch {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
}

main()
  .then(() => { cleanup(); process.exit(0); })
  .catch((e) => { console.error(String(e.message || e)); cleanup(); process.exit(1); });
