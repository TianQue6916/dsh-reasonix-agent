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
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const PORT = Number(process.env.QUOTA_HTTP_PORT || 8790);
const SCRIPT = process.env.GOAT_USAGE_SCRIPT || 'D:\\Toolbox\\goat-gateway\\goat-usage.ps1';
const CACHE = path.join(os.tmpdir(), 'goat-quota-http-cache.json');
const TTL_MS = 10000;
const HITLOG = 'D:\\Toolbox\\goat-gateway\\logs\\balance-hits.log';

let last = { at: 0, body: null };

function run(extra) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Json',
    '-CacheSeconds', '10', '-CacheFile', CACHE].concat(extra || []);
  return execFileSync('powershell', args, { encoding: 'utf8', timeout: 90000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
}

function readQuota(force) {
  const now = Date.now();
  if (!force && last.body && now - last.at < TTL_MS) { return last.body; }
  let parsed;
  try { parsed = JSON.parse(run(force ? ['-Force'] : [])); }
  catch { parsed = JSON.parse(run(['-Force'])); }
  const body = { ok: true, ts: new Date().toISOString(), rows: Array.isArray(parsed) ? parsed : [parsed] };
  last = { at: now, body };
  return body;
}

const pct = (u, c) => (Number(c) > 0 ? Math.round((100 * Number(u)) / Number(c)) : 0);
const lbl = { fiveHour: '5h', weekly: '\u5468', monthly: '\u6708' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-store'
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (url.pathname === '/health') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname === '/quota') {
    try {
      const body = readQuota(url.searchParams.get('force') === '1');
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
      res.end(JSON.stringify(body));
    } catch (e) {
      res.writeHead(500, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors));
      res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
    }
    return;
  }
  if (url.pathname === '/balance') {
    try { fs.appendFileSync(HITLOG, new Date().toISOString() + '  ua=' + String(req.headers['user-agent'] || '-').slice(0, 60) + '  q=' + url.search + '\n'); } catch {}
    try {
      const body = readQuota(url.searchParams.get('force') === '1');
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

server.listen(PORT, '127.0.0.1', () => console.log('quota-http on ' + PORT));
