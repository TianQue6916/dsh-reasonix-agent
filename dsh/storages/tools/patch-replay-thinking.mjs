#!/usr/bin/env node
/**
 * patch-replay-thinking.mjs — 把 @mingozhou/dsh-replay 的「鲸小深」加载动画
 * 换成简洁的 thinking 指示器（三点脉动 + “thinking…”）。
 *
 * 用户要求（2026-09-28 原话）：
 *   「这个replay的这个显示鲸小深的加载动画，太幼稚我不喜欢，加载动画换成一个thinking就行吧」
 *
 * 影响范围（精确到调用点，只有 loading 会变）：
 *   ReplayApp.tsx     <MascotState mood="idle" text={t('app.loadingText')} />  → 变
 *   SessionPicker.tsx 同上                                                     → 变
 *   AuditView / ForkTreeView  mood="happy"（空状态）                            → 不变
 *   ReplayApp error          mood="alert"                                      → 不变
 *   ReplayModal              <Mascot mood="idle" size={30} />（标题旁小图标）    → 不变
 *
 * 要改的产物有两个（同一 UI 的两种 bundle，风格不同）：
 *   1. lib/client.js — 未压缩（esbuild，保留 “// src/...” 注释），CSS 放在 JS 字符串里
 *                      → dsh 的 client module loader 用 readFileSync(clientPath) 每次
 *                        请求从磁盘读（dsh-client-modules/lib/index.js:613/815/946），
 *                        所以改完刷新页面即生效，无需重启 web 进程。
 *   2. lib/viewer.js — 已 minify（单行），CSS 在模板字符串里带真换行
 *                      → 本插件 host half 用 readFile(new URL('./viewer.js')) 动态读。
 *   两处都要改，否则「导出的 HTML / 独立 viewer」里仍是鲸小深。
 *
 * 另有 src/* 同步：本机没有 esbuild，无法用该包 scripts/build.mjs 重建；改 src 是为了
 * 将来真能重建时不会把改动丢掉。
 *
 * 【幂等判据（踩过两次坑，勿改）】
 *   判据必须是「原锚点是否还在」，不能是「新值是否已存在」：
 *   en 与 zh 两条的替换结果完全相同（都是 "thinking…"），若拿新值当 guard，
 *   en 替换后 zh 会被误判为“已应用”而漏改 —— 实测过一次，产物里 zh 仍是「鲸小深正在倒带日志…」。
 *
 * 备份：只在备份不存在时创建，绝不覆盖已有备份（否则拿不到原始状态）。
 * 用法：
 *   node patch-replay-thinking.mjs [<pkg-dir>] [--verify]
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'

const BS = String.fromCharCode(92)
const LN = BS + 'n' // literal backslash-n  (CSS sits inside a JS string literal)
const NL = String.fromCharCode(10) // real newline        (CSS sits inside a template literal)
const U = (h) => BS + 'u' + h // bundled i18n strings are \uXXXX-escaped, uppercase hex

const DEFAULT_PKG = 'C:/Users/27063/.dsh/profiles/web/node_modules/@mingozhou/dsh-replay'
const argv = process.argv.slice(2)
const VERIFY = argv.includes('--verify')
const PKG = (argv.find((a) => !a.startsWith('--')) ?? DEFAULT_PKG).replace(/[\/\\]+$/, '')

const EN_OLD = 'Jing Xiaoshen is rewinding the log' + U('2026')
const ZH_OLD =
  U('9CB8') + U('5C0F') + U('6DF1') + U('6B63') + U('5728') +
  U('5012') + U('5E26') + U('65E5') + U('5FD7') + U('2026')
const NEW_TEXT = 'thinking' + U('2026')

const CSS_RULES = [
  '.dshr-thinking { display: inline-flex; gap: 7px; align-items: flex-end; height: 20px; }',
  '.dshr-thinking i { width: 9px; height: 9px; border-radius: 50%; background: var(--dshr-ink-3); animation: dshr-think 1.2s ease-in-out infinite; }',
  '.dshr-thinking i:nth-child(2) { animation-delay: 0.15s; }',
  '.dshr-thinking i:nth-child(3) { animation-delay: 0.3s; }',
  '@keyframes dshr-think { 0%, 80%, 100% { transform: translateY(0); opacity: 0.45; } 40% { transform: translateY(-7px); opacity: 1; } }',
]

const CSS_ANCHOR_TEXT = '.dshr-mascot-text { margin-top: 6px; color: var(--dshr-ink-3); }'

const BUNDLES = [
  {
    file: 'lib/client.js',
    label: 'client bundle (dsh web 内 UI)',
    dotsGuard: 'function ThinkingDots()',
    callGuard: 'mood === "idle" ? ThinkingDots : Mascot',
    fnAnchor: 'function MascotState({',
    callAnchor: '(0, import_jsx_runtime.jsx)(Mascot, { mood, size })',
    dots:
      'function ThinkingDots() { return (0, import_jsx_runtime.jsxs)("span", { className: "dshr-thinking", role: "status", "aria-label": "thinking", children: [ (0, import_jsx_runtime.jsx)("i", {}), (0, import_jsx_runtime.jsx)("i", {}), (0, import_jsx_runtime.jsx)("i", {}) ] }); }',
    callRepl: '(0, import_jsx_runtime.jsx)(mood === "idle" ? ThinkingDots : Mascot, { mood, size })',
    cssJoin: LN,
    enAnchor: '"app.loadingText": "' + EN_OLD + '"',
    zhAnchor: '"app.loadingText": "' + ZH_OLD + '"',
    enNew: '"app.loadingText": "' + NEW_TEXT + '"',
    zhNew: '"app.loadingText": "' + NEW_TEXT + '"',
  },
  {
    file: 'lib/viewer.js',
    label: 'viewer bundle (导出的 HTML / 独立 viewer)',
    dotsGuard: 'function _dshrThink()',
    callGuard: 'A==="idle"?_dshrThink:c7',
    fnAnchor: 'function vt({mood:A,text:t,size:e=110}){',
    callAnchor: '(0,Y.jsx)(c7,{mood:A,size:e})',
    dots:
      'function _dshrThink(){return (0,Y.jsxs)("span",{className:"dshr-thinking",role:"status","aria-label":"thinking",children:[(0,Y.jsx)("i",{}),(0,Y.jsx)("i",{}),(0,Y.jsx)("i",{})]})}',
    callRepl: '(0,Y.jsx)(A==="idle"?_dshrThink:c7,{mood:A,size:e})',
    cssJoin: NL,
    enAnchor: '"app.loadingText":"' + EN_OLD + '"',
    zhAnchor: '"app.loadingText":"' + ZH_OLD + '"',
    enNew: '"app.loadingText":"' + NEW_TEXT + '"',
    zhNew: '"app.loadingText":"' + NEW_TEXT + '"',
  },
]

const out = []
const ok = (m) => out.push('  [ok]   ' + m)
const idem = (m) => out.push('  [idem] ' + m)
const miss = (m) => out.push('  [MISS] ' + m)
let changed = 0

/** 只在备份不存在时创建，绝不覆盖已有备份 */
function backupOnce(path) {
  const bak = path + '.bak-pre-thinking'
  if (!existsSync(bak)) copyFileSync(path, bak)
  return bak
}

function patchTarget(t) {
  const path = PKG + '/' + t.file
  if (!existsSync(path)) return miss(t.label + ' 不存在: ' + path)
  let s = readFileSync(path, 'utf8')
  const s0 = s
  let hits = 0

  // 1) inject the dots component just before MascotState
  if (s.includes(t.dotsGuard)) idem(t.label + ' thinking 组件已存在')
  else if (!s.includes(t.fnAnchor)) miss(t.label + ' 找不到函数锚点')
  else {
    // ⚠️ 代码注入一律用真换行 NL，绝不能用 cssJoin：
    //    client.js 的 cssJoin 是「字面 \n」（它的 CSS 在 JS 字符串里），拿它拼 JS 代码会得到
    //    “...};<字面反斜杠n>function MascotState({” 挤在同一行 → SyntaxError: Invalid or unexpected token。
    //    实测踩过：client.js:1102。viewer.js 恰好两者都要真换行，所以当时掩盖了这个 bug。
    s = s.replace(t.fnAnchor, t.dots + NL + t.fnAnchor)
    hits++
    ok(t.label + ' 注入 thinking 组件')
  }

  // 2) swap the rendered component only when mood === 'idle'
  if (s.includes(t.callGuard)) idem(t.label + ' idle 分支已改')
  else if (!s.includes(t.callAnchor)) miss(t.label + ' 找不到 Mascot 调用锚点')
  else {
    s = s.replace(t.callAnchor, t.callRepl)
    hits++
    ok(t.label + ' loading(idle) → thinking，不再渲染鲸小深')
  }

  // 3) css
  if (s.includes('.dshr-thinking {')) idem(t.label + ' CSS 已存在')
  else if (!s.includes(CSS_ANCHOR_TEXT)) miss(t.label + ' 找不到 CSS 锚点')
  else {
    s = s.replace(CSS_ANCHOR_TEXT, CSS_ANCHOR_TEXT + t.cssJoin + CSS_RULES.join(t.cssJoin))
    hits++
    ok(t.label + ' 注入 .dshr-thinking / @keyframes dshr-think')
  }

  // 4) i18n —— 判据是「原锚点是否还在」（en/zh 新值相同，不能拿新值当 guard）
  for (const [anchor, repl, tag] of [
    [t.enAnchor, t.enNew, 'en'],
    [t.zhAnchor, t.zhNew, 'zh'],
  ]) {
    if (s.includes(anchor)) {
      s = s.replace(anchor, repl)
      hits++
      ok(t.label + ' ' + tag + ' loadingText → thinking…')
    } else if (s.includes(repl)) idem(t.label + ' ' + tag + ' loadingText 已是 thinking…')
    else miss(t.label + ' 找不到 ' + tag + ' loadingText 锚点')
  }

  if (s !== s0) {
    if (!VERIFY) {
      backupOnce(path)
      writeFileSync(path, s)
      changed++
    }
    out.push('  → ' + t.file + ' 应用 ' + hits + ' 处' + (VERIFY ? ' (verify)' : ' 已写入'))
  } else out.push('  → ' + t.file + ' 已是目标状态')
}

for (const t of BUNDLES) patchTarget(t)

// ---------------- src/* 同步（保持一致；本机无 esbuild 无法重建） ----------------
function patchSrc(rel, edits, label) {
  const path = PKG + '/' + rel
  if (!existsSync(path)) return miss(label + ' 不存在')
  let s = readFileSync(path, 'utf8')
  const s0 = s
  let hits = 0
  let skipped = 0
  for (const e of edits) {
    // 两种 edit 的幂等判据不同（踩过两次坑，勿合并）：
    //   insert 型：插入【不消耗】锚点（锚点在替换后依然存在），必须用 guard 判断是否已应用，
    //              否则每跑一次就再插一份 —— 实测把 mascot.tsx 插成了 3 份、styles.css 插成 8 行。
    //   replace 型：替换【会消耗】锚点，用 anchor 判断最可靠；不能拿“新值”当 guard ——
    //              en/zh 两条新值完全相同，en 替换后 zh 会被误判为已应用而漏改。
    if (e.mode === 'insert') {
      if (e.guard && s.includes(e.guard)) skipped++
      else if (!s.includes(e.anchor)) miss(label + ' 锚点未命中 (' + e.tag + ')')
      else {
        s = s.replace(e.anchor, e.repl)
        hits++
      }
    } else if (s.includes(e.anchor)) {
      s = s.replace(e.anchor, e.repl)
      hits++
    } else if (e.guard && s.includes(e.guard)) skipped++
    else miss(label + ' 锚点未命中 (' + e.tag + ')')
  }
  if (s === s0) return idem(label + ' 已是目标状态' + (skipped ? ' (已应用 ' + skipped + ' 处)' : ''))
  if (!VERIFY) {
    backupOnce(path)
    writeFileSync(path, s)
    changed++
  }
  ok(label + ' 应用 ' + hits + ' 处' + (skipped ? '，跳过已应用 ' + skipped + ' 处' : ''))
}

patchSrc(
  'src/client/mascot.tsx',
  [
    {
      tag: 'ThinkingDots 定义',
      mode: 'insert',
      anchor: 'export function MascotState({',
      guard: 'export function ThinkingDots(): React.ReactElement {',
      repl: [
        'export function ThinkingDots(): React.ReactElement {',
        '  return (',
        '    <span className="dshr-thinking" role="status" aria-label="thinking">',
        '      <i />',
        '      <i />',
        '      <i />',
        '    </span>',
        '  )',
        '}',
        '',
        'export function MascotState({',
      ].join('\n'),
    },
    {
      tag: 'MascotState 分支',
      anchor: '        <Mascot mood={mood} size={size} />',
      guard: "mood === 'idle' ? <ThinkingDots />",
      repl: "        {mood === 'idle' ? <ThinkingDots /> : <Mascot mood={mood} size={size} />}",
    },
  ],
  '2 src/client/mascot.tsx',
)

patchSrc(
  'src/client/styles.css',
  [
    {
      tag: 'CSS',
      mode: 'insert',
      anchor: CSS_ANCHOR_TEXT,
      guard: '.dshr-thinking {',
      repl: [
        CSS_ANCHOR_TEXT,
        '',
        '/* thinking indicator — replaces the mascot while loading (2026-09-28) */',
        ...CSS_RULES,
      ].join('\n'),
    },
  ],
  '3 src/client/styles.css',
)

patchSrc(
  'src/client/i18n.ts',
  [
    {
      tag: 'en',
      anchor: "'app.loadingText': 'Jing Xiaoshen is rewinding the log…',",
      guard: "'app.loadingText': 'thinking…',",
      repl: "'app.loadingText': 'thinking…',",
    },
    {
      tag: 'zh',
      anchor: "'app.loadingText': '鲸小深正在倒带日志…',",
      guard: "'app.loadingText': 'thinking…',",
      repl: "'app.loadingText': 'thinking…',",
    },
  ],
  '4 src/client/i18n.ts',
)

console.log('patch-replay-thinking  ' + (VERIFY ? '[verify]' : '[apply]') + '  pkg=' + PKG)
console.log(out.join('\n'))
console.log('changed=' + changed + (VERIFY ? '  (verify 模式，未写入)' : ''))
process.exit(0)
