#!/usr/bin/env node
/**
 * quota-http.mjs -- local quota HTTP endpoint for UI panels (dsh web / Reasonix status bar).
 *   GET /quota          -> { ok, ts, rows: [...] }            (JSON, for UI panels)
 *   GET /balance        -> plain text one-liner (6 numbers)   (for Reasonix balance_url)
 *   GET /balance?format=json -> { is_available, balance_infos: [...] }
 *   GET /health         -> { ok: true }
 * Rows: kind='goat' -> 套餐三窗口（5h/周/月）；kind='official' -> DeepSeek 官方 key，
 *       只有 currency / available / granted / toppedUp，渲染时必须按 kind 分支。
 * Data source: goat-usage.ps1 (account metadata; querying costs no quota).
 */
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

const PORT = Number(process.env.QUOTA_HTTP_PORT || 8790);
const SCRIPT = process.env.GOAT_USAGE_SCRIPT || 'D:\\Toolbox\\goat-gateway\\goat-usage.ps1';
const CACHE = path.join(os.tmpdir(), 'goat-quota-http-cache.json');
const TTL_MS = 10000;
const HITLOG = 'D:\\Toolbox\\goat-gateway\\logs\\balance-hits.log';

// 2026-10-29 新增：prompt-cache 命中率的唯一数据源。
// GOAT 账单 API（/alpha/usage/summary）只给 totalTokensIn/Out，**没有任何 cache 字段**；
// 含缓存信息的只有 gateway 自己的响应日志 —— 每条 OK 行的 upstream usage 里有
// prompt_tokens_details.cached_tokens。注意同一层里的 cache_read_input_tokens /
// cache_creation_input_tokens 恒为 0（Anthropic 风格空壳字段），只读它们会得到 0% 的假结论。
// 路径用正斜杠：Node 在 Windows 上同样接受，且省掉一整类反斜杠转义事故。
const LOG_DIR = process.env.GOAT_LOG_DIR || 'D:/Toolbox/goat-gateway/logs';

let last = { at: 0, body: null };

// 2026-10-29：execFileSync -> execFile。node 官方明确警告 execSync 会阻塞 event loop，
// 而这里一次要跑 300-800ms 的 powershell —— 期间 /cache、/health 全部排队。
// 社区做法一致：请求路径上不做同步 child_process I/O。
function run(extra) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Json',
    '-CacheSeconds', '10', '-CacheFile', CACHE].concat(extra || []);
  return new Promise((resolve, reject) => {
    execFile('powershell', args, { encoding: 'utf8', timeout: 90000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

/**
 * single-flight（request coalescing）：同一个 key 并发进来时只让第一个真正执行，
 * 其余 await 同一个 in-flight promise。社区里这是 cache stampede / thundering herd 的标准解。
 * 本机实际会撞上的场景：插件注册在 sidebar.footer.action 与 conversation.input.dock 两个 slot，
 * 同一个组件有两个实例，打开面板时可能同时打 /quota（每次 spawn 一次 powershell）。
 */
const inflight = new Map();
function singleFlight(key, fn) {
  const running = inflight.get(key);
  if (running) return running;
  const p = Promise.resolve()
    .then(fn)
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

function readQuota(force) {
  const now = Date.now();
  if (!force && last.body && now - last.at < TTL_MS) { return Promise.resolve(last.body); }
  // 并发去重：两个面板实例同时 shot 时只 spawn 一次 powershell。
  return singleFlight('quota|' + (force ? '1' : '0'), async () => {
    const at = Date.now();
    if (!force && last.body && at - last.at < TTL_MS) { return last.body; }
    let parsed;
    try { parsed = JSON.parse(await run(force ? ['-Force'] : [])); }
    catch { parsed = JSON.parse(await run(['-Force'])); }
    const body = { ok: true, ts: new Date().toISOString(), rows: Array.isArray(parsed) ? parsed : [parsed] };
    last = { at, body };
    return body;
  });
}

const pct = (u, c) => (Number(c) > 0 ? Math.round((100 * Number(u)) / Number(c)) : 0);
const lbl = { fiveHour: '5h', weekly: '\u5468', monthly: '\u6708' };

// ── cache-hit scanner ────────────────────────────────────────────────────────
// 性能设计：31 个日志文件 / 16k 条 OK 行，全量冷扫约 0.4s；按 (mtime,size) 做增量后
// 只有当天文件会重扫，重复调用 < 60ms。所以 /cache 不参与面板的 15s 轮询，
// 只在面板点开时拉一次，服务端自持进程内缓存（不落盘：进程重启后冷扫一次可接受）。
const fileScan = new Map(); // basename -> aggregate

// L2 结果级缓存（2026-10-29 用户提议）：L1 的文件级增量只省掉「没变的文件」，
// 但**当天的日志一直在长**，于是每次打开面板都要把当天那个文件整个重扫一遍，
// 成本随当天日志体积线性上升。加一层结果 TTL 后，一小时内重复打开是 0 成本。
// 缓存率本身按天粒度变化，1 小时的陈旧度无害；要最新的带 ?force=1（面板 ⟳ 按钮走它）。
const CACHE_TTL_MS = Number(process.env.GOAT_CACHE_TTL_MS || 3600000);
// 主动刷新节奏与 TTL 解耦：TTL 是「多久算过期」，WARM 是「多久主动重算一次」。
// 默认两者相等（每小时刷新 = 每小时后过期）；测试 stale 分支时把 WARM 调大即可。
const CACHE_WARM_MS = Number(process.env.GOAT_CACHE_WARM_MS || CACHE_TTL_MS);
const resultCache = new Map(); // "<from>|<detail>" -> { at, body }

// 正则有个必须踩住的坑：用 [^\n]*? 而不是 [\s\S]*? —— 否则没有 usage 的行
// （CLIENT-ABORT / ECHO-FILTER 等）会跨行把下一个请求的 usage 抢过来，命中率全乱。
const LOG_RE = /(\d{4}-\d{2}-\d{2})T\S+ OK id=\d+ POST \S+ key=\S+ status=\d+ \d+ms sess=(\S+)[^\n]*? usage=(\{.*?\}) finish=/g;

const BUCKET_LABELS = ['0-20%', '20-50%', '50-80%', '80-95%', '95-100%'];
const bucketOf = (hit) => (hit < 20 ? 0 : hit < 50 ? 1 : hit < 80 ? 2 : hit < 95 ? 3 : 4);

function scanOne(name, withDetail) {
  const p = path.join(LOG_DIR, name);
  let st;
  try { st = fs.statSync(p); } catch { return null; }
  const prev = fileScan.get(name);
  // 文件没变就复用上一次的聚合结果；但 detail 索引按需补算（只对最近 3 天）
  if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size && (!withDetail || prev.bySess)) return prev;

  let text;
  try { text = fs.readFileSync(p, 'utf8'); } catch { return null; }
  const rec = {
    mtimeMs: st.mtimeMs, size: st.size,
    requests: 0, prompt: 0, cached: 0, completion: 0,
    bySess: withDetail ? new Map() : null,
    buckets: withDetail ? [0, 0, 0, 0, 0] : null
  };
  LOG_RE.lastIndex = 0;
  let m;
  while ((m = LOG_RE.exec(text)) !== null) {
    let u;
    try { u = JSON.parse(m[3]); } catch { continue; }
    const d = u.prompt_tokens_details || {};
    const prompt = Number(u.prompt_tokens) || 0;
    const cached = Number(d.cached_tokens) || 0;
    rec.requests += 1;
    rec.prompt += prompt;
    rec.cached += cached;
    rec.completion += Number(u.completion_tokens) || 0;
    if (withDetail) {
      const s = rec.bySess.get(m[2]) || [0, 0, 0];
      s[0] += 1; s[1] += prompt; s[2] += cached;
      rec.bySess.set(m[2], s);
      if (prompt > 0) rec.buckets[bucketOf((100 * cached) / prompt)] += 1;
    }
  }
  fileScan.set(name, rec);
  return rec;
}

function logFiles() {
  let names = [];
  try { names = fs.readdirSync(LOG_DIR); } catch { return []; }
  return names.filter((n) => /^gateway-\d{4}-\d{2}-\d{2}\.log$/.test(n)).sort();
}

const sumOf = (arr) => arr.reduce((a, d) => ({
  requests: a.requests + d.requests, prompt: a.prompt + d.prompt,
  cached: a.cached + d.cached, completion: a.completion + d.completion
}), { requests: 0, prompt: 0, cached: 0, completion: 0 });
const pack = (o) => ({
  requests: o.requests, prompt: o.prompt, cached: o.cached, completion: o.completion,
  hit: o.prompt > 0 ? Math.round((10000 * o.cached) / o.prompt) / 100 : null
});
/** 某本地日期那一天的结束时刻（ms）。日志按本地日期切文件，账单周期是 UTC 时刻，必须归一。 */
const dayEndMs = (date) => {
  const p = date.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2] + 1).getTime();
};

/** 后台预热：只推进 L1 文件级聚合（stat + 重扫变化的文件），不组装结果。 */
// 有了它，TTL 过期后的首次重算也只是内存遍历（~1ms），不必重新读盘。
function warmFileScan() {
  const names = logFiles();
  const detailSet = new Set(names.slice(-3));
  for (const n of names) scanOne(n, detailSet.has(n));
}

/**
 * TTL + stale-while-revalidate（RFC 5861 的进程内版本）。
 * 三态：
 *   fresh   —— TTL 内，直接复用；
 *   stale   —— 已过期但手里有旧值：**先返回旧值**，再 setImmediate 后台重算
 *              （用 setImmediate 而不是 Promise.then —— microtask 仍在本轮里跑，挡得住 flush）。
 *              社区共识是「宁可给 1 小时前的数，也别让 UI 等重算」——过期即阻塞重算是
 *              最容易被忽略的退化（缓存有了，用户照样卡）。
 *   miss    —— 没值（进程刚起），只能同步算一次。
 * force=1 走第四条路：无视新旧，立刻重算并回写。
 */
function computeAndStore(key, fromMs, wantDetail) {
  const t0 = Date.now();
  const body = cacheReport(fromMs, wantDetail);
  body.computeMs = Date.now() - t0;
  resultCache.set(key, { at: Date.now(), body });
  // 正常情况下 key 只有一两个，这里只防 from 变化把 Map 撑大。
  while (resultCache.size > 4) resultCache.delete(resultCache.keys().next().value);
  return Object.assign({}, body, { cached: false, stale: false, ageMs: 0, ttlMs: CACHE_TTL_MS });
}

function cacheReportCached(fromMs, wantDetail, force) {
  const key = String(fromMs) + "|" + (wantDetail ? "1" : "0");
  const now = Date.now();
  const hit = resultCache.get(key);

  if (hit && !force) {
    const age = now - hit.at;
    if (age < CACHE_TTL_MS) {
      return Object.assign({}, hit.body, { cached: true, stale: false, ageMs: age, ttlMs: CACHE_TTL_MS });
    }
    // 过期：先返旧值，后台刷新（single-flight 保证同一 key 只有一个刷新在跑）
    singleFlight('revalidate|' + key, () => new Promise((resolve) => {
      setImmediate(() => {
        try { resolve(computeAndStore(key, fromMs, wantDetail)); } catch { resolve(null); }
      });
    })).catch(() => {});
    return Object.assign({}, hit.body, { cached: true, stale: true, ageMs: age, ttlMs: CACHE_TTL_MS });
  }

  return computeAndStore(key, fromMs, wantDetail);
}

/**
 * 注意一处**有意的**取舍：这里全程同步（statSync / readFileSync / 单遍正则）。
 * 因为 SWR 的 stale 分支必须能同步拿到旧 body 就 res.end()；把扫描链路改成 async，
 * 就只能 await 之后才返回，失去「零等待」的意义。
 * 代价：一次冷扫会阻塞 event loop ~100-200ms。缓解是三层的（启动预热 / 每小时 warm /
 * 结果 TTL），实际请求路径上走到同步全扫的概率很低（只在「进程刚起且日志已变大」时）。
 */
function cacheReport(fromMs, wantDetail) {
  const names = logFiles();
  const detailSet = new Set(names.slice(-3)); // session / 分桶索引只留最近 3 天，控内存
  const days = [];
  for (const n of names) {
    const rec = scanOne(n, detailSet.has(n));
    if (!rec || rec.requests === 0) continue;
    days.push(Object.assign({ date: n.slice(8, 18) }, rec));
  }
  const today = days.length ? days[days.length - 1] : null;
  const cycleDays = fromMs > 0 ? days.filter((d) => dayEndMs(d.date) > fromMs) : days;

  const out = {
    ok: true, ts: new Date().toISOString(), source: LOG_DIR, files: names.length,
    today: today ? Object.assign({ date: today.date }, pack(today)) : null,
    last7: pack(sumOf(days.slice(-7))),
    cycle: pack(sumOf(cycleDays)),
    byDay: days.slice(-14).map((d) => Object.assign({ date: d.date }, pack(d)))
  };

  if (wantDetail) {
    const merged = new Map();
    for (const d of days.slice(-3)) {
      if (!d.bySess) continue;
      for (const [k, v] of d.bySess) {
        const a = merged.get(k) || [0, 0, 0];
        a[0] += v[0]; a[1] += v[1]; a[2] += v[2];
        merged.set(k, a);
      }
    }
    const worst = [];
    for (const [k, v] of merged) {
      if (v[1] <= 0) continue;
      worst.push({ sess: k, requests: v[0], prompt: v[1], cached: v[2], hit: Math.round((10000 * v[2]) / v[1]) / 100 });
    }
    worst.sort((a, b) => a.hit - b.hit);
    const buckets = [0, 0, 0, 0, 0];
    for (const d of days.slice(-3)) {
      if (!d.buckets) continue;
      for (let i = 0; i < 5; i++) buckets[i] += d.buckets[i];
    }
    out.detail = {
      worstSessions: worst.slice(0, 12),
      requestLevelDistribution: BUCKET_LABELS.map((label, i) => ({ label, requests: buckets[i] })),
      windowDays: days.slice(-3).map((d) => d.date)
    };
  }
  return out;
}

/**
 * 统一的 JSON 响应：弱 ETag + If-None-Match 命中就 304。
 * 关键坑（社区踩过）：ETag 必须只对「实质内容」求哈希 —— 把 ts / ageMs / computeMs /
 * cached / stale 这些每次都会变的字段剔除，否则 ETag 每次都不同，304 路径等于不存在。
 * 收益说明：本机 127.0.0.1 调用省不了多少传输，它的价值是让「未来从别的机器/浏览器访问」
 * 以及中间层缓存能正常工作 —— 属于零成本的标准做法。
 */
function sendJson(req, res, body, corsHeaders, statusCode) {
  const stable = Object.assign({}, body);
  ['ts', 'ageMs', 'computeMs', 'cached', 'stale'].forEach((k) => { delete stable[k]; });
  const etag = 'W/"' + crypto.createHash('sha1').update(JSON.stringify(stable)).digest('hex').slice(0, 16) + '"';
  const head = Object.assign({}, corsHeaders, { ETag: etag, 'Cache-Control': 'private, max-age=0, must-revalidate' });
  const inm = String(req.headers['if-none-match'] || '');
  if (inm && inm.split(',').map((x) => x.trim()).indexOf(etag) >= 0) {
    res.writeHead(304, head);
    res.end();
    return;
  }
  res.writeHead(statusCode || 200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, head));
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': '*',
    // 这里不再放 Cache-Control：原来的 no-store 会把 ETag 架空 —— no-store 下浏览器连
    // ETag 都不保存，条件请求根本不会发出，304 路径等于不存在。统一交给 sendJson。
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (url.pathname === '/health') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors, { 'Cache-Control': 'no-store' }));
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname === '/cache') {
    try {
      const from = Number(url.searchParams.get('from') || 0);
      const body = cacheReportCached(Number.isFinite(from) ? from : 0, url.searchParams.get('detail') === '1', url.searchParams.get('force') === '1');
      sendJson(req, res, body, cors);
    } catch (e) {
      res.writeHead(500, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
      res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
    }
    return;
  }
  if (url.pathname === '/quota') {
    try {
      const body = await readQuota(url.searchParams.get('force') === '1');
      sendJson(req, res, body, cors);
    } catch (e) {
      res.writeHead(500, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
      res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
    }
    return;
  }
  if (url.pathname === '/balance') {
    // 异步写：请求路径上不做同步 I/O（原来是 appendFileSync）。
    fs.appendFile(HITLOG, new Date().toISOString() + '  ua=' + String(req.headers['user-agent'] || '-').slice(0, 60) + '  q=' + url.search + '\n', () => {});
    try {
      const body = await readQuota(url.searchParams.get('force') === '1');
      const rows = (body.rows || []).filter(Boolean);
      if (url.searchParams.get('format') !== 'text') {
        const infos = [];
        rows.filter((r) => !r.error && r.kind !== 'official').forEach((r) => {
          [['5h', r.fiveHourUsed, r.fiveHourCap],
           [lbl.weekly, r.weeklyUsed, r.weeklyCap],
           [lbl.monthly, r.monthUsed, r.monthCap]].forEach((w) => {
            infos.push({
              currency: r.name + ' ' + w[0],
              total_balance: pct(w[1], w[2]) + '%',
              granted_balance: String(Math.round(Number(w[2]))),
              topped_up_balance: String(Number(w[1]).toFixed(2))
            });
          });
        });
        rows.filter((r) => !r.error && r.kind === 'official').forEach((r) => {
          infos.push({
            currency: r.name + (r.currency ? ' (' + r.currency + ')' : ''),
            total_balance: Number(r.available).toFixed(2),
            granted_balance: Number(r.granted || 0).toFixed(2),
            topped_up_balance: Number(r.toppedUp || 0).toFixed(2)
          });
        });
        infos.push({
          currency: '\u6570\u636e\u65f6\u95f4',
          total_balance: (() => { const d = new Date(body.ts); const p = (n) => String(n).padStart(2, '0'); return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); })(),
          granted_balance: '\u7a97\u53e3 5h/14 \u00b7 \u5468/35 \u00b7 \u6708/70',
          topped_up_balance: ''
        });
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
        res.end(JSON.stringify({ is_available: true, balance_infos: infos }));
        return;
      }
      const line = rows.map((r) => {
        if (r.error) { return r.name + ' error'; }
        if (r.kind === 'official') { return r.name + ' ' + (r.currency || '') + ' ' + Number(r.available).toFixed(2); }
        return r.name + ' 5h ' + pct(r.fiveHourUsed, r.fiveHourCap) + '% '
          + lbl.weekly + ' ' + pct(r.weeklyUsed, r.weeklyCap) + '% '
          + lbl.monthly + ' ' + pct(r.monthUsed, r.monthCap) + '%';
      }).join('   |   ');
      res.writeHead(200, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, cors));
      res.end(line);
    } catch (e) {
      res.writeHead(500, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, cors));
      res.end('quota error');
    }
    return;
  }
  res.writeHead(404, cors); res.end();
});

// 每小时把 L1 聚合推进一次：面板打开时（即使 TTL 已过期）只需内存遍历。
// unref() 不拖住事件循环退出，纯保险。
const warmTimer = setInterval(() => {
  try {
    warmFileScan();
    // 顺手把已缓存的结果重算一遍：这样「每小时更新」是主动的，面板打开时基本都是 fresh，
    // stale 分支只在异常情况（定时器没跑成 / 进程刚从睡眠唤醒）才走到。
    for (const key of Array.from(resultCache.keys())) {
      const parts = key.split('|');
      const from = Number(parts[0]);
      try { computeAndStore(key, Number.isFinite(from) ? from : 0, parts[1] === '1'); } catch { /* 单次失败不影响其它 key */ }
    }
  } catch { /* 预热失败不影响请求路径 */ }
}, CACHE_WARM_MS);
if (warmTimer.unref) warmTimer.unref();
try { warmFileScan(); } catch {}  // 启动先热一次，首个 /cache 不必冷扫

server.listen(PORT, '127.0.0.1', () => console.log('quota-http on ' + PORT));
