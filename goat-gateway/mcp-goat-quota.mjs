#!/usr/bin/env node
/**
 * mcp-goat-quota — 极简 stdio MCP server：把 Command Code GOAT 套餐额度暴露为一个工具。
 * 零依赖（只用 node 内置模块），Reasonix 与 dsh 可共用。
 *
 * 工具：goat_quota —— 5 小时窗口 / 本周 / 本月的已用、上限、百分比、重置时间。
 * 数据源：D:\Toolbox\goat-gateway\goat-usage.ps1（账户元数据查询，不消耗套餐额度）
 */
import { execFileSync } from 'node:child_process';
import readline from 'node:readline';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = process.env.GOAT_USAGE_SCRIPT || 'D:\\Toolbox\\goat-gateway\\goat-usage.ps1';
const PROTOCOL = '2024-11-05';
// 独立缓存文件，避免与挂件/看门狗并发写同一文件
const CACHE = path.join(os.tmpdir(), 'goat-quota-mcp-cache.json');

const TOOLS = [{
  name: 'goat_quota',
  description: '查询 Command Code GOAT 套餐额度：5 小时窗口、本周、本月的已用/上限/百分比/重置时间与本月剩余。'
    + '用于判断还能跑多少任务、是否接近限流。纯账户元数据查询，不消耗套餐额度。',
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string', description: '可选：只看某个账号（如 163 / qq）。省略则返回全部账号。' },
      raw: { type: 'boolean', description: '可选：返回原始 JSON。' }
    }
  }
}];

function runScript(extra) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-Json',
    '-CacheSeconds', '60', '-CacheFile', CACHE].concat(extra || []);
  return execFileSync('powershell', args, {
    encoding: 'utf8', timeout: 90000, windowsHide: true, maxBuffer: 4 * 1024 * 1024
  });
}

function readQuota(account) {
  const extra = account ? ['-Key', String(account)] : [];
  let out = runScript(extra);
  try {
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    // 缓存/输出异常（并发或半截 JSON）时，强制重新取数再解析一次
    out = runScript(extra.concat(['-Force']));
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
}

const pct = (u, c) => (c > 0 ? Math.round((100 * u) / c) : 0);
const num = (v) => Number(v).toFixed(2);
const reset = (ms) => {
  if (!ms) { return ''; }
  return new Date(Number(ms)).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

function format(rows) {
  const lines = rows.map((r) => {
    if (r.error) { return `[${r.name}] 查询失败：${r.error}`; }
    if (r.kind === 'official') {
      // 官方 key 不是套餐窗口，没有 5h/周/月 百分比：只报余额（赠送/充值拆分）。
      return `[${r.name}] 余额 ${r.currency || ''} ${num(r.available)}（赠送 ${num(r.granted)} · 充值 ${num(r.toppedUp)}）`;
    }
    const p5 = pct(r.fiveHourUsed, r.fiveHourCap);
    const pw = pct(r.weeklyUsed, r.weeklyCap);
    const pm = pct(r.monthUsed, r.monthCap);
    return `[${r.name}] 5h ${p5}% (${num(r.fiveHourUsed)}/${r.fiveHourCap})`
      + ` · 周 ${pw}% (${num(r.weeklyUsed)}/${r.weeklyCap}, 重置 ${reset(r.weeklyReset)})`
      + ` · 月 ${pm}% (${num(r.monthUsed)}/${num(r.monthCap)}, 剩 ${num(r.monthLeft)})`;
  });
  const worst = rows.reduce((m, r) => (r.error || r.kind === 'official' ? m : Math.max(m, pct(r.weeklyUsed, r.weeklyCap), pct(r.fiveHourUsed, r.fiveHourCap))), 0);
  const warn = worst >= 90 ? '⚠️ 已接近或超过限制' : (worst >= 70 ? '注意：已用超过 70%' : '状态正常');
  return lines.join('\n') + `\n(${warn}；单位 credits，5h 上限 14 / 周 35 / 月约 70)`;
}

const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const replyErr = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const t = line.trim();
  if (!t) { return; }
  let msg;
  try { msg = JSON.parse(t); } catch { return; }
  const { id, method, params } = msg;

  if (method === 'initialize') {
    reply(id, {
      protocolVersion: PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: 'goat-quota', version: '1.0.0' }
    });
    return;
  }
  if (method === 'notifications/initialized' || method === 'initialized') { return; }
  if (method === 'ping') { reply(id, {}); return; }
  if (method === 'tools/list') { reply(id, { tools: TOOLS }); return; }
  if (method === 'tools/call') {
    const name = params && params.name;
    const a = (params && params.arguments) || {};
    if (name !== 'goat_quota') { replyErr(id, -32602, `unknown tool: ${name}`); return; }
    try {
      const rows = readQuota(a.account);
      const text = a.raw ? JSON.stringify(rows, null, 2) : format(rows);
      reply(id, { content: [{ type: 'text', text }], isError: false });
    } catch (e) {
      reply(id, { content: [{ type: 'text', text: '查询失败: ' + (e && e.message ? e.message : String(e)) }], isError: true });
    }
    return;
  }
  if (id !== undefined) { replyErr(id, -32601, `method not found: ${method}`); }
});

rl.on('close', () => process.exit(0));