#!/usr/bin/env node
/**
 * repro-headroom-searchfold.mjs
 *
 * 最小复现：dsh-headroom 的 search-fold 会把「形如 NN:NN... 的时间戳行」误判成
 * `file:line[:col]: content` 的 grep 结果，然后**重写内容、丢弃第一段**。
 *
 * 源码位置（desktop profile 的副本）：
 *   ~/.dsh/profiles/desktop/node_modules/dsh-headroom/lib/compress.js:263
 *     const SEARCH_LINE_RE = /^(.+?):(\d+)(?::(\d+))?:(.*)$/
 *   :296     out.push(`${match.lineNo}${colText}: ${match.rest}`)
 *   :284-285 门槛：matched >= 3 且 matched / totalNonEmpty >= 0.5
 *
 * 实测观测（本 session 真实发生）：`23:10:17` 被改写成 `10: 17`
 * 推导：`23:10:17.521 …`
 *   ^(.+?)   → "23"      （非贪婪，停在第一个冒号前）
 *   :(\d+)   → ":10"
 *   (?::(\d+))? → 尝试 ":17" 但后面是 "." 不是 ":" ⇒ 回溯跳过
 *   :        → ":"
 *   (.*)$    → "17.521 …"
 *   ⇒ 输出 `${lineNo}: ${rest}` = "10: 17.521 …"   ← "23" 整段消失
 *
 * 用法：node repro-headroom-searchfold.mjs
 */
const TARGET = process.env.HEADROOM_COMPRESS ??
  'file:///C:/Users/27063/.dsh/profiles/desktop/node_modules/dsh-headroom/lib/compress.js'

const mod = await import(TARGET)
const { compressSearchText } = mod.internals
const limits = { maxSearchMatchesPerFile: 5 }

function show(label, input, output) {
  console.log(`\n=== ${label} ===`)
  console.log('--- INPUT ---')
  console.log(input)
  console.log('--- OUTPUT ---')
  console.log(output === null ? '(null — 未触发 fold，原样保留)' : output)
  if (output !== null) {
    // 逐行比对：输出里是否还能找到输入的每一行原文
    const inLines = input.split('\n').filter((l) => l !== '')
    const outText = output
    const missing = inLines.filter((l) => !outText.includes(l))
    console.log(`--- 判定: ${missing.length === 0 ? '✅ 每一行原文都还在' : `❌ ${missing.length}/${inLines.length} 行原文被改写`} ---`)
    for (const l of missing.slice(0, 3)) console.log(`    丢失原文: ${l}`)
  }
}

// ── case 1: 时间戳行（4 行，全命中正则 ⇒ 满足 matched>=3 且占比 1.0）──
const timestamps = [
  '2026-10-04 23:10:17.521 host wrote file A',
  '2026-10-04 23:10:18.100 host wrote file B',
  '2026-10-04 23:10:19.900 host wrote file C',
  '2026-10-04 23:10:20.001 host wrote file D',
].join('\n')
show('case 1: 时间戳（应当原样保留）', timestamps, compressSearchText(timestamps, limits))

// ── case 2: 对照组 —— 真正的 grep 输出（fold 应当正常工作）──
const grep = [
  'src/index.ts:12:const a = 1',
  'src/index.ts:44:const b = 2',
  'src/index.ts:91:const c = 3',
  'src/util.ts:7:export function f() {',
  'src/util.ts:19:export function g() {',
].join('\n')
show('case 2: 真 grep 输出（fold 是正常行为）', grep, compressSearchText(grep, limits))

// ── case 3: 端口/比例对，同样会被吃掉 ──
const ports = [
  'listen 127.0.0.1:8788 ok',
  'listen 127.0.0.1:3080 ok',
  'listen 127.0.0.1:18787 ok',
].join('\n')
show('case 3: 冒号数字对', ports, compressSearchText(ports, limits))

// ── 建议修法验证 ──
// 现用：/^(.+?):(\d+)(?::(\d+))?:(.*)$/
// 两处问题：① `.+?` 允许 file 段含空格 ⇒ "2026-10-04 23" 被当成文件名
//          ② file 段允许纯数字   ⇒ "23:10:17" 被当成 file=23, line=10
// 建议：`\S+?` 替换 `.+?` + 纯数字 file 段跳过
console.log('\n=== 建议修法验证 ===')
const OLD = /^(.+?):(\d+)(?::(\d+))?:(.*)$/
const NEW = /^(\S+?):(\d+)(?::(\d+))?:(.*)$/
const cases = [
  ['时间戳（含空格）', '2026-10-04 23:10:17.521 host wrote file A'],
  ['裸时间戳（无空格）', '23:10:17.521 host wrote file A'],
  ['真 grep 输出', 'src/index.ts:12:const a = 1'],
  ['Windows 路径 grep', 'C:\\Users\\x.js:120:const b = 2'],
  ['Makefile（无扩展名）', 'Makefile:7:all:'],
]
for (const [label, line] of cases) {
  const o = OLD.exec(line)
  const n = NEW.exec(line)
  const nGuarded = n !== null && /^\d+$/.test(n[1]) ? null : n
  const fmt = (m) => (m === null ? '不匹配' : `file=${JSON.stringify(m[1])} line=${m[2]} col=${m[3] ?? '-'}`)
  console.log(`  ${label.padEnd(20)} 旧=${fmt(o).padEnd(42)} 新=${fmt(nGuarded)}`)
}

