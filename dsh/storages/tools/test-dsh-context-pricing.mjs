#!/usr/bin/env node
/**
 * test-dsh-context-pricing.mjs -- 行为级验证 patch-dsh-context-pricing.mjs 的注入。
 *
 * 做法：把打补丁后的 client.js 里 cost.ts 那一段（连同 asRecord / numOf 两个外部依赖）
 * 按源码文本精确切出来，重组成一个真 ESM 模块再 import —— 测的是**磁盘上那个真实产物**，
 * 不是我另写一份复刻。断言覆盖：
 *   ① 本地表命中（这正是修的那件事）
 *   ② 一个回归护栏：没被本地表覆盖的 (provider, model) 行为与打补丁前逐字一致
 *   ③ 真实 token 桶算出来的钱 = ¥281.31（打补丁前是 null）
 *   ④ 本地表是精确匹配，不是兜底放水
 *
 * 用法：node ~/.dsh/storages/tools/test-dsh-context-pricing.mjs [--target <client.js>]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const optOf = (n, d) => {
  const i = argv.indexOf('--' + n)
  return i === -1 || argv[i + 1] === undefined ? d : argv[i + 1]
}
const TARGET = optOf('target', join(homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', 'dsh-context', 'lib', 'client.js'))
const OUT = join(homedir(), '.dsh', 'tmp-probe', '_pricing-under-test.mjs')

let passed = 0
let failed = 0
function check(name, cond, detail) {
  if (cond) {
    passed += 1
    console.log('  PASS ' + name)
  } else {
    failed += 1
    console.log('  FAIL ' + name + (detail === undefined ? '' : '  -> ' + detail))
  }
}
function close(a, b, eps = 1e-6) {
  return typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= eps * Math.max(1, Math.abs(b))
}

// ── 源码切片：按函数名做括号配平，绝不靠手工行号 ──────────────────────────────
const src = readFileSync(TARGET, 'utf8')
const lines = src.split('\n')

function spanOf(pred, label) {
  const start = lines.findIndex(pred)
  if (start === -1) throw new Error('找不到起点：' + label)
  let depth = 0
  let seen = false
  for (let i = start; i < lines.length; i += 1) {
    depth += (lines[i].match(/\{/gu) ?? []).length - (lines[i].match(/\}/gu) ?? []).length
    if (depth > 0) seen = true
    if (seen && depth === 0) return [start, i]
  }
  throw new Error('括号没收平：' + label)
}
const sliceStart = lines.findIndex((l) => l.trimStart().startsWith('const MODELS_DEV_PROVIDER_IDS = {'))
if (sliceStart === -1) throw new Error('找不到 MODELS_DEV_PROVIDER_IDS')
const sliceEnd = spanOf((l) => l.trimStart().startsWith('function estimateSessionCost(usage, book, currency) {'), 'estimateSessionCost')[1]
const costRegion = lines.slice(sliceStart, sliceEnd + 1).join('\n')

function grab(fnName) {
  const [a, b] = spanOf((l) => l.trimStart().startsWith('function ' + fnName + '(') || l.trimStart().startsWith('const ' + fnName + ' ='), fnName)
  return lines.slice(a, b + 1).join('\n')
}

mkdirSync(join(homedir(), '.dsh', 'tmp-probe'), { recursive: true })
const moduleSrc = [
  '// 自动生成，勿手改：见 test-dsh-context-pricing.mjs',
  grab('asRecord'),
  grab('numOf'),
  costRegion,
  'export { MODELS_DEV_PROVIDER_IDS, modelsDevProviderOf, isDeepSeekProvider, LOCAL_PRICES, LOCAL_PEAK_PROVIDERS, localFaceOf, localPeakProvider, priceIndexOf, resolveRate, priceFaceOf, priceOf, estimateSessionCost }',
  '',
].join('\n')
writeFileSync(OUT, moduleSrc, 'utf8')
console.log('target  : ' + TARGET)
console.log('module  : ' + OUT + '  (' + Buffer.byteLength(moduleSrc, 'utf8') + ' bytes, cost region ' + (sliceEnd - sliceStart + 1) + ' lines)')
console.log('')

const M = await import(pathToFileURL(OUT).href)

// ── 结构断言 ────────────────────────────────────────────────────────────────
console.log('[0] 产物结构')
const countOf = (needle) => src.split(needle).length - 1
check('标记块 start 恰好 1 处', countOf('/* dsh-context-local-prices:start */') === 1)
check('标记块 end 恰好 1 处', countOf('/* dsh-context-local-prices:end */') === 1)
check('face hook 恰好 1 处', countOf('/* dsh-context-local-prices:face-start */') === 1)
check('peak hook 恰好 1 处', countOf('/* dsh-context-local-prices:peak-start */') === 1)
check('注入块在 priceFaceOf 定义之前', src.indexOf('const LOCAL_PRICES = ') < src.indexOf('function priceFaceOf(book, provider, model) {'))
check('face hook 紧跟空书守卫', src.includes('\t\t\tif (book === null || book === void 0) return null;\n\t\t\t/* dsh-context-local-prices:face-start */\n\t\t\tconst localFace = localFaceOf(provider, model);'))
check('peak hook 在 isDeepSeekProvider 内', src.includes('\t\tfunction isDeepSeekProvider(dshProviderId) {\n\t\t\t/* dsh-context-local-prices:peak-start */\n\t\t\tif (localPeakProvider(dshProviderId)) return true;'))

// ── 合成一本 models.dev 形状的价目本 ────────────────────────────────────────
// 刻意让 deepseek 的 model 用无 org 前缀的短名（真实情况），第三方 carrier 用 org/model 长名：
// 这样就能复现「org 段解析得到 deepseek，但 deepseek 名下没有这个 id」的原始失败形态。
const prices = {
  deepseek: {
    'deepseek-v4-flash': { hit: 0.003, miss: 0.15, write: 0.15, out: 0.6 },
    'deepseek-v4-pro': { hit: 0.003625, miss: 0.435, write: 0.435, out: 0.87 }
  },
  'nano-gpt': { 'deepseek/deepseek-v4.1-flash': { hit: 0.006, miss: 0.13, write: 0.13, out: 0.52 } },
  'llmgateway-providers': { 'deepseek/deepseek-v4.1-flash': { hit: 0.003, miss: 0.15, write: 0.15, out: 0.6 } },
  alibaba: { 'deepseek-v4.1-flash': { hit: 0, miss: 0, write: 0, out: 0 } }
}
const npmOf = { deepseek: '@ai-sdk/openai-compatible', 'nano-gpt': '@ai-sdk/openai-compatible', 'llmgateway-providers': '@ai-sdk/openai-compatible', alibaba: '@ai-sdk/alibaba' }
const book = { prices, index: M.priceIndexOf(prices, npmOf) }

console.log('')
console.log('[1] 本地价目覆盖表本身')
check('LOCAL_PRICES 有 commandcode-goat 分支', M.LOCAL_PRICES['commandcode-goat'] !== undefined)
const f1 = M.localFaceOf('commandcode-goat', 'deepseek/deepseek-v4.1-flash')
check('localFaceOf 命中主力那一对', f1 !== null)
check('  rate.hit = 0.003', f1?.rate.hit === 0.003, String(f1?.rate.hit))
check('  rate.out = 0.6', f1?.rate.out === 0.6, String(f1?.rate.out))
check('localFaceOf 对未列出的 model 返回 null', M.localFaceOf('commandcode-goat', 'z-ai/glm-5.3-flash') === null)
check('localFaceOf 对未列出的 provider 返回 null', M.localFaceOf('nano-gpt', 'deepseek/deepseek-v4.1-flash') === null)
check('peakProviders 默认为空数组', Array.isArray(M.LOCAL_PEAK_PROVIDERS) && M.LOCAL_PEAK_PROVIDERS.length === 0)

console.log('')
console.log('[2] priceFaceOf：打补丁前为 null 的输入现在有价')
const faceMain = M.priceFaceOf(book, 'commandcode-goat', 'deepseek/deepseek-v4.1-flash')
check('主力那一对不再 null', faceMain !== null)
check('  pid 透出 dsh provider 原名', faceMain?.pid === 'commandcode-goat', String(faceMain?.pid))
check('  rate.miss = 0.15', faceMain?.rate.miss === 0.15, String(faceMain?.rate.miss))
const faceOfficial = M.priceFaceOf(book, 'deepseek-official', 'deepseek/deepseek-v4-flash')
check('deepseek-official + org 前缀 model 也不再 null', faceOfficial !== null, JSON.stringify(faceOfficial))

console.log('')
console.log('[3] 回归护栏：本地表没覆盖的输入，行为与打补丁前一致')
const facePro = M.priceFaceOf(book, 'commandcode-goat', 'deepseek/deepseek-v4-pro')
check('commandcode-goat + deepseek/deepseek-v4-pro 仍能走 org 段解析', facePro !== null, JSON.stringify(facePro))
check('  解析到 deepseek（不是被本地表截胡）', facePro?.pid === 'deepseek', String(facePro?.pid))
check('  miss = 0.435（deepseek v4-pro 原价）', facePro?.rate.miss === 0.435, String(facePro?.rate.miss))
const faceGlm = M.priceFaceOf(book, 'commandcode-goat', 'z-ai/glm-5.3-flash')
check('未覆盖且解析不了的对仍返回 null（不放水兜底）', faceGlm === null, JSON.stringify(faceGlm))
check('isDeepSeekProvider(commandcode-goat) 仍为 false（peak 不误开）', M.isDeepSeekProvider('commandcode-goat') === false)
check('isDeepSeekProvider(deepseek-official) 仍为 true', M.isDeepSeekProvider('deepseek-official') === true)

console.log('')
console.log('[4] 用真实 token 桶算钱（主力那一对全机 2.4449B token）')
const usage = {
  'commandcode-goat': {
    'deepseek/deepseek-v4.1-flash': {
      peak: { cacheRead: 2339563247, uncached: 62342226, cacheWrite: 0, output: 43044287 }
    }
  }
}
const usd = M.estimateSessionCost(usage, book, 'usd')
const cny = M.estimateSessionCost(usage, book, 'cny')
check('estimateSessionCost 不再返回 null', usd !== null)
check('USD = 42.19659584', close(usd, 42.19659584), String(usd))
check('CNY = ¥281.31（USD / 0.15 的固定换算）', close(cny, 281.3106389333333, 1e-9), String(cny))
const mixed = {
  'commandcode-goat': {
    'deepseek/deepseek-v4.1-flash': { peak: { cacheRead: 2339563247, uncached: 62342226, cacheWrite: 0, output: 43044287 } },
    'deepseek/deepseek-v4-pro': { peak: { cacheRead: 0, uncached: 1000000, cacheWrite: 0, output: 1000000 } }
  }
}
const mixedUsd = M.estimateSessionCost(mixed, book, 'usd')
check('同一 provider 下两类 model 能同时计价（没被本地分支挡住）', mixedUsd !== null && mixedUsd > 42.19659584, String(mixedUsd))

console.log('')
console.log('结果：' + passed + ' passed, ' + failed + ' failed')
process.exit(failed === 0 ? 0 : 1)
