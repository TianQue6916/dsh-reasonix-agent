/**
 * skill-search — on-demand skill discovery and loading, replacing
 * `dsh-tool-skill`'s full-catalog injection.
 *
 * WHY: the available-skills reminder (`<available_skills>`, ~9KB with many
 * skills) is injected into the first step by dsh-tool-skill and again after
 * every promotion/compaction. That large injected block perturbs the
 * trajectory (issue #6: 0/9 anchored with the catalog present vs ~81%
 * without). We remove the catalog injection entirely and expose two small
 * tools instead — the Claude tool-search pattern:
 *
 *  - `skill_search` — list skills whose name/description match a query
 *    (summaries only, bounded; no bodies). The model discovers what exists
 *    without a 9KB dump.
 *  - `skill_load` — load ONE skill's full instructions by exact name and
 *    inject them for the NEXT request via `agent.inject` (the non-waking
 *    next-step inbox). The model (or the user) calls this only when the
 *    skill is actually needed.
 *
 * Discovery reads `ctx.skills` scoped to the calling agent, exactly like
 * dsh-tool-skill. If skills are unavailable the tools answer with a short
 * message instead of throwing.
 *
 * NOTE: this plugin REPLACES the `dsh-tool-skill` row in the composition —
 * the composition must NOT mount both, or the catalog injection returns.
 *
 * Invocation policy (2026-10-01). `ctx.skills.list()` returns EVERY
 * discovered skill regardless of frontmatter: the
 * `disable-model-invocation: true` filter lives in dsh-tool-skill's catalog
 * renderer, not in the registry. Measured: after disabling 50 skills
 * (46 in `%APPDATA%easonix\skills` + 4 in `~/.agents/skills`),
 * `skill_search` still returned `hindsight-coding-agent` in a fresh dsh
 * process. So both tools here re-apply the policy themselves and drop any
 * skill whose `skill.invocation.modelInvocable === false` — the same field
 * `dsh-skill/lib/index.js:37 isModelInvocable()` reads and that
 * `dsh-skill-filesystem/lib/index.js:853` derives from frontmatter.
 */

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'skill-search'

/** The agent, tools, and skills services must exist before these tools can register. */
export const inject = ['agents', 'tools', 'skills']

const MAX_RESULTS = 20
/**
 * Usage ledger — how often each skill was actually loaded, and when. Written on every
 * successful `skill_load`, read only to sort `skill_search` results: a frequently or
 * recently used skill floats up, but a strictly better textual match still wins.
 * This is the dsh-side counterpart of the community `dsh-skill-scoreboard` plugin —
 * kept inside this tool because the ordering adjustment has to happen here.
 */
const USAGE_PATH = process.env.DSH_SKILL_USAGE ?? join(homedir(), '.dsh', 'storages', 'skill-usage.json')
/** Days after which one past use stops mattering much (exponential decay). */
const RECENCY_HALF_LIFE_DAYS = 14
/** How far usage may lift a skill above an equally-matching peer. */
const USAGE_WEIGHT = 0.6
/** Loads at which the frequency term saturates — drives the [0,1] normalization in usageScore. */
const FREQUENCY_SATURATION_LOADS = 20

/** Read the ledger (missing or corrupt reads as empty). */
async function loadUsage() {
  try {
    const parsed = JSON.parse(await readFile(USAGE_PATH, 'utf8'))
    if (parsed && typeof parsed === 'object' && parsed.skills) return parsed
  } catch {
    /* cold start */
  }
  return { version: 1, skills: {} }
}

/** Atomic write of the ledger. */
async function saveUsage(state) {
  await mkdir(dirname(USAGE_PATH), { recursive: true })
  const tmp = `${USAGE_PATH}.tmp-${process.pid}`
  await writeFile(tmp, JSON.stringify(state, null, 1), 'utf8')
  await rename(tmp, USAGE_PATH)
}

/** Record one successful load; the ledger is best-effort and never breaks a call. */
async function recordSkillUse(name) {
  try {
    const state = await loadUsage()
    const entry = state.skills[name] ?? { loads: 0, firstUsedAt: 0, lastUsedAt: 0 }
    entry.loads += 1
    entry.lastUsedAt = Date.now()
    if (!entry.firstUsedAt) entry.firstUsedAt = entry.lastUsedAt
    state.skills[name] = entry
    await saveUsage(state)
  } catch {
    /* best-effort */
  }
}

/**
 * Frequency + recency score for one skill, normalized to [0,1] (0 when never used).
 *
 * WHY NORMALIZED（2026-09-28 修）:
 *   初版返回 `log1p(loads) + exp(-age/HL)` —— **无界**，而 `match ∈ [0,1]`，两者量纲不可比。
 *   实测：loads=1 的技能得 0.6*(0.693+1) = 1.016，已反超「完美匹配但从未用过」的 1.000；
 *   临界 loads ≈ 0.95，即**用过一次就能压过任何文本匹配差异** ——
 *   与本文件开头的承诺「a frequently or recently used skill floats up,
 *   but a strictly better textual match still wins」完全相反。
 *   归一化后 USAGE_WEIGHT 才真的表达「最多抬升多少」：usage∈[0,1] ⇒ 最多 +0.6 < 1.0，
 *   于是「完美匹配」永远赢过「零匹配但常用」。
 */
function usageScore(entry, now) {
  if (entry === undefined || entry === null) return 0
  const loads = entry.loads ?? 0
  if (loads <= 0) return 0
  const frequency = Math.min(1, Math.log1p(loads) / Math.log1p(FREQUENCY_SATURATION_LOADS))
  const ageDays = Math.max(0, (now - (entry.lastUsedAt ?? 0)) / 86400000)
  const recency = Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS)
  // 频率 0.6 / 近因 0.4：技能是低频资产（账本实测一个月可能才 load 一两次），
  // log1p 压缩后频率项区分度有限，所以"最近用过"必须占足够比重。
  return Math.min(1, 0.6 * frequency + 0.4 * recency)
}

/** Short relative age for the result line. */
function relativeDays(at, now) {
  if (!at) return 'never'
  const days = (now - at) / 86400000
  if (days < 1) return 'today'
  if (days < 2) return 'yesterday'
  if (days < 30) return `${Math.round(days)}d ago`
  return `${Math.round(days / 30)}mo ago`
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

/** Register the two on-demand skill tools. */
export function apply(ctx) {
  /**
   * Whether frontmatter permits model invocation. `ctx.skills.list()` does not
   * filter on this (see the module header), so both tools apply it here.
   * Defensive: a skill without an `invocation` object counts as invocable.
   */
  const modelInvocable = (skill) => (skill && skill.invocation && skill.invocation.modelInvocable) !== false

  /** Normalize a query into lowercase tokens for simple substring matching. */
  const tokens = (text) => (text || '').toLowerCase().split(/[^a-z0-9_-]+/).filter(Boolean)

  ctx.tools.register({
    name: 'skill_search',
    description: 'Search the available skills by keyword and return matching skill names with short descriptions. This session keeps NO skill catalog in the prompt — if a task looks like it matches a skill (document conversion, image processing, game reviews, markdown, PDF, spreadsheets, …), call skill_search FIRST to find it, then skill_load to activate it. Do NOT assume skill names from memory.',
    parameters: toJsonSchema({
      query: { type: 'string', required: true, description: 'search keywords (e.g. "pdf", "obsidian", "game review")' },
    }),
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } }, required: ['text'] },
      render: (_a, v) => [{ type: 'text', text: v.text }],
    },
    async execute(args, exec) {
      const wanted = tokens(args.query)
      const scope = exec?.agent ?? ctx
      try {
        const all = await ctx.skills.list({
          scope,
          cwd: exec?.agent?.session?.header?.cwd,
          signal: exec?.signal,
        })
        const usageState = await loadUsage()
        const now = Date.now()
        const scored = all
          .filter(modelInvocable)
          .filter((skill) => {
            if (wanted.length === 0) return true
            const haystack = tokens(`${skill.name} ${skill.description ?? ''} ${skill.whenToUse ?? ''}`).join(' ')
            return wanted.every((token) => haystack.includes(token))
          })
          .map((skill) => {
            const nameTokens = tokens(skill.name).join(' ')
            const nameHits = wanted.filter((token) => nameTokens.includes(token)).length
            const entry = usageState.skills[skill.name]
            return {
              skill,
              entry,
              match: wanted.length === 0 ? 0 : nameHits / wanted.length,
              usage: usageScore(entry, now),
            }
          })
          .sort(
            (a, b) =>
              b.match + USAGE_WEIGHT * b.usage - (a.match + USAGE_WEIGHT * a.usage) ||
              a.skill.name.localeCompare(b.skill.name),
          )
        const matches = scored.map((row) => row.skill)
        const head = scored.slice(0, MAX_RESULTS)
        const lines = head.map((row) => {
          const desc = (row.skill.description || '').split('\n')[0]
          const uses = row.entry && row.entry.loads > 0 ? ` [${row.entry.loads}x, ${relativeDays(row.entry.lastUsedAt, now)}]` : ''
          return `- ${row.skill.name}${uses}: ${desc}`
        })
        if (lines.length === 0) return { text: `No skills match "${args.query}". Use skill_search with other keywords.` }
        const extra = matches.length > MAX_RESULTS ? `\n…(${matches.length - MAX_RESULTS} more)` : ''
        return { text: `Matching skills (${matches.length}):\n${lines.join('\n')}${extra}\n\nLoad one with skill_load (exact name).` }
      } catch (error) {
        return { text: `skill_search unavailable: ${String((error && error.message) || error)}` }
      }
    },
  })

  ctx.tools.register({
    name: 'skill_load',
    description: 'Load the full instructions of ONE skill by its exact name (from skill_search results) and inject them for the next request. Call this before acting on a task that matches the skill.',
    parameters: toJsonSchema({
      name: { type: 'string', required: true, description: 'exact skill name (kebab-case, from skill_search)' },
    }),
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } }, required: ['text'] },
      render: (_a, v) => [{ type: 'text', text: v.text }],
    },
    async execute(args, exec) {
      try {
        const agent = exec?.agent
        if (agent === undefined) return { text: 'skill_load requires an agent context.' }
        const skill = await ctx.skills.get(args.name, {
          scope: agent,
          cwd: agent.session.header.cwd,
          signal: exec?.signal,
        })
        if (skill === undefined) {
          return { text: `No skill named "${args.name}". Run skill_search to list available skills.` }
        }
        if (!modelInvocable(skill)) {
          return {
            text: `Skill "${args.name}" is not model-invocable: its SKILL.md sets \`disable-model-invocation: true\`. Invoke it from the user side instead.`,
          }
        }
        const body = extractSkillBody(skill)
        if (body.length === 0) {
          return { text: `Skill "${args.name}" has no loadable body.` }
        }
        // Queue the skill content as a non-waking next-step context message,
        // exactly like dsh-tool-skill's invocation injection.
        agent.inject({
          id: `skill-load-${args.name}-${Date.now()}`,
          role: 'user',
          content: [{ type: 'text', text: body }],
          source: { kind: 'skill-invocation', name: args.name, form: 'instructions' },
        })
        await recordSkillUse(args.name)
        return { text: `Skill "${args.name}" loaded; its instructions will be injected for the next request.` }
      } catch (error) {
        return { text: `skill_load failed: ${String((error && error.message) || error)}` }
      }
    },
  })
}

/** Extract the model-facing body of a loaded skill definition. */
function extractSkillBody(skill) {
  const content = skill?.content ?? skill?.instructions ?? skill?.body
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('\n')
  }
  return ''
}
