#!/usr/bin/env node
/**
 * patch-dsh-context-pricing.mjs -- 给 dsh-context 的 client bundle 注入本地价目覆盖表。
 *
 * ROOT CAUSE（2026-10-02，逐函数复刻 + 真实数据验证）
 *   dsh-context 的 host 半只落 token 桶（~/.dsh/storages/session_projcache/sessions/*.json 里的
 *   rows.contextTimeline.val.cost = {provider: {model: {period: {cacheRead, uncached, cacheWrite, output}}}}），
 *   钱是 client 半用 models.dev 价目本乘出来的。priceFaceOf 的三段解析对本机主力流量全线失效：
 *     ① provider 名透传：MODELS_DEV_PROVIDER_IDS 里没有 commandcode-goat ⇒ branchOf(book.prices,'commandcode-goat') = null
 *     ② model id 是 'deepseek/deepseek-v4.1-flash'，以 'deepseek/' 开头而不是 'deepseek-' ⇒ 一手价目本分支被跳过
 *     ③ 落到 resolveRate(book.index, model)：org 段 = 'deepseek'，但 models.dev 的 deepseek provider 只有
 *        deepseek-v4-flash / deepseek-v4-flash-vision-exp / deepseek-v4-pro / deepseek-flash 四个 model，
 *        没有 deepseek-v4.1-flash；整串键有 10 个 carrier、尾段键有 23 个 carrier ⇒ lone-carrier 不成立
 *     ⇒ 返回 null ⇒ 面板「费用 —」。本机实测：这一对 = 1410 session / 2.4449B token
 *     （占全机 token 的 96%），对 ¥38.56 的总额贡献 0。
 *
 * FIX
 *   三处纯插入（不改动任何既有语句，strip 后可逐字节还原 = 幂等）：
 *     ① 本地价目块（LOCAL_PRICES / LOCAL_PEAK_PROVIDERS + localFaceOf / localPeakProvider），插在 priceFaceOf 定义之前
 *     ② priceFaceOf 的空书守卫之后插 hook：本地表精确命中 (provider, model) 就立即返回该 face
 *     ③ isDeepSeekProvider 的函数开括号之后插 hook：peakProviders 里的 provider 也按峰时 x2 计价
 *   为什么不去改 MODELS_DEV_PROVIDER_IDS 把 commandcode-goat 映射成 deepseek：
 *     那条路会先命中 `direct !== null` 分支，而该分支一旦 lookupFace 失败就 `return null`、**不再下沉**到
 *     model-side index —— 于是现在能正确计价的 deepseek/deepseek-v4-pro / -v4-flash 会一起变成 null。
 *     （已实测确认；这是本文件的第一个反直觉结论。）
 *
 * 用法
 *   node patch-dsh-context-pricing.mjs --check     只报告，不写盘
 *   node patch-dsh-context-pricing.mjs --apply     备份 → strip → 插入 → 回读验证 → 语法验证
 *   node patch-dsh-context-pricing.mjs --verify    只跑验证
 *   node patch-dsh-context-pricing.mjs --restore   从最新 .bak-*-pre-local-prices 还原
 *   可选：--overlay <json>   --target <client.js>（默认自动扫 ~/.dsh/profiles/<profile>/node_modules/dsh-context/lib/client.js）
 *
 * 生效条件：node_modules 里的 client bundle 不参与 profile 的 patchReload: live，写完必须重启 App。
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, basename } from 'node:path'

const HDR = 'dsh-context-local-prices'
const T = '\t'
const NL = '\n'

const argv = process.argv.slice(2)
const has = (n) => argv.includes('--' + n)
const opt = (n, d) => {
  const i = argv.indexOf('--' + n)
  return i === -1 || argv[i + 1] === undefined ? d : argv[i + 1]
}

const OVERLAY_PATH = opt('overlay', join(homedir(), '.dsh', 'storages', 'dsh-context-price-overlay.json'))

function discoverTargets() {
  const forced = opt('target', null)
  if (forced !== null) return [forced]
  const root = join(homedir(), '.dsh', 'profiles')
  const found = []
  if (!existsSync(root)) return found
  for (const profile of readdirSync(root)) {
    const f = join(root, profile, 'node_modules', 'dsh-context', 'lib', 'client.js')
    if (existsSync(f)) found.push(f)
  }
  return found
}

// ── 锚点（全部用运行时拼制表符，避免源码里出现无法肉眼验证的空白）─────────────
const A_PRICE_FACE = T + T + 'function priceFaceOf(book, provider, model) {'
const A_GUARD_LINE = T + T + T + 'if (book === null || book === void 0) return null;' + NL
const A_IS_DEEPSEEK_OPEN = T + T + 'function isDeepSeekProvider(dshProviderId) {' + NL

function markers() {
  const mk = (kind, ind) => ind + '/* ' + HDR + ':' + kind + ' */'
  return {
    blockStart: mk('start', T + T),
    blockEnd: mk('end', T + T) + NL,
    faceStart: mk('face-start', T + T + T),
    faceEnd: mk('face-end', T + T + T) + NL,
    peakStart: mk('peak-start', T + T + T),
    peakEnd: mk('peak-end', T + T + T) + NL,
  }
}
const M = markers()
const ALL_MARKERS = [M.blockStart, M.blockEnd, M.faceStart, M.faceEnd, M.peakStart, M.peakEnd]

function loadOverlay() {
  if (!existsSync(OVERLAY_PATH)) throw new Error('overlay 不存在：' + OVERLAY_PATH)
  const raw = JSON.parse(readFileSync(OVERLAY_PATH, 'utf8'))
  const prices = raw.prices
  if (prices === null || typeof prices !== 'object' || Array.isArray(prices)) throw new Error('overlay.prices 必须是对象')
  const peaks = raw.peakProviders === undefined ? [] : raw.peakProviders
  if (!Array.isArray(peaks)) throw new Error('overlay.peakProviders 必须是数组')
  const RATE_KEYS = ['hit', 'miss', 'write', 'out']
  let entries = 0
  for (const provider of Object.keys(prices)) {
    const branch = prices[provider]
    if (branch === null || typeof branch !== 'object' || Array.isArray(branch)) throw new Error('prices.' + provider + ' 必须是对象')
    for (const model of Object.keys(branch)) {
      const e = branch[model]
      for (const k of RATE_KEYS) {
        if (typeof e?.[k] !== 'number' || !Number.isFinite(e[k])) {
          throw new Error('prices.' + provider + '.' + model + '.' + k + ' 必须是有限数')
        }
      }
      entries += 1
    }
  }
  return { prices, peaks, entries, providers: Object.keys(prices).length }
}

// ── 注入块 ───────────────────────────────────────────────────────────────────
function buildPieces(overlay) {
  const doc = [
    '/**',
    ' * 本地价目覆盖 —— 由 ~/.dsh/storages/tools/patch-dsh-context-pricing.mjs 注入，勿手改本块。',
    ' * 源：' + OVERLAY_PATH.split('\\').join('/'),
    ' * 为什么需要：走自建 gateway 时 provider 名不在 models.dev，model id 又是 org/model 形态，',
    ' * 三条解析路径全部落空（详见脚本头注释）。命中即返回，不再进 models.dev 的启发式。',
    ' * 声明顺序说明：本块是 const，若被 priceFaceOf 之前求值的函数读取会命中 TDZ；',
    ' * 实际只被 render 期调用，整个 region 早已求值完毕。',
    ' */',
  ]
  const constants = [
    'const LOCAL_PRICES = ' + JSON.stringify(overlay.prices) + ';',
    'const LOCAL_PEAK_PROVIDERS = ' + JSON.stringify(overlay.peaks) + ';',
  ]
  const helpers = [
    '/** 本地表精确命中：provider 与 model 都按 harness 上报的原样字符串比较，不做任何正规化。 */',
    'function localFaceOf(provider, model) {',
    T + 'const branch = LOCAL_PRICES[provider];',
    T + 'if (branch === void 0 || branch === null) return null;',
    T + 'const entry = branch[model];',
    T + 'if (entry === void 0 || entry === null) return null;',
    T + 'return {',
    T + T + 'pid: provider,',
    T + T + 'mid: model,',
    T + T + 'rate: { hit: entry.hit, miss: entry.miss, write: entry.write, out: entry.out }',
    T + '};',
    '}',
    '/** 该 provider 的 peak 桶是否按 x2 计价（DeepSeek 官方峰时价特征）。 */',
    'function localPeakProvider(dshProviderId) {',
    T + 'return LOCAL_PEAK_PROVIDERS.indexOf(dshProviderId) !== -1;',
    '}',
  ]
  const blockBody = doc.concat(constants, helpers).map((l) => T + T + l).join(NL) + NL

  const faceBody = [
    T + T + T + 'const localFace = localFaceOf(provider, model);',
    T + T + T + 'if (localFace !== null) return localFace;',
  ].join(NL) + NL

  const peakBody = [
    T + T + T + 'if (localPeakProvider(dshProviderId)) return true;',
  ].join(NL) + NL

  return {
    block: M.blockStart + NL + blockBody + M.blockEnd,
    face: M.faceStart + NL + faceBody + M.faceEnd,
    peak: M.peakStart + NL + peakBody + M.peakEnd,
  }
}

// ── strip（把自身注入逐字节移除）─────────────────────────────────────────────
function stripInjections(text) {
  let out = text
  const pairs = [
    [M.blockStart, M.blockEnd],
    [M.faceStart, M.faceEnd],
    [M.peakStart, M.peakEnd],
  ]
  for (const [start, end] of pairs) {
    for (;;) {
      const i = out.indexOf(start)
      if (i === -1) break
      const j = out.indexOf(end, i)
      if (j === -1) throw new Error('发现 ' + start + ' 但没有配对的 ' + end + ' —— 文件被外部改坏了，拒绝继续')
      out = out.slice(0, i) + out.slice(j + end.length)
    }
  }
  return out
}

function countOf(text, needle) {
  let n = 0
  let i = text.indexOf(needle)
  while (i !== -1) {
    n += 1
    i = text.indexOf(needle, i + 1)
  }
  return n
}

// ── 验证 ─────────────────────────────────────────────────────────────────────
function syntaxCheck(file) {
  const script = [
    "const fs = require('node:fs'), vm = require('node:vm')",
    "const src = fs.readFileSync(process.env.DSH_SYNTAX_FILE, 'utf8')",
    'try {',
    "  new vm.SourceTextModule(src, { identifier: process.env.DSH_SYNTAX_FILE })",
    "  process.stdout.write('SourceTextModule ok' + String.fromCharCode(10))",
    '} catch (e) {',
    "  if (String(e.message).includes('SourceTextModule')) {",
    '    new vm.Script(src)',
    "    process.stdout.write('Script(ESM-less) ok' + String.fromCharCode(10))",
    '  } else { throw e }',
    '}',
  ].join(NL)
  try {
    const out = execFileSync(process.execPath, ['--experimental-vm-modules', '-e', script], {
      env: { ...process.env, DSH_SYNTAX_FILE: file },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true, detail: out.trim().split(NL).pop() }
  } catch (err) {
    const tail = String(err.stderr ?? '') + String(err.stdout ?? '') + String(err.message ?? '')
    return { ok: false, detail: tail.trim().split(NL).slice(-3).join(' | ') }
  }
}

function verify(file, overlay) {
  const text = readFileSync(file, 'utf8')
  const problems = []
  const notes = []
  for (const mk of ALL_MARKERS) {
    const n = countOf(text, mk)
    if (n !== 1) problems.push('标记出现 ' + n + ' 次（应为 1）：' + mk)
  }
  const anchored = [
    ['priceFaceOf 定义行', A_PRICE_FACE, 1],
    ['priceFaceOf 空书守卫', A_GUARD_LINE, 1],
    ['isDeepSeekProvider 开括号', A_IS_DEEPSEEK_OPEN, 1],
  ]
  for (const [label, needle, want] of anchored) {
    const n = countOf(text, needle)
    if (n !== want) problems.push('锚点 ' + label + ' 出现 ' + n + ' 次（应为 ' + want + '）—— 上游改了源码，需重新对齐')
  }
  // 结构断言：face hook 必须紧跟在空书守卫之后
  const gi = text.indexOf(A_GUARD_LINE)
  if (gi !== -1 && countOf(text, M.faceStart) === 1) {
    const after = text.slice(gi + A_GUARD_LINE.length, gi + A_GUARD_LINE.length + M.faceStart.length)
    if (after !== M.faceStart) problems.push('face hook 不在 priceFaceOf 的空书守卫之后')
    notes.push('face hook 位置 ✓')
  }
  // 嵌入的 JSON 必须与 overlay 文件一致
  const m = text.indexOf('const LOCAL_PRICES = ')
  if (m !== -1) {
    try {
      const line = text.slice(m, text.indexOf(NL, m))
      const embedded = JSON.parse(line.slice('const LOCAL_PRICES = '.length, -1))
      if (JSON.stringify(embedded) !== JSON.stringify(overlay.prices)) {
        problems.push('文件内嵌的 LOCAL_PRICES 与 overlay 文件不一致 —— 需要重新 --apply')
      } else {
        notes.push('内嵌价目表与 overlay 一致 ✓（' + overlay.entries + ' 条 / ' + overlay.providers + ' 个 provider）')
      }
    } catch (e) {
      problems.push('内嵌 LOCAL_PRICES 解析失败：' + e.message)
    }
  }
  const syn = syntaxCheck(file)
  if (!syn.ok) problems.push('语法验证失败：' + syn.detail)
  else notes.push('语法 ✓ ' + syn.detail)
  return { problems, notes }
}

// ── 备份 ─────────────────────────────────────────────────────────────────────
function backupPathOf(file) {
  return file + '.bak-20261002-pre-local-prices'
}
function ensureBackup(file) {
  const b = backupPathOf(file)
  if (existsSync(b)) return { created: false, path: b }
  copyFileSync(file, b)
  return { created: true, path: b }
}
function newestBackup(file) {
  const dir = file.slice(0, file.lastIndexOf('/') === -1 ? file.lastIndexOf('\\') : file.lastIndexOf('/'))
  const base = basename(file)
  const cands = readdirSync(dir)
    .filter((n) => n.startsWith(base + '.bak-') && n.includes('pre-local-prices'))
    .map((n) => join(dir, n))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return cands.length === 0 ? null : cands[0]
}
function isPatched(file) {
  return countOf(readFileSync(file, 'utf8'), M.blockStart) > 0
}

// ── 主流程 ───────────────────────────────────────────────────────────────────
const targets = discoverTargets()
if (targets.length === 0) {
  console.error('FAIL 没找到任何 dsh-context 的 client bundle')
  process.exit(1)
}

if (has('restore')) {
  for (const f of targets) {
    const b = newestBackup(f)
    if (b === null) {
      console.log('SKIP 无备份：' + f)
      continue
    }
    copyFileSync(b, f)
    console.log('OK   已还原 ' + f + '  <- ' + b)
    console.log('     残留标记 = ' + countOf(readFileSync(f, 'utf8'), M.blockStart))
  }
  process.exit(0)
}

const overlay = loadOverlay()
console.log('overlay : ' + OVERLAY_PATH + '  (' + overlay.entries + ' 条 / ' + overlay.providers + ' 个 provider / peakProviders=' + JSON.stringify(overlay.peaks) + ')')
const pieces = buildPieces(overlay)

if (has('check') || has('verify') || (!has('apply') && !has('verify'))) {
  for (const f of targets) {
    const text = readFileSync(f, 'utf8')
    console.log('')
    console.log('target  : ' + f)
    console.log('  bytes = ' + Buffer.byteLength(text, 'utf8') + '  已打补丁 = ' + isPatched(f))
    for (const [label, needle] of [['priceFaceOf 定义行', A_PRICE_FACE], ['priceFaceOf 空书守卫', A_GUARD_LINE], ['isDeepSeekProvider 开括号', A_IS_DEEPSEEK_OPEN]]) {
      const n = countOf(text, needle)
      console.log('  锚点 ' + label + '：' + n + (n === 1 ? ' ✓' : ' ✗'))
    }
  }
  if (!has('verify')) process.exit(0)
}

if (has('apply')) {
  for (const f of targets) {
    const original = readFileSync(f, 'utf8')
    for (const [label, needle] of [['priceFaceOf 定义行', A_PRICE_FACE], ['priceFaceOf 空书守卫', A_GUARD_LINE], ['isDeepSeekProvider 开括号', A_IS_DEEPSEEK_OPEN]]) {
      const n = countOf(original, needle)
      if (n !== 1) {
        console.error('FAIL 锚点 ' + label + ' 出现 ' + n + ' 次（应为 1），拒绝写入：' + f)
        process.exit(1)
      }
    }
    const bk = ensureBackup(f)
    console.log('')
    console.log('target  : ' + f)
    console.log('  backup = ' + bk.path + (bk.created ? '（新建）' : '（已存在，保留原备份）'))
    let text = stripInjections(original)
    if (text !== original) console.log('  先剥掉旧注入：' + (Buffer.byteLength(original) - Buffer.byteLength(text)) + ' bytes')

    let fi = text.indexOf(A_GUARD_LINE)
    text = text.slice(0, fi + A_GUARD_LINE.length) + pieces.face + text.slice(fi + A_GUARD_LINE.length)
    fi = text.indexOf(A_IS_DEEPSEEK_OPEN)
    text = text.slice(0, fi + A_IS_DEEPSEEK_OPEN.length) + pieces.peak + text.slice(fi + A_IS_DEEPSEEK_OPEN.length)
    fi = text.indexOf(A_PRICE_FACE)
    text = text.slice(0, fi) + pieces.block + text.slice(fi)

    writeFileSync(f, text, 'utf8')
    const back = readFileSync(f, 'utf8')
    if (back !== text) {
      console.error('FAIL 回读与写入不一致：' + f)
      process.exit(1)
    }
    console.log('  bytes = ' + Buffer.byteLength(text, 'utf8') + '（+ ' + (Buffer.byteLength(text) - Buffer.byteLength(original)) + '）')
  }
}

let bad = false
for (const f of targets) {
  const { problems, notes } = verify(f, overlay)
  console.log('')
  console.log('verify  : ' + f)
  for (const n of notes) console.log('  ✓ ' + n)
  for (const p of problems) console.log('  ✗ ' + p)
  if (problems.length > 0) bad = true
}
if (bad) {
  console.log('')
  console.log('结果：FAIL（回滚：node ' + basename(process.argv[1]) + ' --restore）')
  process.exit(1)
}
console.log('')
console.log('结果：PASS。下一步必须重启 DeepSeek Harness App 才会加载新 bundle。')
