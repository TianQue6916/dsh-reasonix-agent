// ── priority 分层 + quota 动态权重 selftest（2026-10-01）──────────────────
//
// 验证「官方 key 降为兜底层 + GOAT 月额度驱动动态权重」这套改造：
//   1. priority 缺省 = 100：不写 priority 的 key 与显式 100 同层（不写时行为与改造前一致）
//   2. priority 分层：低层 key 在高层可用时完全不被触碰（「非必要不用」）
//   3. 兜底：高层全部冷却后低层顶上
//   4. quota 动态权重 mode='used'：月已用比例高者 weight 更大
//   5. quota 动态权重 mode='resetSoon'：周期窗口 resetAt 更近者 weight 更大
//   6. 没有周期窗口的行（官方余额）不参与时间型口径，保持静态 weight
//   7. quota 拉取失败 → quotaSync.ok=false，不崩、路由照常
//   8. 动态权重确实改变分配方向（大样本下 weight 大的 key 背更多会话）
//
// 用法：node selftest-quota-priority.mjs

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATEWAY = path.join(HERE, 'gateway.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-qp-'));
const configPath = path.join(tmp, 'config.json');
const keysPath = path.join(tmp, 'keys.json');
const statePath = path.join(tmp, 'state.json');
const allowPath = path.join(tmp, 'model-allowlist.json');
const logDir = path.join(tmp, 'logs');

const PORT = 18790;
const QPORT = 18791;

const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('ASSERT FAIL: ' + m); };
const DAY = 86400000;

// ── mock 上游：按 Authorization 判断放行 / 401 ──────────────────────────
const goatRecv = [];
const officialRecv = [];
const failKeys = new Set();

function makeUpstream(tag, recv, failSet) {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch {}
      const auth = req.headers.authorization || '';
      recv.push({ tag, auth, key: auth.replace(/^Bearer\s+/, ''), path: req.url, model: parsed && parsed.model });

      if (req.method === 'GET' && req.url.endsWith('/models')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data: [{ id: 'gpt-6-luna' }] }));
        return;
      }
      if (failSet && failSet.has(auth)) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'mock unauthorized' } }));
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

const goatUp = makeUpstream('goat', goatRecv, failKeys);
const officialUp = makeUpstream('official', officialRecv, null);

// ── mock quota-http：内容随时可换 ──────────────────────────────────────
let quotaRows = [];
let quotaDown = false;
const quotaUp = http.createServer((req, res) => {
  if (quotaDown) { res.writeHead(500, { 'content-type': 'text/plain' }); res.end('mock quota down'); return; }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ rows: quotaRows }));
});

let goatPort = 0;
let officialPort = 0;

function writeConfig(mode = 'used') {
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
    quotaSync: {
      enabled: true,
      url: `http://127.0.0.1:${QPORT}/quota`,
      intervalMs: 3600000,
      timeoutMs: 3000,
      mode,
      resetWindow: 'weekly',
      minWeight: 0.2,
      maxWeight: 5,
    },
  });
}

function writeKeys() {
  writeJson(keysPath, {
    keys: [
      { name: 'goatA', key: 'goat-A-key', enabled: true, priority: 100, weight: 1 },
      { name: 'goatB', key: 'goat-B-key', enabled: true, priority: 100, weight: 1 },
      // 不写 priority：必须被当作 100（与显式 100 同层），否则「不写=行为不变」的承诺就破了
      { name: 'goatC', key: 'goat-C-key', enabled: true, weight: 1 },
      {
        name: 'official1',
        key: 'sk-official-key',
        enabled: true,
        priority: 0,
        weight: 1,
        upstream: { origin: `http://127.0.0.1:${officialPort}`, basePath: '' },
        models: ['gpt-6-luna'],
        modelMap: { 'gpt-6-luna': 'gpt-6-luna-official' },
      },
    ],
  });
}

async function ask(model, user) {
  const r = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer client-side' },
    body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: user }] }),
  });
  return { status: r.status, text: await r.text() };
}

async function health() {
  const r = await fetch(`http://127.0.0.1:${PORT}/health`);
  return await r.json();
}

async function reload() {
  await fetch(`http://127.0.0.1:${PORT}/_gateway/reload`, { method: 'POST' });
  await sleep(500); // reload 里的 syncQuota() 是异步 fire-and-forget
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
  await new Promise((r) => quotaUp.listen(QPORT, '127.0.0.1', r));
  goatPort = goatUp.address().port;
  officialPort = officialUp.address().port;

  writeConfig('used');
  writeKeys();
  writeJson(allowPath, { models: ['gpt-6-luna'] });
  quotaRows = [
    { name: 'goatA', monthUsed: 20, monthCap: 100, weeklyReset: 0 },
    { name: 'goatB', monthUsed: 90, monthCap: 100, weeklyReset: 0 },
    { name: 'goatC', monthUsed: 55, monthCap: 100, weeklyReset: 0 },
    { name: 'official1', kind: 'official', available: 1.2, currency: 'CNY' },
  ];

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
  await sleep(700); // 等启动时的第一次 syncQuota

  // T1 ── priority 读取 + 缺省值 + 分层统计
  await step('T1 priority tiers: 缺省 100 与显式 100 同层，0 层单独', async () => {
    const h = await health();
    assert(h.priorityTiers && h.priorityTiers['100'] === 3,
      `100 层应有 3 个 key（goatA/goatB/goatC），实际 ${JSON.stringify(h.priorityTiers)}`);
    assert(h.priorityTiers['0'] === 1, `0 层应有 1 个 key，实际 ${JSON.stringify(h.priorityTiers)}`);
    const n = byName(h);
    assert(n.goatA.priority === 100 && n.goatB.priority === 100, 'priority 100 未被读出');
    assert(n.goatC.priority === 100, `未写 priority 应缺省 100，实际 ${n.goatC.priority}`);
    assert(n.official1.priority === 0, '官方 key 应 priority 0');
  });

  // T2 ── 低层 key 在高层可用时完全不被触碰
  await step('T2 低优先层（官方）在 GOAT 层可用时零调用', async () => {
    goatRecv.length = 0;
    officialRecv.length = 0;
    for (let i = 0; i < 12; i++) {
      const r = await ask('gpt-6-luna', `tier-${i}`);
      assert(r.status === 200, `应 200，实际 ${r.status}: ${r.text.slice(0, 200)}`);
    }
    assert(officialRecv.length === 0, `官方 key 在兜底层不该被触碰，实际收到 ${officialRecv.length}`);
    assert(goatRecv.length === 12, `GOAT 层应独得 12 次，实际 ${goatRecv.length}`);
    const c = countByKey(goatRecv);
    assert(Object.keys(c).length >= 2, `同一层内应均衡到多个 key，实际 ${JSON.stringify(c)}`);
  });

  // T3 ── 高层全冷却 → 低层顶上
  await step('T3 高层全部冷却后官方 key 顶上', async () => {
    failKeys.add('Bearer goat-A-key');
    failKeys.add('Bearer goat-B-key');
    failKeys.add('Bearer goat-C-key');
    goatRecv.length = 0;
    officialRecv.length = 0;
    // 第一个请求会依次撞上 3 个 GOAT key（各 401 一次），把它们全部打入冷却，
    // 第 4 次 attempt 才落到官方层 —— 这正是「高层不可用才轮到低层」的一次完整演示。
    const r0 = await ask('gpt-6-luna', 'cool-0');
    assert(r0.status === 200, `应 200，实际 ${r0.status}: ${r0.text.slice(0, 200)}`);
    assert(officialRecv.length === 1, `第一个请求最终应由官方兜底，实际 ${officialRecv.length}`);
    assert(goatRecv.length === 3, `第一个请求应把 3 个 GOAT key 各撞一次，实际 ${goatRecv.length}`);
    // 之后 GOAT 层已全冷却，必须一次都不再被调用。
    goatRecv.length = 0;
    for (let i = 1; i < 5; i++) {
      const r = await ask('gpt-6-luna', `cool-${i}`);
      assert(r.status === 200, `应 200，实际 ${r.status}: ${r.text.slice(0, 200)}`);
    }
    const h = await health();
    const cooled = h.keys.filter((k) => k.name.startsWith('goat') && k.cooldownMsLeft > 0).length;
    assert(cooled === 3, `3 个 GOAT key 都应进冷却，实际 ${cooled}`);
    assert(officialRecv.length === 5, `官方 key 应独得 5 次，实际 ${officialRecv.length}`);
    assert(goatRecv.length === 0, `GOAT 层已全冷却不该再被调用，实际 ${goatRecv.length}`);
  });
  // 清理刻意放在 step 外：assert 一旦抛出，step 内后面的语句不会执行，
  // mock 401 与冷却状态就会残留下来把后续用例全部连坐。
  failKeys.clear();
  await resetCooldowns();

  // T4 ── mode='used'
  await step("T4 mode='used'：月已用比例高者 weight 大，官方行不进表", async () => {
    const h = await health();
    assert(h.quotaSync.ok === true, `quotaSync 应 ok，实际 ${JSON.stringify(h.quotaSync)}`);
    assert(h.quotaSync.mode === 'used' && h.quotaSync.resetWindow === 'weekly',
      `quotaSync 回显不对：${JSON.stringify(h.quotaSync)}`);
    const n = byName(h);
    assert(n.goatA.weightFromQuota === true && n.goatB.weightFromQuota === true, 'goatA/goatB 应命中 quota 表');
    assert(n.official1.weightFromQuota === false, '官方行没有 monthUsed/monthCap，不该进表');
    // lo=0.2 hi=5 → ratio 0.2 → 1.16；0.9 → 4.52
    assert(Math.abs(n.goatA.weightEffective - 1.16) < 0.01,
      `goatA 期望 ~1.16，实际 ${n.goatA.weightEffective}`);
    assert(Math.abs(n.goatB.weightEffective - 4.52) < 0.01,
      `goatB 期望 ~4.52，实际 ${n.goatB.weightEffective}`);
    assert(n.goatB.weightEffective > n.goatC.weightEffective && n.goatC.weightEffective > n.goatA.weightEffective,
      `顺序应为 B(90%) > C(55%) > A(20%)，实际 ${JSON.stringify({ A: n.goatA.weightEffective, B: n.goatB.weightEffective, C: n.goatC.weightEffective })}`);
    assert(n.official1.weightEffective === 1, `官方应保持静态 weight 1，实际 ${n.official1.weightEffective}`);
  });

  // T5 ── mode='resetSoon'
  await step("T5 mode='resetSoon'：weeklyReset 更近者 weight 大（用户口径）", async () => {
    const now = Date.now();
    quotaRows = [
      { name: 'goatA', monthUsed: 20, monthCap: 100, weeklyReset: now + 2 * DAY },
      { name: 'goatB', monthUsed: 90, monthCap: 100, weeklyReset: now + 6 * DAY },
      { name: 'goatC', monthUsed: 55, monthCap: 100, weeklyReset: now + 4 * DAY },
      { name: 'official1', kind: 'official', available: 1.2, currency: 'CNY' },
    ];
    writeConfig('resetSoon');
    await reload();
    const h = await health();
    assert(h.quotaSync.ok === true, `quotaSync 应 ok，实际 ${JSON.stringify(h.quotaSync)}`);
    const n = byName(h);
    assert(Math.abs(n.goatA.weightEffective - 5) < 0.01,
      `最早重置的 goatA 应拿满权重 5，实际 ${n.goatA.weightEffective}`);
    assert(Math.abs(n.goatB.weightEffective - 0.2) < 0.01,
      `最晚重置的 goatB 应拿最低权重 0.2，实际 ${n.goatB.weightEffective}`);
    assert(n.goatA.weightEffective > n.goatC.weightEffective && n.goatC.weightEffective > n.goatB.weightEffective,
      `顺序应为 A(2d) > C(4d) > B(6d)，实际 ${JSON.stringify({ A: n.goatA.weightEffective, B: n.goatB.weightEffective, C: n.goatC.weightEffective })}`);
    assert(n.official1.weightFromQuota === false,
      '官方行没有周期窗口，时间型口径下必须跳过（否则会凭空拿到权重）');
    assert(n.official1.weightEffective === 1, `官方应保持静态 weight 1，实际 ${n.official1.weightEffective}`);
  });

  // T6 ── quota 拉取失败
  await step('T6 quota-http 挂掉：ok=false 但不影响路由', async () => {
    quotaDown = true;
    await reload();
    const h = await health();
    assert(h.quotaSync.ok === false, `quotaSync 应 ok=false，实际 ${JSON.stringify(h.quotaSync)}`);
    assert(h.quotaSync.error && h.quotaSync.error.length > 0, '应带回错误信息');
    goatRecv.length = 0;
    const r = await ask('gpt-6-luna', 'quota-down-still-works');
    assert(r.status === 200, `quota 不可用时路由必须照常，实际 ${r.status}: ${r.text.slice(0, 200)}`);
    assert(goatRecv.length === 1, 'quota 不可用时仍应正常选 key');
    quotaDown = false;
    await reload();
    const h2 = await health();
    assert(h2.quotaSync.ok === true, '恢复后应重新 ok');
  });

  // T7 ── 动态权重实际改变分配方向
  await step("T7 mode='used' 下 weight 大的 key 实际背更多会话", async () => {
    quotaRows = [
      { name: 'goatA', monthUsed: 10, monthCap: 100, weeklyReset: 0 },
      { name: 'goatB', monthUsed: 95, monthCap: 100, weeklyReset: 0 },
      { name: 'goatC', monthUsed: 50, monthCap: 100, weeklyReset: 0 },
      { name: 'official1', kind: 'official', available: 1.2, currency: 'CNY' },
    ];
    writeConfig('used');
    await reload();
    await resetCooldowns();
    goatRecv.length = 0;
    officialRecv.length = 0;
    for (let i = 0; i < 80; i++) {
      const r = await ask('gpt-6-luna', `bias-${i}`);
      assert(r.status === 200, `应 200，实际 ${r.status}`);
    }
    const c = countByKey(goatRecv);
    assert(officialRecv.length === 0, `官方仍不该被调用，实际 ${officialRecv.length}`);
    // 反例保护：weight 最大却最少被选 = 权重方向反了
    assert((c['goat-B-key'] || 0) > (c['goat-A-key'] || 0),
      `goatB(95%) 应比 goatA(10%) 背更多会话，实际 ${JSON.stringify(c)}`);
  });

  child.kill();
  await sleep(200);
  try { goatUp.close(); officialUp.close(); quotaUp.close(); } catch {}
  console.log('');
  if (failures) {
    console.log(`FAILED: ${failures} step(s)`);
    console.log('--- gateway log tail ---');
    console.log(childLog.slice(-4000));
    process.exit(1);
  }
  console.log('ALL QUOTA/PRIORITY TESTS PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.log('FATAL ' + (e && e.stack || e));
  console.log('--- gateway log tail ---');
  console.log(childLog.slice(-4000));
  try { child && child.kill(); } catch {}
  process.exit(1);
});
