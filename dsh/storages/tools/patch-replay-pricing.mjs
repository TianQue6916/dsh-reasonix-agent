#!/usr/bin/env node
/**
 * patch-replay-pricing.mjs -- 给 @mingozhou/dsh-replay 补全 DEFAULT_PRICING。
 *
 * ROOT CAUSE（2026-09-30）
 *   cost.ts 的 estimateCost 是 first-match-wins，miss 直接 return undefined，
 *   OverviewView.tsx:230-232 对 undefined 直接不渲染 cost tile。
 *   原表只有 deepseek/claude/gpt/openai/gemini 五条，62 个 model 里约 50 个
 *   命中不了 —— meta/muse-spark-*、Kimi、GLM、MiniMax、mimo、Qwen、LongCat、
 *   Step、hy、nemotron、inkling、stealth、laguna、ling、grok 全是免费 ride。
 *
 * FIX
 *   在 Gemini 条目后追加各 vendor 估算价 + 末尾 fallback（保证未来新 model
 *   永远有 tile，不再静默消失）。价格是 ESTIMATE（原文件头已声明），单位 USD/1M
 *   tokens，与 GOAT credits 无换算关系，只用于横向对比用量规模。
 *   顺序敏感：inkling 必须在 ling 之前（inkling 包含子串 ling）。
 *
 * 产物（与 patch-replay-thinking.mjs 同理，四个 artifact，web + desktop 共 8 文件）：
 *   src/core/cost.ts — TS 源码（将来 rebuild 不丢）
 *   lib/core.js      — host/tooling 用（非压缩）
 *   lib/client.js    — dsh web UI 用（非压缩；loader 每次 readFileSync，刷新即生效）
 *   lib/viewer.js    — 导出 HTML / 独立 viewer 用（minify 单行）
 *
 * 备份：只在备份不存在时创建（.bak-pre-pricing），绝不覆盖。
 * 用法：
 *   node patch-replay-pricing.mjs [<pkg-dir>] [--verify]
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const VERIFY = argv.includes('--verify')
const firstArg = argv.find((a) => !a.startsWith('--'))
const PKG = firstArg !== undefined ? firstArg : join(homedir(), '.dsh', 'profiles', 'web', 'node_modules', '@mingozhou', 'dsh-replay')

const BS = String.fromCharCode(92) // backslash，避免手写转义出错

// —— TS 源码风格（单引号），用 BS 拼正则里的 \d ——
const SRC_LINES = [
  "  { match: /muse/iu, rate: { input: 0.6, cacheRead: 0.15, output: 2.4 }, label: 'Muse Spark' },",
  "  { match: /kimi|moonshot/iu, rate: { input: 1.0, cacheRead: 0.25, output: 4.0 }, label: 'Kimi' },",
  "  { match: /glm/iu, rate: { input: 0.5, cacheRead: 0.125, output: 2.0 }, label: 'GLM' },",
  "  { match: /minimax/iu, rate: { input: 0.6, cacheRead: 0.15, output: 2.4 }, label: 'MiniMax' },",
  "  { match: /mimo|xiaomi/iu, rate: { input: 0.5, cacheRead: 0.125, output: 2.0 }, label: 'MiMo' },",
  "  { match: /qwen/iu, rate: { input: 0.5, cacheRead: 0.125, output: 2.0 }, label: 'Qwen' },",
  "  { match: /longcat|meituan/iu, rate: { input: 0.5, cacheRead: 0.125, output: 2.0 }, label: 'LongCat' },",
  "  { match: /stepfun/iu, rate: { input: 0.6, cacheRead: 0.15, output: 2.4 }, label: 'StepFun' },",
  "  { match: /tencent|hunyuan|hy" + BS + "d/iu, rate: { input: 0.8, cacheRead: 0.2, output: 3.2 }, label: 'Hunyuan' },",
  "  { match: /nemotron|nvidia/iu, rate: { input: 1.2, cacheRead: 0.3, output: 4.8 }, label: 'Nemotron' },",
  "  { match: /inkling|thinkingmachines/iu, rate: { input: 2.0, cacheRead: 0.5, output: 8.0 }, label: 'Inkling' },",
  "  { match: /stealth|space-bunny|pixel-canary/iu, rate: { input: 1.0, cacheRead: 0.25, output: 4.0 }, label: 'Stealth' },",
  "  { match: /laguna|poolside/iu, rate: { input: 0.3, cacheRead: 0.075, output: 1.2 }, label: 'Laguna' },",
  "  { match: /inclusionai|ling/iu, rate: { input: 0.3, cacheRead: 0.075, output: 1.2 }, label: 'Ling' },",
  "  { match: /grok|xai/iu, rate: { input: 2.0, cacheRead: 0.5, output: 8.0 }, label: 'Grok' },",
  "  { match: /./u, rate: { input: 0.5, cacheRead: 0.125, output: 2.0 }, label: 'Other (est.)' },",
]
const SRC_ANCHOR = "  { match: /gemini/iu, rate: { input: 1.25, cacheRead: 0.31, output: 10 }, label: 'Gemini' },"

// —— lib 非压缩风格（双引号，与现产物一致）——
const LIB_LINES = SRC_LINES.map((l) => l.replaceAll("'", '"'))
const LIB_ANCHOR = '  { match: /gemini/iu, rate: { input: 1.25, cacheRead: 0.31, output: 10 }, label: "Gemini" }'

// —— viewer minify 风格（无空格、前导 0 省略，仍是合法 JS）——
const V = (body) => '{match:/' + body + '/iu,rate:{input:' + 'INPUT' + '},label:"' + 'LBL' + '"}'
const VIEWER_INSERT =
  '{match:/muse/iu,rate:{input:.6,cacheRead:.15,output:2.4},label:"Muse Spark"},' +
  '{match:/kimi|moonshot/iu,rate:{input:1,cacheRead:.25,output:4},label:"Kimi"},' +
  '{match:/glm/iu,rate:{input:.5,cacheRead:.125,output:2},label:"GLM"},' +
  '{match:/minimax/iu,rate:{input:.6,cacheRead:.15,output:2.4},label:"MiniMax"},' +
  '{match:/mimo|xiaomi/iu,rate:{input:.5,cacheRead:.125,output:2},label:"MiMo"},' +
  '{match:/qwen/iu,rate:{input:.5,cacheRead:.125,output:2},label:"Qwen"},' +
  '{match:/longcat|meituan/iu,rate:{input:.5,cacheRead:.125,output:2},label:"LongCat"},' +
  '{match:/stepfun/iu,rate:{input:.6,cacheRead:.15,output:2.4},label:"StepFun"},' +
  '{match:/tencent|hunyuan|hy' + BS + 'd/iu,rate:{input:.8,cacheRead:.2,output:3.2},label:"Hunyuan"},' +
  '{match:/nemotron|nvidia/iu,rate:{input:1.2,cacheRead:.3,output:4.8},label:"Nemotron"},' +
  '{match:/inkling|thinkingmachines/iu,rate:{input:2,cacheRead:.5,output:8},label:"Inkling"},' +
  '{match:/stealth|space-bunny|pixel-canary/iu,rate:{input:1,cacheRead:.25,output:4},label:"Stealth"},' +
  '{match:/laguna|poolside/iu,rate:{input:.3,cacheRead:.075,output:1.2},label:"Laguna"},' +
  '{match:/inclusionai|ling/iu,rate:{input:.3,cacheRead:.075,output:1.2},label:"Ling"},' +
  '{match:/grok|xai/iu,rate:{input:2,cacheRead:.5,output:8},label:"Grok"},' +
  '{match:/./u,rate:{input:.5,cacheRead:.125,output:2},label:"Other (est.)"},'
const VIEWER_ANCHOR = '{match:/gemini/iu,rate:{input:1.25,cacheRead:.31,output:10},label:"Gemini"}'

const out = []
const ok = (m) => out.push('  [ok]   ' + m)
const idem = (m) => out.push('  [idem] ' + m)
const miss = (m) => out.push('  [MISS] ' + m)
let changed = 0

function backupOnce(path) {
  const bak = path + '.bak-pre-pricing'
  if (!existsSync(bak)) copyFileSync(path, bak)
  return bak
}

function patchExplicit(rel, anchor, newBlock, guard, label) {
  const path = PKG + '/' + rel
  if (!existsSync(path)) { miss(label + ' 不存在: ' + path); return }
  const s = readFileSync(path, 'utf8')
  if (s.includes(guard)) { idem(label + ' 已含 pricing 补丁'); return }
  if (!s.includes(anchor)) { miss(label + ' 锚点未命中'); return }
  const next = s.replace(anchor, newBlock)
  if (next !== s) {
    if (!VERIFY) { backupOnce(path); writeFileSync(path, next); changed++ }
    out.push('  -> ' + rel + ' 已写入' + (VERIFY ? ' (verify)' : ''))
    ok(label + ' 追加 pricing 条目')
  }
}

patchExplicit(
  'src/core/cost.ts', SRC_ANCHOR,
  SRC_ANCHOR + '\n' + SRC_LINES.join('\n'),
  'Muse Spark', '0 src/core/cost.ts',
)
const libNew = LIB_ANCHOR + ',\n' + LIB_LINES.join('\n')
patchExplicit('lib/core.js', LIB_ANCHOR, libNew, 'Muse Spark', '1 lib/core.js')
patchExplicit('lib/client.js', LIB_ANCHOR, libNew, 'Muse Spark', '2 lib/client.js')
patchExplicit(
  'lib/viewer.js', VIEWER_ANCHOR,
  VIEWER_ANCHOR + ',' + VIEWER_INSERT.replace(/,\s*$/, ''),
  'Muse Spark', '3 lib/viewer.js',
)

console.log('patch-replay-pricing  ' + (VERIFY ? '[verify]' : '[apply]') + '  pkg=' + PKG)
console.log(out.join('\n'))
console.log('changed=' + changed + (VERIFY ? '  (verify 模式，未写入)' : ''))
process.exit(0)
