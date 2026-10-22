// 单测：stall-guard 的 toolBreaker 记账链路。
// 目的 = 用 mock ctx 走通「注册 → 事件 → 记账 → armed → pre-step 注入」全链，
// 补上此前只验证「纯逻辑 + 模块加载」而没验证「接线」的那一层。
// 用法：node ~/.dsh/storages/tools/test-stall-guard-breaker.mjs
import { pathToFileURL } from 'node:url';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MOD = process.argv[2]
  ?? 'C:/Users/27063/.dsh/.agent-presets/anchored-standard/stall-guard.mjs';
const LOG = join(tmpdir(), `stall-guard-test-${process.pid}.log`);
try { unlinkSync(LOG); } catch { /* 首次不存在 */ }

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; console.log(`  ✗ ${label}${extra === '' ? '' : `  ${extra}`}`); }
};
const readLog = () => { try { return readFileSync(LOG, 'utf8'); } catch { return ''; } };
const once = (hay, needle) => hay.split(needle).length - 1;

const handlers = new Map();
const effects = [];
const ctx = {
  on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); },
  effect(fn) { effects.push(fn); }
};

const mod = await import(pathToFileURL(MOD).href);
console.log(`module: ${MOD}`);
console.log(`exports: ${Object.keys(mod).join(', ')}`);
check('导出 apply', typeof mod.apply === 'function');
check('导出 name', typeof mod.name === 'string', `name=${mod.name}`);

mod.apply(ctx, { logPath: LOG, toolBreaker: { enabled: true, maxConsecutiveFailures: 3 } });

check('注册了 tools/post-execute', (handlers.get('tools/post-execute') ?? []).length === 1);
check('注册了两个 agent/pre-step（心跳 + breaker）', (handlers.get('agent/pre-step') ?? []).length === 2,
  "n=" + (handlers.get('agent/pre-step') ?? []).length);
const post = (handlers.get('tools/post-execute') ?? [])[0];
const preAll = handlers.get('agent/pre-step') ?? [];
// stall-guard 注册了两个 agent/pre-step：心跳一个、breaker 注入一个；取最后注册的（breaker）。
const pre = preAll.at(-1);
check('post-execute 是函数', typeof post === 'function');
check('pre-step 是函数', typeof pre === 'function');

const next = async () => ({ kind: 'accept', messages: [] });
const failed = { isError: true, content: [{ type: 'text', text: 'Error: boom' }] };
const ok = { isError: false, content: [{ type: 'text', text: 'fine' }] };
// 真机路径：命令非零退出时 dsh 只写 marker，isError 保持 false
// （dsh-tool-pwsh/lib/index.js:172 与 dsh-tool-bash/lib/index.js:167）。
const exit1 = { isError: false, content: [{ type: 'text', text: 'breaker-probe\n[exit code: 1]' }] };
const denied = { isError: false, content: [{ type: 'text', text: '[sandbox: file access denied under read-only mode]' }] };
const grepNoMatch = { isError: false, content: [{ type: 'text', text: '(no output)\n[exit code: 1]' }] };

// ── case A: exec.agent.session.id 存在（理想形状） ──────────────────────
let d = await post({ name: 'bash', agent: { session: { id: 'sess-A' } } }, failed, next);
check('A1 next 决策被原样返回', d?.kind === 'accept');
d = await post({ name: 'bash', agent: { session: { id: 'sess-A' } } }, failed, next);
check('A2 第二次失败仍不 armed（阈值 3）', !readLog().includes('BREAKER armed'));
d = await post({ name: 'bash', agent: { session: { id: 'sess-A' } } }, failed, next);
check('A3 第三次同工具失败 → BREAKER armed', once(readLog(), 'BREAKER armed') === 1,
  `armed=${once(readLog(), 'BREAKER armed')}`);
check('A3b armed 行含 sess-A 与 bash',
  readLog().includes('sess=sess-A') && readLog().includes('tool=bash'));

// ── case A→pre-step 注入 ────────────────────────────────────────────────
d = await pre({ agent: { session: { id: 'sess-A' } } }, next);
const injected = Array.isArray(d?.messages) && d.messages.length > 0 ? d.messages[d.messages.length - 1] : null;
check('A4 pre-step 注入了熔断提示', injected !== null && JSON.stringify(injected).includes('stall-guard'));
check('A4b 注入 source.kind = stall-guard', injected?.source?.kind === mod.name);
check('A4c 注入是 user 角色文本消息',
  injected?.role === 'user' && injected?.content?.[0]?.type === 'text');
check('A4d BREAKER fired 已记录', readLog().includes('BREAKER fired'));
d = await pre({ agent: { session: { id: 'sess-A' } } }, next);
check('A4e fired 后 armed 已清（不重复注入）',
  !(Array.isArray(d?.messages) && JSON.stringify(d.messages).includes('stall-guard')));

// ── case B: 只有 agent 对象、没有 session.id（退化 key） ─────────────────
const bareAgent = {};                      // 无 session 字段
await post({ name: 'grep', agent: bareAgent }, failed, next);
await post({ name: 'grep', agent: bareAgent }, failed, next);
await post({ name: 'grep', agent: bareAgent }, failed, next);
check('B1 退化 key（agent 对象）也能 armed', once(readLog(), 'BREAKER armed') === 2,
  `armed=${once(readLog(), 'BREAKER armed')}`);
check('B1b 退化 arm 的 tool=grep', readLog().includes('tool=grep'));

// ── case C: 完全无 agent → 记 key=null 但不崩 ────────────────────────────
d = await post({ name: 'bash' }, failed, next);
check('C1 无 agent 不抛错且返回决策', d?.kind === 'accept');
check('C1b 无 agent 不产生 armed', once(readLog(), 'BREAKER armed') === 2);

// ── case D: 成功调用会清零同工具计数 ────────────────────────────────────
const agentD = { session: { id: 'sess-D' } };
await post({ name: 'bash', agent: agentD }, failed, next);
await post({ name: 'bash', agent: agentD }, failed, next);
await post({ name: 'bash', agent: agentD }, ok, next);        // 成功 → 清零
await post({ name: 'bash', agent: agentD }, failed, next);
check('D1 成功后计数清零（未达阈值不 armed）', once(readLog(), 'BREAKER armed') === 2,
  `armed=${once(readLog(), 'BREAKER armed')}`);

// ── case E: 换工具重置计数 ──────────────────────────────────────────────
const agentE = { session: { id: 'sess-E' } };
await post({ name: 'bash', agent: agentE }, failed, next);
await post({ name: 'bash', agent: agentE }, failed, next);
await post({ name: 'grep', agent: agentE }, failed, next);    // 换工具
await post({ name: 'grep', agent: agentE }, failed, next);
await post({ name: 'grep', agent: agentE }, failed, next);    // grep 第 3 次 → armed
check('E1 换工具后按新工具重新计数并 armed', once(readLog(), 'BREAKER armed') === 3,
  `armed=${once(readLog(), 'BREAKER armed')}`);

// ── case G: 真机路径 —— 非零退出码只以 marker 出现在文本里，isError=false ──
const agentG = { session: { id: 'sess-G' } };
await post({ name: 'bash', agent: agentG }, exit1, next);
await post({ name: 'bash', agent: agentG }, exit1, next);
check('G1 两次 [exit code: 1] 失败仍不 armed（阈值 3）', once(readLog(), 'BREAKER armed') === 3,
  `armed=${once(readLog(), 'BREAKER armed')}`);
await post({ name: 'bash', agent: agentG }, exit1, next);
check('G2 第三次 [exit code: 1] → armed（真机路径，isError=false）',
  once(readLog(), 'BREAKER armed') === 4, `armed=${once(readLog(), 'BREAKER armed')}`);
check('G3 armed 行含 sess=sess-G', readLog().includes('sess=sess-G'));
d = await pre({ agent: agentG }, next);
check('G4 真机路径同样 fired', Array.isArray(d?.messages) && d.messages.length > 0 &&
  d.messages[d.messages.length - 1]?.source?.kind === mod.name);

// ── case H: 其他失败 marker（sandbox denial） ─────────────────────────────
const agentH = { session: { id: 'sess-H' } };
await post({ name: 'bash', agent: agentH }, denied, next);
await post({ name: 'bash', agent: agentH }, denied, next);
await post({ name: 'bash', agent: agentH }, denied, next);
check('H1 sandbox denial marker 也算失败', once(readLog(), 'BREAKER armed') === 5,
  `armed=${once(readLog(), 'BREAKER armed')}`);

// ── case I: 反例 —— 成功输出不得被误判（防假阳性） ────────────────────────
const agentI = { session: { id: 'sess-I' } };
const successish = { isError: false, content: [{ type: 'text', text: 'command exited with status 0\nall good' }] };
await post({ name: 'bash', agent: agentI }, successish, next);
await post({ name: 'bash', agent: agentI }, successish, next);
await post({ name: 'bash', agent: agentI }, successish, next);
check('I1 无 marker 的成功输出不 armed', once(readLog(), 'BREAKER armed') === 5,
  `armed=${once(readLog(), 'BREAKER armed')}`);
check('I2 失败的 grep 无匹配（exit code 1）确实计入', once(readLog(), 'tool=grep failed=true') >= 3);

// ── 插桩本身 ────────────────────────────────────────────────────────────
check('F1 插桩日志（BREAKER seen#）已写入', readLog().includes('BREAKER seen#1'));
check('F2 插桩记录了 agent=MISSING 的分支', readLog().includes('agent=MISSING'));
check('F3 插桩记录了 agent=ok 的分支', readLog().includes('agent=ok'));

console.log('');
console.log(readLog().split('\n').filter((l) => l.trim() !== '').join('\n'));
console.log('');
console.log(`${pass} passed / ${fail} failed`);
try { unlinkSync(LOG); } catch { /* ignore */ }
process.exit(fail === 0 ? 0 : 1);
