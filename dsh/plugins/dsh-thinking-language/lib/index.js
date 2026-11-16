/**
 * thinking-language — host half.
 *
 * 用户要求（2026-09-30）：
 *   「思考语言有没有插件能给我加个开关，能切换中英文」
 *   「只切换思考链，直接上 ui 完整版，因为很多时候都是英文思考链」
 *
 * WHY 这个开关必须是「请求级」而不是「配置级」
 *
 * 语言契约原本只有一条注入路径：profile 的 persona `prefix:` 里写死的 clause 5
 * （「思考链同样遵守本契约：用中文思考」）。`cordis.patch.yml` 参与 HMR，所以改
 * 那句文本确实能生效——但代价是「改 YAML → 开新会话」，不是开关。
 *
 * 本插件把 clause 5 与实际语言**解耦**：
 *   * 静态文案降级为中性的「以 thinking-language directive 为准」；
 *   * 真实 directive 由本插件在 `system-prompt/assemble` waterfall 里按当前状态追加。
 * 由于 assemble 每个请求都跑，切换开关后**下一条消息即生效**，不需要重启、不需要开会话。
 *
 * WHY 追加到 persona section 而不是新起一个 section
 *
 * 与同目录的 subagent-language.mjs 同一纪律：新起 section 需要猜 `order`，而
 * `deployment:persona-prefix` 一定存在（root 来自 preset persona，child 来自
 * dsh-subagent 的 persona 贡献），追加是零风险的。
 *
 * WHY 标记 + 幂等重写，而不是无条件 append
 *
 * assemble 会被多次触发（多轮、compaction、subagent），且下游 transform 可能已经
 * 处理过同一段文本。用 `[thinking-language: xx]` 标记先剥后写，保证任意触发次数下
 * 文本里最多只有一个 directive，也顺带让「顺序无关」成立：无论本 handler 在
 * waterfall 的哪一层，结果相同。
 *
 * 状态存储：`$DSH_HOME/storages/thinking-language.json`，mtime 缓存热读。
 * HTTP 面：`GET/POST /api/thinking-language`（同源，设置页直接 fetch）。
 * 兜底面：`/thinklang` 命令，UI 半侧在某个平台不加载时仍可切换。
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-thinking-language'

/** The host route and the human command both need these two services. */
export const inject = ['connection', 'commands']

/** Absolute registration path for the switch (same-origin for the web UI). */
export const PATH = '/api/thinking-language'

/**
 * Distinctive sentinel so the directive can be replaced instead of accumulated.
 *
 * A REGEX LITERAL on purpose. Written as a string source it needs `\\[` / `\\n`
 * double escapes, and a single lost backslash silently turns `\[thinking-...\]`
 * into a CHARACTER CLASS — the marker then matches one character plus the rest of
 * the line, so stripping corrupts the persona and idempotence dies quietly.
 * Measured 2026-09-30: that exact mangling made `applyDirective` non-idempotent
 * (145 → 148 chars on a second pass).
 */
const MARKER = /\[thinking-language: (?:zh|en)\][^\n]*/g

/** `zh` is the contract's historical default; anything unknown falls back to it. */
export const DEFAULT_LANGUAGE = 'zh'

const STATE_FILE = 'thinking-language.json'

/** Both languages' directive text, appended verbatim (never interpolated). */
const DIRECTIVE = {
  zh: `[thinking-language: zh] 思考链（reasoning / thinking）用中文书写；技术术语、代码、路径、字段名、API 名保留英文原词，不要在 thinking 里输出完整英文句子。本 directive 只约束思考链，正文语言仍遵守上面的语言契约。`,
  en: `[thinking-language: en] Write the thinking chain (reasoning / thinking) in English. Keep technical terms, code, paths, field names and API names verbatim; do not write the thinking chain in Chinese. This directive governs the thinking chain only — the visible answer still follows the language contract above.`
}

/** DSH home, so a profile running under a relocated home reads the same file. */
export const dshHome = () => process.env.DSH_HOME ?? join(homedir(), '.dsh')

/** Absolute path of the persisted switch. */
export const statePath = () => join(dshHome(), 'storages', STATE_FILE)

/** Normalize any input to a language this plugin serves. */
export function normalizeLanguage(value) {
  return value === 'en' ? 'en' : DEFAULT_LANGUAGE
}

let cache = { key: undefined, value: DEFAULT_LANGUAGE }

/**
 * Read the switch. Cached on `mtimeMs:size` so a POST from the settings page (or a
 * hand edit of the file) is picked up by the very next assembly.
 * @returns the active language.
 */
export function readLanguage() {
  const file = statePath()
  try {
    const stat = statSync(file)
    const key = `${stat.mtimeMs}:${stat.size}`
    if (key === cache.key) return cache.value
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const value = normalizeLanguage(parsed?.thinking)
    cache = { key, value }
    return value
  } catch {
    // Missing or unparseable state means "never configured": the default language.
    return DEFAULT_LANGUAGE
  }
}

/**
 * Persist the switch atomically enough for a single writer.
 * @param value - the requested language.
 * @returns the language actually stored.
 */
export function writeLanguage(value) {
  const next = normalizeLanguage(value)
  const file = statePath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ thinking: next }, null, 2)}\n`, 'utf8')
  const stat = statSync(file)
  cache = { key: `${stat.mtimeMs}:${stat.size}`, value: next }
  return next
}

/**
 * Rewrite a section's text so it carries exactly one directive for `language`.
 *
 * Exported for the unit test: this is the whole behavior of the switch, and it must
 * hold for every input the assemble waterfall can hand over — a persona with the
 * neutral clause, a child persona that had the contract appended after it, or the
 * same text assembled twice.
 * @param text - the section text as assembled.
 * @param language - the active language.
 * @returns the text with the directive replaced (never duplicated).
 */
export function applyDirective(text, language) {
  const source = String(text ?? '')
  // A fresh regex per call: a shared /g literal would carry `lastIndex` between calls.
  const marker = new RegExp(MARKER.source, 'g')
  const stripped = source.replace(marker, '').replace(/\n{3,}/g, '\n\n').trimEnd()
  return `${stripped}\n\n${DIRECTIVE[normalizeLanguage(language)]}`
}

/** The system-prompt section the persona lands in (see subagent-language.mjs). */
const PERSONA_PREFIX_SECTION = 'deployment:persona-prefix'

/** JSON response helper for the route. */
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  })

/**
 * Register the request-level directive, the switch route, and the text command.
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  // (1) The directive itself. A broken transform must never brick a session, so the
  //     catch degrades to the assembled value exactly like context-gate does.
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const assembled = await next()
    try {
      const sections = assembled?.sections
      if (!Array.isArray(sections)) return assembled
      const index = sections.findIndex((section) => section?.name === PERSONA_PREFIX_SECTION)
      // No prefix section means there is nothing to extend; inventing one at a
      // guessed order is riskier than leaving this assembly alone.
      if (index < 0) return assembled
      const language = readLanguage()
      const section = sections[index]
      const text = applyDirective(section?.text, language)
      if (text === section?.text) return assembled
      const nextSections = sections.slice()
      nextSections[index] = {
        ...section,
        text,
        // Literal prose: never let it be taken for a prompt template.
        interpolate: false
      }
      return { ...assembled, sections: nextSections }
    } catch {
      return assembled
    }
  })

  // (2) The switch's HTTP face, for the settings page (same origin, no CORS dance).
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: PATH,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          if (request.method === 'GET') return json({ thinking: readLanguage() })
          let requested
          try {
            const raw = await request.text()
            requested = raw.trim().length === 0 ? undefined : JSON.parse(raw)?.thinking
          } catch {
            return json({ error: 'body must be JSON: {"thinking":"zh"|"en"}' }, 400)
          }
          if (requested !== 'zh' && requested !== 'en') {
            return json({ error: 'thinking must be "zh" or "en"' }, 400)
          }
          return json({ thinking: writeLanguage(requested) })
        }
      }),
    'thinking-language: switch route'
  )

  // (3) A text fallback that works even where the client half never loads.
  ctx.effect(
    () =>
      ctx.commands.register({
        definitionId: '@local/dsh-thinking-language',
        name: 'thinklang',
        description: 'Show or switch the thinking-chain language (zh | en)',
        handler: (invocation) => {
          const argument = String(invocation?.rawInput ?? '').trim().toLowerCase()
          if (argument === '') {
            return { kind: 'success', text: `thinking-language: ${readLanguage()}` }
          }
          if (argument !== 'zh' && argument !== 'en') {
            return { kind: 'error', text: 'usage: /thinklang [zh|en]' }
          }
          return { kind: 'success', text: `thinking-language: ${writeLanguage(argument)}` }
        }
      }),
    'thinking-language: /thinklang command'
  )
}
