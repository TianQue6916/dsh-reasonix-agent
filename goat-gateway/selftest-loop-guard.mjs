// selftest-loop-guard.mjs — loop-guard 单元验证 + 样本测量
// 跑法：node selftest-loop-guard.mjs

import assert from 'node:assert/strict';
import { NoveltyWindow, detectPeriod, SseDeltaParser, LoopGuard } from './loop-guard.mjs';

const r4 = (x) => Math.round(x * 10000) / 10000;
let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

console.log('\n=== Part A: 单元 ===');

test('NoveltyWindow: 全新鲜文本 -> novelty ~ 1', () => {
  const w = new NoveltyWindow(6, 256);
  for (let i = 0; i < 4000; i++) w.push(String.fromCodePoint(0x4e00 + (i % 20000)));
  assert.ok(w.ready);
  assert.ok(w.novelty > 0.98, `expected >0.98 got ${w.novelty}`);
});

test('NoveltyWindow: 单字符恒定 -> novelty = 1/capacity', () => {
  const w = new NoveltyWindow(6, 256);
  for (let i = 0; i < 2000; i++) w.push('x');
  assert.equal(w.count.size, 1);
  assert.ok(Math.abs(w.novelty - 1 / 256) < 1e-9, `got ${w.novelty}`);
});

test('NoveltyWindow: 周期 p 的序列 -> novelty = p/capacity', () => {
  const w = new NoveltyWindow(6, 256);
  const block = 'abcde';
  for (let i = 0; i < 3000; i++) w.push(block[i % block.length]);
  assert.equal(w.count.size, 5, `period-5 with n=6 should give 5 distinct grams, got ${w.count.size}`);
  assert.ok(Math.abs(w.novelty - 5 / 256) < 1e-9, `got ${w.novelty}`);
});

test('NoveltyWindow: 滑出淘汰后 count 不泄漏', () => {
  const w = new NoveltyWindow(6, 128);
  for (let i = 0; i < 5000; i++) w.push(String.fromCodePoint(0x4e00 + (i % 20000)));
  assert.ok(w.count.size <= 128, `count.size=${w.count.size} exceeds capacity`);
  assert.equal(w.filled, 128);
});

test('detectPeriod: 精确周期命中', () => {
  const r = detectPeriod('abcdef'.repeat(10), { maxPeriod: 64, minRepeats: 4, minBlockNonSpace: 3 });
  assert.ok(r, 'should hit');
  assert.equal(r.period, 6);
});

test('detectPeriod: 纯标点重复不误报', () => {
  const o = { maxPeriod: 64, minRepeats: 4, minBlockNonSpace: 3 };
  assert.equal(detectPeriod('.'.repeat(40), o), null);
  assert.equal(detectPeriod('-'.repeat(40), o), null);
  assert.equal(detectPeriod('\n'.repeat(40), o), null);
});

test('detectPeriod: 无周期文本不命中', () => {
  const t = '这是一段正常的中文技术描述，讲的是滑动窗口内 n-gram 唯一率的定义与它的信息论解释。';
  assert.equal(detectPeriod(t, { maxPeriod: 64, minRepeats: 4, minBlockNonSpace: 3 }), null);
});

test('SseDeltaParser: LF 分隔多 event', () => {
  assert.equal(new SseDeltaParser().feed('data: {"a":1}\n\ndata: {"b":2}\n\n').length, 2);
});

test('SseDeltaParser: CRLF 分隔', () => {
  assert.equal(new SseDeltaParser().feed('data: {"a":1}\r\n\r\n').length, 1);
});

test('SseDeltaParser: 跨 chunk 分片（帧中间切断）', () => {
  const p = new SseDeltaParser();
  assert.equal(p.feed('data: {"choices":[{"delta":{"cont').length, 0);
  assert.equal(p.feed('ent":"hello"}}]}').length, 0);
  const evs = p.feed('\n\n');
  assert.equal(evs.length, 1, 'should emit exactly one event');
  assert.equal(SseDeltaParser.extract(evs[0]).content, 'hello');
});

test('SseDeltaParser: CRLF 本身跨 chunk 边界', () => {
  const p = new SseDeltaParser();
  p.feed('data: {"x":1}\r');
  assert.equal(p.feed('\n\r\n').length, 1, 'CRLF split across chunks must still frame');
});

test('SseDeltaParser: 逐字符喂入也能切对', () => {
  const p = new SseDeltaParser();
  const s = 'data: {"choices":[{"delta":{"content":"abc"}}]}\n\n';
  const got = [];
  for (const ch of s) got.push(...p.feed(ch));
  assert.equal(got.length, 1);
});

test('SseDeltaParser.extract: [DONE] / reasoning 双字段名 / 无 choices', () => {
  assert.equal(SseDeltaParser.extract('data: [DONE]').done, true);
  assert.equal(SseDeltaParser.extract('data: {"choices":[{"delta":{"reasoning_content":"abc"}}]}').reasoning, 'abc');
  assert.equal(SseDeltaParser.extract('data: {"choices":[{"delta":{"reasoning":"xyz"}}]}').reasoning, 'xyz');
  assert.equal(SseDeltaParser.extract('data: {"a":1}'), null, 'no choices and no usage -> null');
  assert.deepEqual(SseDeltaParser.extract('data: {"usage":{"total_tokens":5}}'), { usage: { total_tokens: 5 } });
});

test('SseDeltaParser.extract: 坏 JSON 不抛，标记 malformed', () => {
  assert.equal(SseDeltaParser.extract('data: {"choices":[').malformed, true);
});

test('LoopGuard: enabled=false 时完全惰性', () => {
  const g = new LoopGuard({ enabled: false }, () => {}, null);
  g.begin({ reqId: 'r1' });
  assert.equal(g.feed('r1', 'x'.repeat(5000), 'reasoning'), null);
  assert.equal(g.attempts.size, 0, 'disabled guard must not allocate state');
});

test('LoopGuard: 命中后 cooldown 内不重复报', () => {
  const hits = [];
  const g = new LoopGuard(
    { enabled: true, mode: 'shadow', channels: ['reasoning'],
      thresholds: { reasoning: { fast: 0.9, slow: 1.0 } } },
    () => {}, null,
  );
  g.begin({ reqId: 'r2' });
  for (const ch of 'aaaabbbbcccc'.repeat(600)) {
    const h = g.feed('r2', ch, 'reasoning');
    if (h) hits.push(h.atChars);
  }
  assert.ok(hits.length >= 1, 'loose threshold must fire at least once');
  for (let i = 1; i < hits.length; i++) {
    assert.ok(hits[i] - hits[i - 1] >= 512, `refire gap should be >=512, got ${hits[i] - hits[i - 1]}`);
  }
});

test('LoopGuard: 未注册 channel 直接跳过', () => {
  const g = new LoopGuard({ enabled: true, channels: ['reasoning'] }, () => {}, null);
  g.begin({ reqId: 'r3' });
  assert.equal(g.feed('r3', 'x'.repeat(5000), 'tool'), null);
});

test('LoopGuard: end 后清理状态（Map 不泄漏）', () => {
  const g = new LoopGuard({ enabled: true, channels: ['text'] }, () => {}, null);
  g.begin({ reqId: 'r4' });
  g.feed('r4', 'normal text here. '.repeat(100), 'text');
  g.end('r4', { reason: 'done' });
  assert.equal(g.attempts.size, 0);
});

// ════════ Part B — 样本测量 ════════
//
// 样本构造原则：必须忠实还原真实形态。
//   退化样本 = 小短语池（6~18 个）+ 多轮重复。
//   若每个短语只出现一次（第一版的错误），它根本不是循环，测出的 novelty 必然偏高。
//   正常样本必须真正多样，不能靠重复同一段凑长度。

const DEG_POOL = ['好。', '写。', '输出。', '（...）', '（写。）', '（输出。）'];
const SAMPLE_DEGENERATE = Array.from({ length: 100 }, () => DEG_POOL).flat().join('\n\n');

const STALL_POOL = [
  '好。', '写。', '输出。', '现在写。', '写 create 调用。', 'OK 写。',
  '我写。', '（写。）', '（输出。）', '（够了。）', '（...）', 'Write.',
  '好，写。', '输出 create。', '（真的输出。）', '我输出。', 'OK。', '停。写。',
];
const SAMPLE_STALL = Array.from({ length: 40 }, () => STALL_POOL).flat().join('\n\n');

const SAMPLE_NORMAL = [
  '滑动窗口的 novelty 定义在一个长度为 W 的窗口上：窗口里所有 n-gram 中不同的那部分占多大比例。如果模型每一步都在引入新的 token 组合，这个比例就接近一；一旦它开始反复使用同一批短语，比例会迅速塌下去。分子是窗口内不同 gram 的种类数，分母是窗口内 gram 的总数，两者都能在滑动时增量维护，所以统计本身的开销与窗口长度无关。',
  '要注意这个量和 token 熵不是一回事。token 熵衡量模型分布有多平，novelty 衡量实际吐出来的序列有多新。温度较高时这两个量会分道扬镳：一个在三个词之间随机挑选的循环，分布看起来很平，但序列的 novelty 会掉到周期的倒数。所以观测量必须选序列而不是分布，这也是为什么单纯监控输出分布的做法在高温采样下会失效。',
  '周期确认是第二道闸。快窗口报出低 novelty 之后，再对尾部若干字符做一次朴素扫描，找最小的 p，使得最后 p 乘 k 个字符严格周期为 p。这一步不做判定，只做诊断，把 period 和 repeats 写进日志，方便事后按 grep 定位到底是哪一类退化。诊断与判定分离的好处是阈值可以调，而诊断记录不会因为阈值变化而失效。',
  '误报主要来自两个方向。第一是代码块里的缩进与分隔线，它们天然重复；第二是 markdown 表格的对齐行。这两类重复的共同点是块内几乎没有内容字符，所以加一条 minBlockNonSpace 约束就能滤掉绝大部分。剩下滤不掉的，交给慢窗口做否决：慢窗口跨越的尺度足够大，一段合法的局部重复在更大的背景里仍然是有信息量的。',
  '阈值必须实测校准，不能拍脑袋。正确做法是先跑 shadow 模式，只记录不干预，攒够样本之后看 novelty 的分布，找到两类分布的分离点。reasoning 段和 text 段的 baseline 差别很大，必须分开统计、分开设阈值。样本本身也要真实，否则校准出来的阈值会偏，而偏掉的阈值在生产里要么疯狂误杀，要么永远不触发。',
  '接入 SSE 时最容易炸的地方是帧边界。绝不能在帧中间断流，必须先攒到完整的双换行边界，再从 data 行取 JSON。半个 JSON 会让下游 parser 直接抛错，客户端会把它当成网络错误走重试路径，反而更费额度。所以中断动作必须发生在事件边界上，而且要么补一个合成的终止帧，要么让下游能从截断里恢复。',
  '真正省钱的位置在上游连接。agent 层的 hook 只能看到已经生成的文本，此时 token 已经计费；只有把上游的 socket 断掉，才能让 provider 停止生成。这也解释了为什么两层的职责必须分开：上层负责判断这是不是退化，下层负责执行停止付费。职责混在一起会同时损失判断精度和止损速度。',
  '建立这套机制的顺序也很重要。先只记录，拿到真实分布再决定阈值；确认阈值不会误杀之后，才打开中断；中断稳定之后再考虑自动续写。自动续写放在最后，因为它依赖前两步的可信度，而且续写本身会引入新的失败模式，比如在一个残缺的句子后面接着写，产生语义断裂。',
].join('\n\n');

const SAMPLE_CODE = [
'// utils/index.js —— 一组互相独立的小工具，真实项目里常见的形态',
'// （对照：旧样本把同一个类重复 6 遍，那是「合法重复的下界」，不是正常代码）',
'',
'export function parseArgs(argv) {',
'  const out = { flags: {}, rest: [] };',
'  for (let i = 0; i < argv.length; i++) {',
'    const a = argv[i];',
'    if (a.startsWith("--")) {',
'      const eq = a.indexOf("=");',
'      if (eq >= 0) out.flags[a.slice(2, eq)] = a.slice(eq + 1);',
'      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out.flags[a.slice(2)] = argv[++i];',
'      else out.flags[a.slice(2)] = true;',
'    } else {',
'      out.rest.push(a);',
'    }',
'  }',
'  return out;',
'}',
'',
'export async function httpGet(url, { timeoutMs = 15000, headers = {} } = {}) {',
'  const ctrl = new AbortController();',
'  const timer = setTimeout(() => ctrl.abort(), timeoutMs);',
'  try {',
'    const res = await fetch(url, { headers, signal: ctrl.signal });',
'    const buf = await res.arrayBuffer();',
'    return { status: res.status, body: Buffer.from(buf), headers: res.headers };',
'  } finally {',
'    clearTimeout(timer);',
'  }',
'}',
'',
'export function debounce(fn, waitMs) {',
'  let t = null;',
'  let lastArgs = null;',
'  return function debounced(...args) {',
'    lastArgs = args;',
'    if (t) clearTimeout(t);',
'    t = setTimeout(() => {',
'      t = null;',
'      const a = lastArgs;',
'      lastArgs = null;',
'      fn.apply(this, a);',
'    }, waitMs);',
'  };',
'}',
'',
'export async function retry(fn, { attempts = 3, baseMs = 200, factor = 2, jitter = 0.2 } = {}) {',
'  let err = null;',
'  for (let i = 0; i < attempts; i++) {',
'    try {',
'      return await fn(i);',
'    } catch (e) {',
'      err = e;',
'      if (i === attempts - 1) break;',
'      const base = baseMs * Math.pow(factor, i);',
'      const extra = base * jitter * Math.random();',
'      await new Promise((r) => setTimeout(r, base + extra));',
'    }',
'  }',
'  throw err;',
'}',
'',
'export function normalizePath(p, { sep = "/" } = {}) {',
'  const parts = String(p).split(/[\/]+/);',
'  const stack = [];',
'  for (const part of parts) {',
'    if (part === "" || part === ".") continue;',
'    if (part === "..") {',
'      if (stack.length > 1) stack.pop();',
'      continue;',
'    }',
'    stack.push(part);',
'  }',
'  return stack.join(sep);',
'}',
'',
'export function csvParse(text, { delimiter = "," } = {}) {',
'  const rows = [];',
'  let row = [];',
'  let field = "";',
'  let inQuotes = false;',
'  for (let i = 0; i < text.length; i++) {',
'    const ch = text[i];',
'    if (inQuotes) {',
'      if (ch === String.fromCharCode(34) && text[i + 1] === String.fromCharCode(34)) {',
'        field += String.fromCharCode(34);',
'        i++;',
'      } else if (ch === String.fromCharCode(34)) {',
'        inQuotes = false;',
'      } else {',
'        field += ch;',
'      }',
'    } else if (ch === String.fromCharCode(34)) {',
'      inQuotes = true;',
'    } else if (ch === delimiter) {',
'      row.push(field);',
'      field = "";',
'    } else if (ch === String.fromCharCode(10)) {',
'      row.push(field);',
'      rows.push(row);',
'      row = [];',
'      field = "";',
'    } else if (ch !== String.fromCharCode(13)) {',
'      field += ch;',
'    }',
'  }',
'  if (field.length > 0 || row.length > 0) {',
'    row.push(field);',
'    rows.push(row);',
'  }',
'  return rows;',
'}',
'',
'export class RollingCounter {',
'  constructor(windowMs) {',
'    this.windowMs = windowMs;',
'    this.buckets = new Map();',
'  }',
'  add(key, atMs) {',
'    const list = this.buckets.get(key) || [];',
'    list.push(atMs);',
'    this.buckets.set(key, list);',
'    this.prune(atMs);',
'  }',
'  count(key) {',
'    const list = this.buckets.get(key);',
'    return list ? list.length : 0;',
'  }',
'  prune(nowMs) {',
'    const cutoff = nowMs - this.windowMs;',
'    for (const [key, list] of this.buckets) {',
'      const kept = list.filter((t) => t >= cutoff);',
'      if (kept.length === 0) this.buckets.delete(key);',
'      else this.buckets.set(key, kept);',
'    }',
'  }',
'}',
'',
'export function chunk(list, size) {',
'  const out = [];',
'  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));',
'  return out;',
'}',
].join(String.fromCharCode(10));

const SAMPLE_MD = [
'# 网关拦截点对照',
'',
'| 拦截点 | 位置 | 覆盖面 | 能否真止损 | 备注 |',
'| --- | --- | --- | --- | --- |',
'| gateway | upRes.on data | 全客户端 | 能 | destroy 上游连接即可 |',
'| dsh hook | agent/assistant-stream | 仅 dsh | 不能 | 只能 cancel，连接后续仍由 client 收尾 |',
'| dsh hook | agent/turn-stopping | 仅 dsh | 不能 | 边界已提交，只能 steer 下一轮 |',
'| 采样层 | presence_penalty | 全客户端 | 不适用 | 影响生成，不检测 |',
'| 检测层 | novelty window | 全客户端 | 不适用 | 纯观测 |',
'',
'## 设计原则',
'',
'1. **先观测再干预**：第一版只记录，不改变任何转发行为。',
'2. **阈值必须实测**：不能拍脑袋定，要用真实分布里的分位数。',
'3. **分通道统计**：reasoning 与 text 的基率差别很大，阈值必须分开。',
'4. **触发后要冷却**：否则一次长循环会往日志里刷几百条。',
'5. **多尺度互补**：大窗口准、小窗口快，两者是 OR 不是 AND。',
'6. **失败要安全**：检测器自身抛异常绝不能让正常请求失败。',
'',
'## 端口占用排查',
'',
'```bash',
'netstat -ano | grep :8899',
'tasklist /FI "PID eq 28596"',
'```',
'',
'如果端口被常驻服务占着，换端口而不是杀进程。',
'',
'## 日志格式',
'',
'每行一个 JSON，字段包括 `ts` / `reqId` / `model` / `sess` / `chans` / `hits`，',
'`chans` 里每个通道有 `chars` / `fast` / `slow` / `long` / `samples`。',
'',
'## 常见误报来源',
'',
'- 大段缩进或分隔线：短窗口会塌，长窗口不会。',
'- 表格与列表：结构重复但内容不同，长窗口能分辨。',
'- 严格的 XML / JSON 输出：标签重复率高，但词汇量足够。',
'- 大段 base64 或哈希：字符熵高，novelty 反而高。',
'',
'## 下一步',
'',
'1. 在真实流量上跑 shadow，收集分布。',
'2. 用收集到的分位数重新校准阈值。',
'3. 确认误报率可接受后，打开 abort。',
'4. 评估与进程内熔断器是否冲突。',
].join(String.fromCharCode(10));

const CAPS = [256, 512, 1024, 2048, 4096];

function measure(label, text) {
  const wins = CAPS.map((c) => new NoveltyWindow(6, c));
  const mins = CAPS.map(() => null);
  for (const ch of text) {
    for (let k = 0; k < wins.length; k++) {
      wins[k].push(ch);
      if (wins[k].ready && (mins[k] === null || wins[k].novelty < mins[k])) mins[k] = wins[k].novelty;
    }
  }
  const finals = wins.map((w) => (w.ready ? w.novelty : null));
  console.log(`\n-- ${label}  (${text.length} chars)`);
  const fmt = (x) => (x === null ? '  --  ' : r4(x).toFixed(4).padStart(6));
  console.log('   ' + CAPS.map((c, k) => `${String(c).padStart(4)}:${fmt(finals[k])}/${fmt(mins[k])}`).join('  '));
  return { label, len: text.length, finals, mins };
}

console.log('\n=== Part B: 多尺度 novelty 测量 ===');
console.log('   格式  <capacity>:<final>/<min>');

const samples = [
  ['DEGENERATE  degenerate loop', 'abnormal', SAMPLE_DEGENERATE],
  ['STALL       deadlock first half', 'abnormal', SAMPLE_STALL],
  ['NORMAL      chinese prose', 'normal', SAMPLE_NORMAL],
  ['CODE        code block', 'normal', SAMPLE_CODE],
  ['MD          markdown table/list', 'normal', SAMPLE_MD],
];

const results = samples.map(([label, kind, text]) => ({ ...measure(label, text), kind }));

console.log('\n=== 分离度（final 值；正常侧取最坏情况）===');
console.log('   capacity |  正常最坏  |  异常最好  |  结论');
for (let k = 0; k < CAPS.length; k++) {
  const normals = results.filter((r) => r.kind === 'normal' && r.finals[k] !== null).map((r) => r.finals[k]);
  const abnorms = results.filter((r) => r.kind === 'abnormal' && r.finals[k] !== null).map((r) => r.finals[k]);
  if (normals.length === 0 || abnorms.length === 0) {
    console.log(`   ${String(CAPS[k]).padStart(8)} |   (sample not full yet, skipped)`);
    continue;
  }
  const worstNormal = Math.min(...normals);
  const bestAbnormal = Math.max(...abnorms);
  const gap = worstNormal - bestAbnormal;
  console.log(
    `   ${String(CAPS[k]).padStart(8)} | ${r4(worstNormal).toFixed(4).padStart(9)} | ${r4(bestAbnormal).toFixed(4).padStart(9)} | ` +
      (gap > 0 ? `separable [${r4(bestAbnormal)}, ${r4(worstNormal)}] width=${r4(gap).toFixed(4)}`
               : `OVERLAP ${r4(-gap).toFixed(4)}`),
  );
}

console.log('\n=== min 值（全程最低点）===');
console.log('  ' + 'sample'.padEnd(34) + CAPS.map((c) => String(c).padStart(10)).join(''));
for (const r of results) {
  console.log('  ' + r.label.padEnd(32) + r.mins.map((m) => (m === null ? '--' : r4(m).toFixed(4)).padStart(10)).join(''));
}


// ════════ Part C — 端到端：用 loop-guard.mjs 的真实默认阈值判定 ════════
// Part B 只测了统计量；Part C 才回答「这套阈值到底会不会误杀 / 漏抓」。

const { DEFAULT_LOOP_GUARD } = await import('./loop-guard.mjs');

// 模拟 CoT：语义在推进，但充满「好」「让我」「现在」这类套话 ——
// 这是 reasoning 段的真实 baseline，也是为什么 reasoning 阈值必须比 text 更紧。
const SAMPLE_COT = [
'好，先确认这个文件在不在。让我看看路径。',
'嗯，应该在 Toolbox 下面。先 ls 一下目录。',
'好，文件在。那我读一下它的结构。',
'现在我需要找到 upRes 的 data handler。',
'让我 grep 一下 on data 的位置。',
'好，位置确定了。接下来要在它前面插一个 hook。',
'注意这里不能阻塞转发，所以统计必须同步且 O(1)。',
'好，那我用一个 ring buffer 加一个计数 Map。',
'滑出的时候要把计数减掉，减到零就 delete 掉。',
'好。接下来是阈值从哪里来。',
'配置段应该放在 config.json 的顶层。',
'好，那我加一个 loopGuard 段进去。',
'默认关闭，shadow 阶段再手动打开。',
'好，现在想一下怎么接进去。',
'import 两行，然后在 data 回调里喂进去。',
'注意 reqId 要能唯一标识一次上游请求。',
'好，那就沿用现有的 reqId 字段。',
'落盘用异步 stream，绝对不能用 appendFileSync。',
'好。那命中之后要做什么。',
'命中之后先只记日志，不干预转发。',
'等阈值校准完再打开 abort。',
'好，那我先把文件写出来。',
'写完跑一遍 selftest，确认没有回归。',
'好。如果分离度不够，就先加长样本。',
'现在还要考虑 reasoning 段的 baseline。',
'它天然比正文更重复，所以阈值要单独设。',
'好，那就分开两套阈值，按 channel 取。',
'最后是续写的部分，放在后面做。',
].join('\n');

const E2E = [
  ['DEGENERATE  degenerate loop', 'abnormal', SAMPLE_DEGENERATE],
  ['STALL       deadlock first half', 'abnormal', SAMPLE_STALL],
  ['COT         chain-of-thought', 'normal', SAMPLE_COT],
  ['NORMAL      chinese prose', 'normal', SAMPLE_NORMAL],
  ['CODE        code block', 'normal', SAMPLE_CODE],
  ['MD          markdown table/list', 'normal', SAMPLE_MD],
];

console.log('\n=== Part C: 端到端阈值验证 ===');
console.log('  text 阈值 ' + JSON.stringify(DEFAULT_LOOP_GUARD.thresholds.text) +
            ' / reasoning 阈值 ' + JSON.stringify(DEFAULT_LOOP_GUARD.thresholds.reasoning));
console.log('  触发规则：slow 命中即可；fast 命中需 slow 未就绪或认同\n');

let e2eFail = 0;
for (const [label, kind, text] of E2E) {
  const g = new LoopGuard(
    { ...DEFAULT_LOOP_GUARD, enabled: true, channels: ['text'] }, () => {}, null);
  g.begin({ reqId: 'e2e', model: 'selftest' });
  let first = null;
  for (let i = 0; i < text.length; i += 64) {
    const h = g.feed('e2e', text.slice(i, i + 64), 'text');
    if (h && !first) first = h;
  }
  g.end('e2e', { reason: 'selftest' });

  const shouldFire = kind === 'abnormal';
  const ok = shouldFire === !!first;
  if (!ok) e2eFail++;
  const detail = first
    ? `FIRED at ${first.atChars}ch via ${first.reason} fast=${first.fast} slow=${first.slow}` +
      (first.period ? ` period=${first.period.period}x${first.period.repeats}` : ' period=none')
    : 'no fire';
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} ${detail}`);
}

console.log(`\nPart C: ${e2eFail === 0 ? 'ALL AS EXPECTED' : e2eFail + ' MISMATCH'}`);
failures += e2eFail;

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
