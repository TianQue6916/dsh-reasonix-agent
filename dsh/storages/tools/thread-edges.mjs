#!/usr/bin/env node
/**
 * thread-edges.mjs — 从 dsh session 帧导出「线程派发边」，对标 Codex 的
 * state_5.thread_spawn_edges。
 *
 * 两类边，权威性不同：
 *
 *   1. `session:spawn`（权威）—— 从 session header 的 `parentSession` 读出。
 *      2026-09-28 更正：本脚本旧注释断言 dsh 的 subagent"不落独立 session 文件"，
 *      这是**错的**。实测 subagent 有**独立的 session 目录与文件**，第一行 header
 *      里写着 parentSession 与 delegationDepth，形如
 *        {"type":"session","id":"d37f2224-…","parentSession":"session-a0d5fbf8-…","delegationDepth":1}
 *      这才是一对一的 Codex `thread_spawn_edges` 对应物。
 *
 *   2. 工具调用边（启发式）—— `subagent` / `workflow` / `subagent_fork` / `ralph`
 *      的 tool/call 参数；workflow 的 script 里每个 `agent("…")` 调用算一条派发。
 *      它记录"派发意图"，不含子线程身份。
 *
 * 用法:
 *   node thread-edges.mjs [--dir <sessions 根>] [--out edges.json] [--dot edges.dot]
 *                         [--limit N] [--names subagent,workflow,subagent_fork,ralph]
 *   --limit 0（默认）= 扫全部 session。旧默认 30 —— 实测全机 873 个 session 文件，
 *   旧默认只覆盖 3%。
 */
import { appendFileSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { homedir } from 'node:os'

const argv = process.argv.slice(2)
const opt = { limit: 0, names: ['subagent', 'workflow', 'subagent_fork', 'ralph'], out: null, dot: null, dir: null }
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--dir') opt.dir = argv[++i]
  else if (a === '--out') opt.out = argv[++i]
  else if (a === '--dot') opt.dot = argv[++i]
  else if (a === '--limit') opt.limit = Number(argv[++i])
  else if (a === '--names') opt.names = argv[++i].split(',').map((s) => s.trim())
  else if (a === '-h' || a === '--help') { console.log(readFileSync(new URL(import.meta.url)).toString().split('*/')[0]); process.exit(0) }
}
const ROOT = opt.dir ?? join(homedir(), '.dsh', 'sessions')
const ZSTD = process.env.ZSTD_BIN ?? 'zstd'

function findSessions(root) {
  const out = []
  const walk = (d, depth) => {
    if (depth > 3) return
    let ents = []
    try { ents = readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p, depth + 1)
      else if (e.name.endsWith('.jsonl.zstd')) {
        try { out.push({ path: p, mtime: statSync(p).mtimeMs }) } catch {}
      }
    }
  }
  walk(root, 0)
  const all = out.sort((a, b) => b.mtime - a.mtime)
  return opt.limit > 0 ? all.slice(0, opt.limit) : all
}

/** session 目录名有两种形式（`session-<uuid>` 与裸 `<uuid>`）—— 只靠路径正则会漏一半。 */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/

const sessions = findSessions(ROOT)
const edges = []
let scanned = 0
let failed = 0
let withParent = 0

for (const s of sessions) {
  let text
  try {
    text = execFileSync(ZSTD, ['-dc', s.path], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8')
  } catch (error) {
    // zstd 不在 PATH 时，1451 个文件会全部失败并给出一个没信息量的计数 —— 直接报清楚。
    if (error && error.code === 'ENOENT' && scanned === 0) {
      console.error(`找不到 zstd 可执行文件（${ZSTD}）。装一个，或用 ZSTD_BIN 指定绝对路径。`)
      console.error('注意：不能用 node 内置的 zlib.zstdDecompressSync 代替 —— dsh 的 session')
      console.error('是**多 frame** zstd 流，内置 API 只解第一个 frame 且不报错（2026-09-28 实测）。')
      process.exit(2)
    }
    failed++
    continue
  }
  scanned++

  // 第一行是 session header —— 它同时是 sid 的权威来源
  const nl = text.indexOf('\n')
  let header = null
  try { header = JSON.parse(nl === -1 ? text : text.slice(0, nl)) } catch {}
  const sid = header?.id ?? (s.path.match(UUID_RE) ?? [])[0] ?? s.path

  if (header && typeof header.parentSession === 'string' && header.parentSession.length > 0) {
    withParent++
    edges.push({
      session: header.parentSession,
      childSession: header.id ?? sid,
      seq: 0,
      time: header.createdAt ? new Date(header.createdAt).toISOString() : null,
      tool: 'session:spawn',
      callId: null,
      spawn: 'parentSession',
      delegationDepth: header.delegationDepth ?? null,
      cwd: header.cwd ?? null,
      agentPreset: header.agentPreset ?? null,
      task: '',
      name: null,
      context: header.cwd ?? null,
      parent: header.parentSession,
    })
  }

  for (const line of text.split('\n')) {
    if (!line.startsWith('{"type":"tool/call"')) continue
    let f
    try { f = JSON.parse(line) } catch { continue }
    const d = f.data ?? {}
    if (!opt.names.includes(d.name)) continue
    let args = {}
    try { args = typeof d.arguments === 'string' ? JSON.parse(d.arguments) : (d.arguments ?? {}) } catch {}
    const meta = args.meta || {}
    const task = meta.description || meta.name || args.task || args.prompt || args.description || args.query || ''
    edges.push({
      session: sid,
      seq: f.seq ?? null,
      time: f.time ? new Date(f.time).toISOString() : null,
      tool: d.name,
      callId: d.callId ?? null,
      task: String(task).slice(0, 400),
      name: meta.name || null,
      context: args.context ? String(args.context).slice(0, 120) : null,
    })
    // workflow/subagent 的 script 里每个 agent(...) 调用 = 一条真实的子线程派发边
    const script = args.script || ''
    const calls = []
    const re = /agent\s*\(\s*(["'`])/g
    let mm
    while ((mm = re.exec(script)) !== null) {
      const quote = mm[1]
      const start = mm.index + mm[0].length
      const end = script.indexOf(quote, start)
      if (end > start) calls.push(script.slice(start, end).split('\n').join(' ').slice(0, 300))
    }
    for (const ctext of calls) {
      edges.push({
        session: sid,
        seq: f.seq ?? null,
        time: f.time ? new Date(f.time).toISOString() : null,
        tool: (d.name || '') + ':agent',
        callId: d.callId ?? null,
        task: ctext,
        parent: 'workflow:' + (meta.name || ''),
      })
    }
  }
}

const byTool = edges.reduce((m, e) => (m[e.tool] = (m[e.tool] ?? 0) + 1, m), {})
const outPath = opt.out ?? join(ROOT, '..', 'thread-edges.json')
writeFileSync(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  root: ROOT,
  scannedSessions: scanned,
  failedSessions: failed,
  sessionsWithParent: withParent,
  edgeCount: edges.length,
  byTool,
  edges,
}, null, 1), 'utf8')

console.log(`扫描 session: ${scanned}（失败 ${failed}）→ 边 ${edges.length} 条，其中 parentSession 权威边 ${withParent} 条`)
console.log('按工具:', JSON.stringify(byTool))
const bySession = edges.reduce((m, e) => (m[e.session] = (m[e.session] ?? 0) + 1, m), {})
console.log(`涉及父会话: ${Object.keys(bySession).length}`)
for (const [k, v] of Object.entries(bySession).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${k}  ${v} 条`)
console.log(`输出: ${outPath}`)

// 计划任务只暴露调度器自己的 LastTaskResult（实测：子进程崩溃时它仍是 0），
// 所以脚本必须自己留痕 —— 与 memory-to-mnemon.py 同一模式。
try {
  appendFileSync(
    join(homedir(), '.dsh', 'logs', 'thread-edges.log'),
    `${new Date().toISOString()} scanned=${scanned} failed=${failed} edges=${edges.length} parentEdges=${withParent} out=${outPath}
`,
    'utf8',
  )
} catch {
  /* 日志是尽力而为 */
}

if (opt.dot) {
  const out = ['digraph thread_edges {', '  rankdir=LR;', '  node [shape=box,fontsize=10];']
  const sessionIds = new Set()
  for (const e of edges) {
    sessionIds.add(e.session)
    if (e.childSession) sessionIds.add(e.childSession)
  }
  for (const sid of sessionIds) out.push('  "' + sid + '" [shape=ellipse,fillcolor="#3498db",style=filled,fontcolor=white];')
  // 权威父子边：实线绿
  for (const e of edges) {
    if (e.tool !== 'session:spawn') continue
    out.push('  "' + e.session + '" -> "' + e.childSession + '" [color="#2ecc71",penwidth=1.6];')
  }
  const clean = (s) => String(s || '').split('"').join('').split('\\').join('').split('\n').join(' ').slice(0, 70)
  // 先建 workflow 节点，再把带 parent 的 agent 边挂到对应 workflow 下
  const wfNodes = new Map()
  edges.forEach((e, i) => {
    if (e.tool !== 'workflow') return
    const nid = 'w' + i
    wfNodes.set('workflow:' + String(e.name || clean(e.task).slice(0, 40)), nid)
    out.push('  "' + nid + '" [label="' + clean(e.tool) + '\n' + clean(e.task) + '"];')
    out.push('  "' + e.session + '" -> "' + nid + '";')
  })
  edges.forEach((e, i) => {
    if (e.tool === 'workflow' || e.tool === 'session:spawn') return
    const nid = 'a' + i
    out.push('  "' + nid + '" [label="' + clean(e.tool) + '\n' + clean(e.task) + '", style=dashed];')
    let src = '"' + e.session + '"'
    if (e.parent) {
      for (const [k, v] of wfNodes) {
        if (k === e.parent) { src = '"' + v + '"'; break }
      }
    }
    out.push('  ' + src + ' -> "' + nid + '";')
  })
  out.push('}')
  writeFileSync(opt.dot, out.join('\n') + '\n', 'utf8')
  console.log('DOT: ' + opt.dot)
}
