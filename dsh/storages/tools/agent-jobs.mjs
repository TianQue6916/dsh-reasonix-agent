#!/usr/bin/env node
/**
 * agent-jobs.mjs — CSV in → 并行 dsh headless → CSV out
 * Codex `agent_jobs` 的本地等价物，额外支持指定 profile / 并发 / 超时 / 模板。
 *
 * 用法:
 *   node agent-jobs.mjs --in tasks.csv --out results.csv [options]
 *
 * options:
 *   --in <path>          输入 CSV（必需；首行 header）
 *   --out <path>         输出 CSV（默认 <in>.out.csv）
 *   --col <name>         作为任务文本的列名（默认取第一列；支持逗号分隔多列拼接）
 *   --template <str>     任务模板，用 {列名} 占位（默认 "{<col>}"）
 *   --profile <name>     dsh profile（默认 headless）
 *   --concurrency <n>    并发数（默认 3；headless 每次起一个进程，别开太大）
 *   --timeout-ms <n>     单任务超时（默认 900000 = 15min）
 *   --retries <n>        单任务重试次数（默认 0）
 *   --dry-run            只解析并打印将执行的任务，不调用 dsh
 *   --keep-cols <names>  额外保留到输出的列（默认保留全部原列）
 *   --self-test          跑确定性回归断言集（不需要模型，也不需要 --in）
 *
 * 输出 CSV: 原列 + result + status + ms  （status: ok | error | timeout）
 *   配 --schema 时改为: 原列 + <schema 的每个 property> + _valid + _errors + _raw + ms
 *   注意校验器只实现 type / required / properties / items；其余关键字会**静默忽略**，
 *   运行时会打警告（2026-09-28 加）。
 *
 * 冒烟: node agent-jobs.mjs --self-test        （23 项确定性断言，无需模型）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const argv = process.argv.slice(2)
const opt = { profile: 'headless', concurrency: 3, timeoutMs: 900000, retries: 0, col: null, template: null, keepCols: null, dryRun: false, schema: null, selfTest: false }
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--in') opt.in = argv[++i]
  else if (a === '--out') opt.out = argv[++i]
  else if (a === '--col') opt.col = argv[++i]
  else if (a === '--template') opt.template = argv[++i]
  else if (a === '--profile') opt.profile = argv[++i]
  else if (a === '--concurrency') opt.concurrency = Number(argv[++i])
  else if (a === '--timeout-ms') opt.timeoutMs = Number(argv[++i])
  else if (a === '--retries') opt.retries = Number(argv[++i])
  else if (a === '--keep-cols') opt.keepCols = argv[++i].split(',').map(s => s.trim())
  else if (a === '--schema') opt.schema = argv[++i]
  else if (a === '--dry-run') opt.dryRun = true
  else if (a === '--self-test') opt.selfTest = true
  else if (a === '-h' || a === '--help') { console.log(readFileSync(new URL(import.meta.url)).toString().split('*/')[0].replace(/^\/\*\*?/, '')); process.exit(0) }
}
/** 本校验器不支持的 schema 关键字集合（递归收集）。 */
const SUPPORTED_SCHEMA_KEYS = new Set(['type', 'required', 'properties', 'items'])
// 确定性回归测试，不需要模型参与，也不需要 --in
if (opt.selfTest) process.exit(runSelfTest())

if (!opt.in) { console.error('缺少 --in'); process.exit(2) }

let SCHEMA = null
if (opt.schema) SCHEMA = JSON.parse(readFileSync(opt.schema, "utf8"))
// 静默忽略约束 = 假校验。校验器只实现 type / required / properties / items 四件事，
// 其余关键字（enum / additionalProperties / minimum / pattern / …）一律不生效，
// 必须显式告诉调用者，否则他会以为输出真的被 schema 约束住了。
if (SCHEMA) {
  const ignored = unsupportedSchemaKeys(SCHEMA)
  if (ignored.size) {
    console.error('警告：schema 含本校验器**不支持**的约束关键字 — ' + [...ignored].join(', '))
    console.error('      它们会被静默忽略；实际只校验 type / required / properties / items。')
  }
}

/** 从模型输出里抽出 JSON（容忍 markdown 围栏与前后废话） */
function extractJson(text) {
  let s = String(text).trim()
  const fence = s.match(/\`{3}(?:json)?\s\S*?\`{3}/)
  if (fence) s = fence[0].replace(/\`{3}(?:json)?/, '').replace(/\`{3}$/, '').trim()
  try { return { ok: true, value: JSON.parse(s) } } catch {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}")
  if (a !== -1 && b > a) { try { return { ok: true, value: JSON.parse(s.slice(a, b + 1)) } } catch {} }
  return { ok: false, value: null }
}

/** 极简 JSON Schema 校验：type / required / properties 递归 */
function validate(value, schema, path) {
  path = path || "$"
  const errs = []
  if (!schema || typeof schema !== "object") return errs
  const isArr = Array.isArray(value)
  const actual = value === null ? "null" : isArr ? "array" : typeof value
  if (schema.type) {
    const wanted = Array.isArray(schema.type) ? schema.type : [schema.type]
    const ok = wanted.some(w => w === "integer" ? Number.isInteger(value) : w === "number" ? typeof value === "number" : w === actual)
    if (!ok) errs.push(path + ": 期望 " + wanted.join("|") + "，实为 " + actual)
  }
  if (actual === "object") {
    for (const r of schema.required || []) if (!(r in value)) errs.push(path + "." + r + ": 缺失(required)")
    for (const key of Object.keys(schema.properties || {})) {
      if (key in value) errs.push.apply(errs, validate(value[key], schema.properties[key], path + "." + key))
    }
  }
  if (actual === "array" && schema.items) {
    value.forEach((v, idx) => errs.push.apply(errs, validate(v, schema.items, path + "[" + idx + "]")))
  }
  return errs
}

/** 最小 CSV 解析：支持双引号包裹、字段内逗号与转义引号 */
function parseCsv(text) {
  const rows = []; let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* skip */ }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length && !(r.length === 1 && r[0] === ''))
}
function q(v) { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }

function runOne(task) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    // 任务经 stdin 传入（`-`），避免命令行注入与 shell 转义问题
    const cp = spawn(`dsh --profile ${opt.profile} -`, { shell: true, windowsHide: true })
    try { cp.stdin.write(task); cp.stdin.end() } catch {}
    let out = '', err = ''
    const timer = setTimeout(() => { try { cp.kill() } catch {} ; resolve({ status: 'timeout', result: '', ms: Date.now() - t0 }) }, opt.timeoutMs)
    cp.stdout.on('data', d => out += d)
    cp.stderr.on('data', d => err += d)
    cp.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ status: 'ok', result: out.trim(), ms: Date.now() - t0 })
      else resolve({ status: 'error', result: (out.trim() || err.trim()).slice(0, 2000), ms: Date.now() - t0 })
    })
    cp.on('error', e => { clearTimeout(timer); resolve({ status: 'error', result: String(e), ms: Date.now() - t0 }) })
  })
}

const rows = parseCsv(readFileSync(opt.in, 'utf8'))
if (!rows.length) { console.error('CSV 为空'); process.exit(2) }
const header = rows[0]
const data = rows.slice(1)
// 旧行为：默认取第一列 —— 在多列 CSV 上几乎总是错的（第一列通常是 id），
// 而且失败是**静默**的：你会拿到一批"任务文本 = 行号"的无意义结果，照样烧 token
// （2026-09-28 用 id,task,lang 的 CSV 实测 dry-run 打出 `[0] 1` / `[1] 2`）。
if (!opt.col && !opt.template && header.length > 1) {
  console.error(`CSV 有 ${header.length} 列（${header.join(', ')}），但没有指定 --col 或 --template。`)
  console.error('默认取第一列在多列 CSV 上几乎总是错的。请显式指定其中之一，例如：')
  console.error(`  --col ${header.find((h) => /task|prompt|question|text/i.test(h)) || header[1]}`)
  console.error(`  --template '{${header[0]}}：{${header[1]}}'`)
  process.exit(2)
}
const cols = opt.col ? opt.col.split(',').map(s => s.trim()) : [header[0]]
for (const c of cols) if (!header.includes(c)) { console.error(`列不存在: ${c}（有: ${header.join(', ')}）`); process.exit(2) }

const tasks = data.map(r => {
  const rec = Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))
  const rec2 = rec
  let task = opt.template
    ? opt.template.replace(/\{([^}]+)\}/g, (_, k) => rec2[k.trim()] ?? '')
    : cols.map(c => rec2[c]).join('\n')
  if (SCHEMA) task += '\n\n只输出一个 JSON 对象（不要解释；不要在 JSON 外写任何文字），必须满足此 JSON Schema：\n' + JSON.stringify(SCHEMA)
  return task
})
if (opt.dryRun) {
  console.log(`将执行 ${tasks.length} 个任务（profile=${opt.profile}, 并发=${opt.concurrency}）:`)
  tasks.slice(0, 5).forEach((t, i) => console.log(`  [${i}] ${t.slice(0, 120)}${t.length > 120 ? '…' : ''}`))
  process.exit(0)
}

const results = new Array(tasks.length)
let next = 0, done = 0
const t0 = Date.now()
async function worker() {
  while (true) {
    const i = next++; if (i >= tasks.length) return
    let r
    for (let attempt = 0; attempt <= opt.retries; attempt++) {
      r = await runOne(tasks[i])
      if (r.status === 'ok') break
    }
    results[i] = r
    done++
    process.stderr.write(`[${done}/${tasks.length}] #${i} ${r.status} ${r.ms}ms\n`)
  }
}
await Promise.all(Array.from({ length: Math.max(1, Math.min(opt.concurrency, tasks.length)) }, worker))

const keep = opt.keepCols ?? header
let schemaKeys = []
if (SCHEMA) {
  schemaKeys = Object.keys(SCHEMA.properties || {})
  if (!schemaKeys.length) schemaKeys = ['value']
}
// schema 模式下若不保留原文，`_valid=false` 时就完全不知道模型到底输出了什么 ——
// 排障最需要那一份原始输出（2026-09-28 加 `_raw`）。
const outHeader = SCHEMA
  ? [...keep, ...schemaKeys, '_valid', '_errors', '_raw', 'ms']
  : [...keep, 'result', 'status', 'ms']
const lines = [outHeader.map(q).join(',')]
data.forEach((r, i) => {
  const rec = Object.fromEntries(header.map((h, k) => [h, r[k] ?? '']))
  const res = results[i] ?? { status: 'error', result: '', ms: 0 }
  const base = keep.map(c => rec[c])
  if (SCHEMA) {
    const parsed = res.status === 'ok' ? extractJson(res.result) : { ok: false, value: null }
    const errs = parsed.ok ? validate(parsed.value, SCHEMA) : ['未能从输出中解析出 JSON']
    const vals = schemaKeys.map(k =>
      parsed.ok && parsed.value && typeof parsed.value === 'object' ? parsed.value[k] : '')
    lines.push([...base, ...vals, errs.length ? 'false' : 'true', errs.join('; '), res.result.slice(0, 2000), res.ms].map(q).join(','))
  } else {
    lines.push([...base, res.result, res.status, res.ms].map(q).join(','))
  }
})
const outPath = opt.out ?? opt.in.replace(/\.csv$/i, '') + '.out.csv'
writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
console.log(`\n完成 ${tasks.length} 个任务，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log(`  ok=${results.filter(r => r?.status === 'ok').length}  error=${results.filter(r => r?.status === 'error').length}  timeout=${results.filter(r => r?.status === 'timeout').length}`)
console.log(`  输出: ${outPath}`)

// ---------------------------------------------------------------------------
// --self-test：确定性回归断言集。
//
// WHY: objective 要求每步可验证，但**靠 LLM 配合的端到端测试是不确定的** ——
// 模型会"聪明地"满足任何可满足的 schema（实测：故意让 required 里含一个 properties
// 未声明的键，模型照样补上了一个字符串值，`_valid` 仍是 true）。所以解析层与校验层
// 必须有不需要模型的断言。
// ---------------------------------------------------------------------------
function runSelfTest() {
  const LF = String.fromCharCode(10)
  const FENCE = String.fromCharCode(96).repeat(3)
  const fails = []
  let asserts = 0
  const eq = (label, got, want) => {
    asserts++
    const a = JSON.stringify(got)
    const b = JSON.stringify(want)
    if (a !== b) fails.push(label + ': got ' + a + ' want ' + b)
  }
  const ok = (label, cond) => { asserts++; if (!cond) fails.push(label + ': expected truthy') }
  const S = (props, required) => ({ type: 'object', properties: props, required })

  // --- parseCsv ---
  eq('csv basic', parseCsv('a,b' + LF + '1,2' + LF), [['a', 'b'], ['1', '2']])
  eq('csv quoted comma', parseCsv('a,b' + LF + '1,"x,y"' + LF), [['a', 'b'], ['1', 'x,y']])
  eq('csv escaped quote', parseCsv('a' + LF + '"he said ""hi"""' + LF), [['a'], ['he said "hi"']])
  eq('csv CRLF tolerated', parseCsv('a,b' + String.fromCharCode(13) + LF + '1,2' + LF), [['a', 'b'], ['1', '2']])
  eq('csv blank lines dropped', parseCsv(LF + 'a' + LF + LF + '1' + LF), [['a'], ['1']])

  // --- extractJson ---
  ok('json plain ok', extractJson('{"a":1}').ok)
  eq('json plain value', extractJson('{"a":1}').value, { a: 1 })
  ok('json fenced ok', extractJson(FENCE + 'json' + LF + '{"a":2}' + LF + FENCE).ok)
  eq('json fenced value', extractJson(FENCE + 'json' + LF + '{"a":2}' + LF + FENCE).value, { a: 2 })
  ok('json prose-wrapped ok', extractJson('好的，结果是 {"a":3} 完毕').ok)
  eq('json prose-wrapped value', extractJson('好的，结果是 {"a":3} 完毕').value, { a: 3 })
  ok('json non-json rejected', extractJson('NOPE').ok === false)
  eq('json non-json value', extractJson('NOPE').value, null)

  // --- validate ---
  eq('validate clean', validate({ v: 'x' }, S({ v: { type: 'string' } }, ['v'])), [])
  ok('validate type mismatch caught', validate({ v: 1 }, S({ v: { type: 'string' } }, ['v'])).length === 1)
  ok('validate number accepts int', validate({ n: 2 }, S({ n: { type: 'number' } }, ['n'])).length === 0)
  ok('validate integer rejects float', validate({ n: 2.5 }, S({ n: { type: 'integer' } }, ['n'])).length === 1)
  ok('validate required missing caught', validate({}, S({ v: { type: 'string' } }, ['v'])).length === 1)
  ok('validate nested caught', validate({ a: { b: 1 } }, S({ a: S({ b: { type: 'string' } }, []) }, [])).length === 1)
  ok('validate array items caught', validate({ xs: [1, 'a'] }, S({ xs: { type: 'array', items: { type: 'number' } } }, [])).length === 1)
  ok('validate null type ok', validate({ v: null }, S({ v: { type: 'null' } }, [])).length === 0)
  ok('validate union type ok', validate({ v: 1 }, S({ v: { type: ['string', 'number'] } }, [])).length === 0)

  // --- 明确断言"不支持"的约束确实不生效（防止以后误以为它在工作）---
  ok('enum NOT enforced', validate({ v: 'anything' }, S({ v: { type: 'string', enum: ['only-this'] } }, [])).length === 0)
  ok('additionalProperties NOT enforced', validate({ v: 'x', extra: 1 }, { type: 'object', properties: { v: { type: 'string' } }, additionalProperties: false }).length === 0)
  ok('minimum NOT enforced', validate({ n: -5 }, S({ n: { type: 'number', minimum: 0 } }, [])).length === 0)
  ok('unsupportedSchemaKeys detects them',
    ['enum', 'additionalProperties', 'minimum'].every((k) => unsupportedSchemaKeys({ type: 'object', properties: { v: { type: 'string', enum: [1], additionalProperties: false, minimum: 0 } } }).has(k)))

  if (fails.length === 0) {
    console.log('self-test: 全部通过（' + asserts + ' 项断言）')
    return 0
  }
  console.error('self-test: ' + fails.length + ' 项失败')
  for (const f of fails) console.error('  - ' + f)
  return 1
}

function unsupportedSchemaKeys(schema, found) {
  found = found || new Set()
  if (!schema || typeof schema !== 'object') return found
  for (const k of Object.keys(schema)) if (!SUPPORTED_SCHEMA_KEYS.has(k)) found.add(k)
  for (const v of Object.values(schema.properties || {})) unsupportedSchemaKeys(v, found)
  if (schema.items) unsupportedSchemaKeys(schema.items, found)
  return found
}
