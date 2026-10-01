#!/usr/bin/env node
/** Reasonix hook: print a one-line GOAT quota summary (stdout is injected into session context).
 *  Prefers the local quota endpoint (near-real-time); falls back to the goat-usage cache file. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CACHE = process.env.GOAT_QUOTA_CACHE || path.join(os.tmpdir(), 'goat-usage-cache.json');
const ENDPOINT = process.env.GOAT_QUOTA_ENDPOINT || 'http://127.0.0.1:8790/quota';
const pct = (u, c) => (Number(c) > 0 ? Math.round((100 * Number(u)) / Number(c)) : 0);
const fmt = (rows) => rows.filter(Boolean).map((r) => {
  if (r.error) { return '[' + r.name + '] 查询失败'; }
  if (r.kind === 'official') { return '[' + r.name + '] 余额 ' + (r.currency || '') + ' ' + Number(r.available).toFixed(2); }
  return '[' + r.name + '] 5h ' + pct(r.fiveHourUsed, r.fiveHourCap) + '% · 周 ' + pct(r.weeklyUsed, r.weeklyCap)
    + '% · 月 ' + pct(r.monthUsed, r.monthCap) + '%（月剩 ' + Number(r.monthLeft).toFixed(1) + '）';
}).join('   ');

async function main() {
  try {
    const res = await fetch(ENDPOINT, { signal: AbortSignal.timeout(5000) });
    const j = await res.json();
    if (j && j.ok && j.rows && j.rows.length) {
      process.stdout.write('[GOAT quota] ' + fmt(j.rows) + '\n');
      return;
    }
    throw new Error('endpoint returned no rows');
  } catch {
    try {
      const j = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
      const rows = Array.isArray(j.rows) ? j.rows : [j.rows];
      process.stdout.write('[GOAT quota] ' + fmt(rows) + '\n');
    } catch {
      process.stdout.write('[GOAT quota] unavailable（agent 可用 goat_quota 工具查询）\n');
    }
  }
}
main();