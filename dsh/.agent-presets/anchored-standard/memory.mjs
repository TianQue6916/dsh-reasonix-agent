/**
 * memory-reasonix — on-demand access to the user's reasonix memory corpus, so a
 * dsh session and a reasonix session share ONE set of facts instead of forking.
 *
 * WHY THIS SHAPE: this preset deliberately removes large always-on injections
 * (see skill-search.mjs — a ~9KB resident catalog measured 0/9 anchored vs ~81%
 * without). A resident memory index would re-introduce exactly that
 * perturbation, and dsh's context injection is append-only, so a growing index
 * would accumulate in the transcript forever. Therefore this plugin ships NO
 * resident text: it exposes a small search/read pair and the model pulls only
 * what the task needs.
 *
 * The corpus is plain Markdown facts at <reasonixHome>/memory/<scope>/<name>.md
 * with YAML-ish frontmatter (name, description, type, scope, created, ...).
 * WRITES: `memory_remember` appends/updates facts in the SAME shape reasonix's own
 * remember tool writes (id / revision / created_at / updated_at / metadata) and keeps
 * the MEMORY.md section "## 十一、dsh 侧新增（自动维护）" in sync. Writes are atomic
 * (tmp + rename), and the index is copied to a `.bak-pre-dsh-write` backup once before
 * the first dsh write — so reasonix stays the source of truth and the two-machine
 * sync keeps working.
 */

import { spawn, execFileSync } from 'node:child_process'
import { readdir, readFile, writeFile, rename, mkdir, copyFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'memory-reasonix'

/** The tools service must exist before these tools can register. */
export const inject = ['tools']

/** Override the corpus root (defaults to ~/.reasonix/memory). */
const MEMORY_ROOT = process.env.DSH_REASONIX_MEMORY ?? join(homedir(), '.reasonix', 'memory')

/** Scopes scanned, in priority order. */
const SCOPES = ['global', 'project']

const MAX_RESULTS = 20
/**
 * Facts that describe WHO the user is and HOW they want to be taught. These are worth
 * pulling in one shot before a substantive task (teaching / translation / design /
 * code), per the user's own rule `use-user-persona-before-tasks` (2026-08-03).
 */
const PROFILE_FACTS = [
  'user-persona-cognitive-system-architect',
  'academic-level-and-teaching-style',
  'use-user-persona-before-tasks',
  '输出规范',
]

/** Profile-flavoured facts win ties: the user portrait and their rules beat tool notes. */
function profileWeight(fact) {
  let weight = 0
  if (fact.type === 'user') weight += 2
  if (fact.type === 'feedback') weight += 1
  if (PROFILE_FACTS.includes(fact.name)) weight += 3
  return weight
}
/** Skip the index itself, dot-entries, sync-conflict leftovers and backups. */
const SKIP = /^(\.|MEMORY\.md$)|(conflict)|(\.bak$)|(\.orig$)/i

/**
 * 实时把刚写入的 fact 灌进 mnemon（fire-and-forget）。
 *
 * WHY: markdown 语料是 canonical —— 跨 harness（reasonix ⇄ dsh）和跨机同步都靠它；
 * mnemon 是 dsh 这一侧的检索/注入层。两者之间原本只有每日 12:20 的 MemoryToMnemon
 * 计划任务这一条桥，实测新写的 fact 最长 24h 不出现在 mnemon 的 recall/search 里
 * （2026-09-28 用 blockedAfterConsecutiveRounds 当探针，mnemon search hits=0 实证）。
 *
 * 失败绝不能影响记忆写入本身：整体 detached + stdio:'ignore' + unref，只监听 error
 * 事件吞掉它。排查去看 ~/.dsh/logs/memory-to-mnemon.log。设 DSH_MNEMON_SYNC=0 可关掉。
 */
const MNEMON_SYNC_PY = join(homedir(), '.dsh', 'storages', 'tools', 'memory-to-mnemon.py')

function syncToMnemon(factName, scope, dir) {
  if (process.env.DSH_MNEMON_SYNC === '0') return
  try {
    // 总是显式传 --src：dir 就是该 scope 的语料目录（global → <root>/global），
    // 这样 project scope 也走得通，隔离测试也不必额外分支。
    const args = [MNEMON_SYNC_PY, '--only', factName, '--src', dir]
    const child = spawn(process.env.DSH_PYTHON ?? 'python', args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.on('error', () => {})
    child.unref()
  } catch {
    /* 同步是尽力而为 */
  }
}

/**
 * 记忆级 git 锚点 —— 让每条 fact 都记得自己产生时的本地 git 状态。
 *
 * 为什么放旁路文件、而不写进 fact 的 frontmatter：
 *   renderFact 生成的 frontmatter 是「与 reasonix 自己的 remember 工具同一形状」，
 *   reasonix 是这套语料的唯一写入方、双机同步也依赖那个形状。往里塞自定义字段
 *   要先去确认 reasonix 侧解析不会被打断；写到旁路文件则完全不碰语料格式，
 *   也不会污染喂给 mnemon 的 content。
 *
 * 失败绝不阻塞记忆写入本身：所有异常就地吞掉，落盘走 tmp + rename 原子替换。
 * 文件：~/.dsh/storages/git-anchors.json
 */
const GIT_ANCHOR_FILE = join(homedir(), '.dsh', 'storages', 'git-anchors.json')
const GIT_ANCHOR_KEEP = 300

function gitTry(cwd, args) {
  try {
    const out = execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      maxBuffer: 512 * 1024,
    })
    return String(out).replace(/\r/g, '').trim()
  } catch {
    return null
  }
}

/** 捕获 process.cwd() 与 ~/.dsh 两处所在仓库（按仓库根去重）。 */
async function captureGitAnchor(factName) {
  const repos = []
  const seen = new Set()
  for (const dir of [process.cwd(), join(homedir(), '.dsh')]) {
    const k0 = String(dir).toLowerCase()
    if (seen.has(k0)) continue
    seen.add(k0)
    const root = gitTry(dir, ['rev-parse', '--show-toplevel'])
    if (root === null || root === '') continue
    const k1 = root.toLowerCase()
    if (seen.has(k1)) continue
    seen.add(k1)
    const branch = gitTry(dir, ['rev-parse', '--abbrev-ref', 'HEAD']) || '(unknown)'
    const head = gitTry(dir, ['rev-parse', '--short', 'HEAD']) || '(no commits)'
    const porcelain = gitTry(dir, ['status', '--porcelain']) || ''
    repos.push({
      repo: root,
      branch,
      head,
      dirty: porcelain === '' ? 0 : porcelain.split('\n').filter((l) => l !== '').length,
    })
  }
  if (repos.length === 0) return
  const path = GIT_ANCHOR_FILE
  let doc = { version: 1, anchors: {} }
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    if (parsed && typeof parsed === 'object' && parsed.anchors && typeof parsed.anchors === 'object') {
      doc = parsed
    }
  } catch {
    /* 首次写入或文件损坏 → 重建 */
  }
  doc.version = 1
  doc.anchors[factName] = { at: new Date().toISOString(), repos }
  const names = Object.keys(doc.anchors)
  if (names.length > GIT_ANCHOR_KEEP) {
    names.sort((a, b) => String(doc.anchors[a].at).localeCompare(String(doc.anchors[b].at)))
    for (const n of names.slice(0, names.length - GIT_ANCHOR_KEEP)) delete doc.anchors[n]
  }
  const tmp = path + '.tmp'
  await mkdir(dirname(path), { recursive: true })
  await writeFile(tmp, JSON.stringify(doc, null, 2), 'utf8')
  await rename(tmp, path)
}

/** Minimal JSON schema compiler for tool parameters (zero dependencies). */
function toJsonSchema(spec) {
  const properties = {}
  const required = []
  for (const [key, meta] of Object.entries(spec || {})) {
    const prop = { type: meta.type }
    if (meta.description) prop.description = meta.description
    properties[key] = prop
    if (meta.required) required.push(key)
  }
  return { type: 'object', properties, required, additionalProperties: false }
}

/** Split a fact file into its flat frontmatter map and its body. */
export function parseFact(raw) {
  const meta = {}
  let body = raw
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (match) {
    body = raw.slice(match[0].length)
    for (const line of match[1].split(/\r?\n/)) {
      const kv = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
      if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  return { meta, body }
}

/** First Markdown heading in a body, used when frontmatter has no description. */
function firstHeading(body) {
  const line = body.split(/\r?\n/).find((l) => /^#{1,3}\s+\S/.test(l))
  return line ? line.replace(/^#{1,3}\s+/, '').trim() : ''
}

/** Read every fact under the given scopes (read-only; failures are skipped). */
export async function listFacts(scopes = SCOPES) {
  const facts = []
  for (const scope of scopes) {
    const dir = join(MEMORY_ROOT, scope)
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md') || SKIP.test(entry.name)) continue
      let raw
      try {
        raw = await readFile(join(dir, entry.name), 'utf8')
      } catch {
        continue
      }
      const { meta, body } = parseFact(raw)
      facts.push({
        name: meta.name || entry.name.replace(/\.md$/, ''),
        description: meta.description || firstHeading(body) || '(no description)',
        type: meta.fact_type || meta.type || '',
        priority: meta.priority || '',
        created: meta.created || '',
        scope,
        file: entry.name,
        body,
      })
    }
  }
  return facts
}

/** Normalize free text into lowercase search tokens. */
function tokens(text) {
  return (text || '')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff_-]+/)
    .filter(Boolean)
}

/** Rank facts against a query: metadata hits first, then body hits. */
export function rankFacts(facts, query) {
  const wanted = tokens(query)
  if (wanted.length === 0) return facts.slice(0, MAX_RESULTS).map((fact) => ({ fact, head: 0, body: 0 }))
  return facts
    .map((fact) => {
      const head = tokens(`${fact.name} ${fact.description} ${fact.type} ${fact.created}`).join(' ')
      const low = tokens(`${head} ${fact.body.slice(0, 6000)}`).join(' ')
      const headScore = wanted.filter((t) => head.includes(t)).length
      const bodyScore = wanted.filter((t) => low.includes(t)).length
      return { fact, head: headScore, body: bodyScore }
    })
    .filter((row) => row.body === wanted.length)
    .sort(
      (a, b) =>
        profileWeight(b.fact) - profileWeight(a.fact) ||
        b.head - a.head ||
        a.fact.name.localeCompare(b.fact.name),
    )
    .slice(0, MAX_RESULTS)
}

/** Register the on-demand memory tools. Nothing is injected into the prompt. */
export function apply(ctx) {
  ctx.tools.register({
    name: 'memory_search',
    description:
      "Search the user's persistent memory (facts that survive across sessions, shared with their reasonix assistant) and return matching fact names with one-line descriptions. The corpus holds user preferences, machine/environment facts, project state and past lessons learned. This session injects NO memory index, so call memory_search FIRST whenever a task depends on the user's environment, preferences, past decisions or earlier lessons — then memory_read to load a fact in full. Do NOT guess facts about the user's machine or their past decisions.",
    parameters: toJsonSchema({
      query: { type: 'string', required: true, description: 'search keywords, e.g. "输出目录", "goat 额度", "dsh 升级"' },
      scope: { type: 'string', description: 'optional scope filter: "global" or "project"' },
    }),
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } }, required: ['text'] },
      render: (_a, v) => [{ type: 'text', text: v.text }],
    },
    async execute(args) {
      const scopes = args.scope ? [String(args.scope)] : SCOPES
      const facts = await listFacts(scopes)
      const rows = rankFacts(facts, args.query)
      if (rows.length === 0) {
        return { text: `No memory fact matches "${args.query}" (searched ${facts.length} facts in ${scopes.join(', ')}).` }
      }
      const lines = rows.map(({ fact }) => {
        const tags = [fact.type, fact.priority && `priority:${fact.priority}`, fact.scope].filter(Boolean).join(' ')
        return `- ${fact.name}${tags ? ` [${tags}]` : ''}: ${String(fact.description).split('\n')[0]}`
      })
      return { text: `Matching facts (${rows.length}/${facts.length}):\n${lines.join('\n')}\n\nLoad one with memory_read (exact name).` }
    },
  })

  ctx.tools.register({
    name: 'memory_read',
    description:
      "Read the full text of ONE memory fact by its exact name (from memory_search results). Use this after memory_search when the fact's details matter for the task.",
    parameters: toJsonSchema({
      name: { type: 'string', required: true, description: 'exact fact name from memory_search (or its file name)' },
    }),
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } }, required: ['text'] },
      render: (_a, v) => [{ type: 'text', text: v.text }],
    },
    async execute(args) {
      const wanted = String(args.name).trim()
      const facts = await listFacts(SCOPES)
      const fact =
        facts.find((f) => f.name === wanted) ??
        facts.find((f) => f.file === wanted || f.file === `${wanted}.md`) ??
        facts.find((f) => f.name.toLowerCase() === wanted.toLowerCase())
      if (!fact) {
        return { text: `No memory fact named "${wanted}". Run memory_search to find the exact name.` }
      }
      return { text: `# ${fact.name}\n\n${fact.body.trim()}` }
    },
  })

  ctx.tools.register({
    name: 'memory_profile',
    description:
      '一次读取用户的核心画像（身份 / 学业水平与教学偏好 / 画像调用铁律 / 输出规范）。涉及教学、翻译、方案设计、代码等实质性任务前先调用它，用返回内容校准讲法、深度与用词。用户是构建主义研究式学习者：要求第一性原理、可验证逻辑、跨学科连接，反感死记硬背与空洞赞美，不要甩他未学过的东西（群论 / 环论 / 拓扑 / 非标准分析）。',
    parameters: toJsonSchema({}),
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } }, required: ['text'] },
      render: (_a, v) => [{ type: 'text', text: v.text }],
    },
    async execute() {
      const facts = await listFacts(SCOPES)
      const picked = []
      const missing = []
      for (const wanted of PROFILE_FACTS) {
        const hit = facts.find((f) => f.name === wanted) ?? facts.find((f) => f.file === `${wanted}.md`)
        if (hit) picked.push(hit)
        else missing.push(wanted)
      }
      if (picked.length === 0) {
        return { text: `No profile facts found under ${MEMORY_ROOT}. Expected: ${PROFILE_FACTS.join(', ')}` }
      }
      const chunks = picked.map((f) => `## ${f.name}\n\n${f.body.trim()}`)
      const note = missing.length === 0 ? '' : `\n\n(未找到：${missing.join('、')})`
      return { text: `${chunks.join('\n\n---\n\n')}${note}` }
    },
  })
  ctx.tools.register({
    name: 'memory_remember',
    description:
      '保存一条跨会话记忆（reasonix 与 dsh 共用同一份语料，写进去两端都读得到）。完成「下次还记得」的操作后调用：装/卸软件、改配置或 key 位置、批量文件操作（>5 个）、项目结构变更、排障定论、用户明确偏好。同 name 视为同一条并 upsert（revision + 1）。正文里会过期的状态请写明「截至日期」。',
    parameters: toJsonSchema({
      name: { type: 'string', required: true, description: '事实名：kebab-case 或简短中文名，作为文件名；同名即更新同一条' },
      description: { type: 'string', required: true, description: '一句话说清存了什么（进 MEMORY.md 索引）' },
      body: { type: 'string', required: true, description: 'Markdown 正文：关键事实，让未来的会话不用重新推导' },
      factType: { type: 'string', description: 'reference（工具/配置）| project（项目）| feedback（规则）| user（画像），默认 reference' },
      scope: { type: 'string', description: 'global（默认）| project' },
    }),
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } }, required: ['text'] },
      render: (_a, v) => [{ type: 'text', text: v.text }],
    },
    async execute(args) {
      const scope = String(args.scope ?? 'global').trim()
      if (!SCOPES.includes(scope)) return { text: `scope 必须是 ${SCOPES.join(' 或 ')}。` }
      const factName = sanitizeName(String(args.name ?? ''))
      if (factName.length === 0) return { text: 'name 不能为空。' }
      const body = String(args.body ?? '').trim()
      if (body.length === 0) return { text: 'body 不能为空。' }

      const dir = join(MEMORY_ROOT, scope)
      await mkdir(dir, { recursive: true })
      const file = join(dir, `${factName}.md`)

      let previous
      try {
        previous = parseFact(await readFile(file, 'utf8'))
      } catch {
        previous = undefined
      }

      const now = new Date().toISOString()
      const priorMeta = previous?.meta ?? {}
      const revision = previous === undefined ? 1 : (Number(priorMeta.revision) || 1) + 1
      const description =
        String(args.description ?? priorMeta.description ?? '').replace(/\s+/g, ' ').trim() || factName
      const rendered = renderFact({
        id: priorMeta.id || `mem-${randomBytes(16).toString('hex')}`,
        revision,
        createdAt: priorMeta.created_at || now,
        updatedAt: now,
        name: factName,
        description,
        factType: String(args.factType ?? priorMeta.fact_type ?? 'reference').trim() || 'reference',
        scope,
        body,
      })
      await atomicWrite(file, rendered)
      const index = await upsertIndexEntry(scope, factName, description)
      // mnemon 是 dsh 侧的检索层，语料落地后立刻补桥（详见 syncToMnemon 的注释）
      syncToMnemon(factName, scope, dir)
      // 记忆级 git 锚点：让这条 fact 记得自己产生时的本地 git 状态
      await captureGitAnchor(factName).catch(() => {})
      return {
        text: `${previous === undefined ? 'Saved' : 'Updated'} memory "${factName}" (revision ${revision}, scope ${scope})\nfile: ${file}\nindex: ${index.message}`,
      }
    },
  })
}

/** Render a fact file in the same frontmatter shape reasonix's own remember tool writes. */
function renderFact({ id, revision, createdAt, updatedAt, name, description, factType, scope, body }) {
  const q = (value) => JSON.stringify(String(value ?? ''))
  return [
    '---',
    `id: ${id}`,
    `revision: ${revision}`,
    `created_at: ${q(createdAt)}`,
    `updated_at: ${q(updatedAt)}`,
    `name: ${name}`,
    `description: ${q(description)}`,
    'metadata:',
    '  type: user',
    `  fact_type: ${factType}`,
    `  scope: ${scope}`,
    '---',
    '',
    body,
    '',
  ].join('\n')
}

/** Make a fact name safe as a Windows file name and as a Markdown link target. */
function sanitizeName(raw) {
  return raw
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 80)
}

/** Atomic write: temp file then rename, so a crash never leaves a half-written fact. */
async function atomicWrite(path, text) {
  const tmp = `${path}.tmp-dsh-${process.pid}-${Date.now()}`
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, path)
}

/** The index section this plugin owns; user-curated sections are never touched. */
const INDEX_SECTION = '## 十一、dsh 侧新增（自动维护）'

/**
 * Upsert one line into MEMORY.md: an existing line for this name (anywhere in the index)
 * is updated in place, otherwise the line is appended inside this plugin's own section —
 * created on demand, right before "## 归档说明".
 */
async function upsertIndexEntry(scope, name, description) {
  if (scope !== 'global') return { message: 'skipped (the index tracks global facts only)' }
  const index = join(MEMORY_ROOT, 'global', 'MEMORY.md')
  let text
  try {
    text = await readFile(index, 'utf8')
  } catch {
    return { message: 'no MEMORY.md next to the fact; skipped' }
  }

  const backup = `${index}.bak-pre-dsh-write`
  try {
    await access(backup)
  } catch {
    try {
      await copyFile(index, backup)
    } catch {
      /* a missing backup must never block the write */
    }
  }

  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  const line = `- [${name}](${name}.md) — ${description}`
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const existing = new RegExp(`^- \\[${escaped}\\]\\(${escaped}\\.md\\) — .*$`, 'm')

  let next
  let verb
  if (existing.test(text)) {
    next = text.replace(existing, line)
    verb = 'line updated'
  } else if (text.includes(INDEX_SECTION)) {
    const after = text.indexOf('\n## ', text.indexOf(INDEX_SECTION) + INDEX_SECTION.length)
    const insertAt = after === -1 ? text.length : after + 1
    next = `${text.slice(0, insertAt)}${line}${nl}${text.slice(insertAt)}`
    verb = 'line appended to the dsh section'
  } else {
    const block = `${INDEX_SECTION}${nl}${line}${nl}${nl}`
    const anchor = text.indexOf(`${nl}## 归档说明`)
    next = anchor === -1 ? `${text}${nl}${block}` : `${text.slice(0, anchor + 1)}${block}${text.slice(anchor + 1)}`
    verb = 'section created'
  }
  await atomicWrite(index, next)
  return { message: verb }
}
