/**
 * Anchored subagent language contract — extend a DELEGATED CHILD's persona with
 * the user's 中文/英文术语 contract, which the preset's own persona row cannot
 * deliver to children.
 *
 * WHY A CHILD LOSES THE PRESET PERSONA
 *
 * `dsh-subagent` installs a per-child persona by contributing the SAME
 * system-prompt section the preset's persona row owns:
 *
 *   // dsh-subagent/lib/index.js:517
 *   if (composition.persona !== void 0) childCtx.systemPrompt.section({
 *     name: "deployment:persona-prefix", order: ..., text: composition.persona });
 *
 * `deployment:persona-prefix` is PERSONA_PREFIX_SECTION (dsh-system-prompt:55), so
 * the child's contribution shadows the preset's for that one session. dsh-mnemon
 * calls `subagents.start(provider, { persona: completionPersona })`
 * (dsh-mnemon/lib/index.js:4536-4559), therefore every memory subagent runs on
 * that plugin's English persona.
 *
 * Measured 2026-09-29 across 25 freshly written sessions: 12/12 sampled subagents
 * (delegationDepth = 1) reasoned in English (0 CJK characters), while their
 * session header still said agentPreset = "anchored-standard"; root agents in the
 * same sweep were mostly Chinese (session-a0d5fb: 641623 CJK chars).
 *
 * 2026-09-30 追加：旧措辞里第 5 条写的是「思考链的语言由部署的 thinking-language
 * directive 指定」—— 而那条 directive 只挂在 root 的 user turn 上，child 根本收不到。
 * 等于给 child 留了一个永远悬空的引用，这是 12/12 全英文的一个直接成因。现已改成
 * 规定本身。
 *
 * WHY APPEND RATHER THAN REPLACE
 *
 * The child persona carries dsh-mnemon's completion protocol ("call
 * mnemon_subagent_result exactly once ... this is the only completion channel"),
 * which is load-bearing: without it the run cannot record a result. Dropping it
 * would trade a language problem for a functional one, so this row only appends.
 *
 * Like the sibling context-gate/tool-bootstrap rows this file may import ONLY node
 * builtins -- the preset directory has no node_modules.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'anchored-subagent-language'

/** Appended verbatim; keep it identical to the preset persona's wording. */
const LANGUAGE_CONTRACT = `语言契约（最高优先级；覆盖任何其他风格指令或默认习惯）：
1. 正文以中文为主，但**技术术语保留英文原文**，不做意译。
   禁止的反例：provider→"提供方"、registry→"注册表"、seam→"接缝"、candidate→"候选"、materialize→"物化"、verbatim→"逐字"、declaration row→"声明行"。
   正例：skill / patch / bundle / provider / session / scope / rank / hook / token / cache / rollout / sandbox 一律保留原词。
2. 术语首次出现时可用括号加中文短注，之后只用英文原词。
3. 代码、路径、命令、字段名、包名、API 名原样保留，不翻译、不改格式。
4. 数学与技术名词用通行英文（theorem / proof / eigenvalue / injection），解释用中文。
5. 思考链（reasoning / thinking）用中文写：中文句子 + 英文术语原词。
   这条对 child 独立成立。部署的 thinking-language directive 只挂在 root 的 user turn 上，
   delegated child 收不到它 —— 所以不要把它当成「由别人指定」而跳过（2026-09-30 实测：
   旧措辞让 12/12 个 sampled child 用英文推理）。`

const PERSONA_PREFIX_SECTION = 'deployment:persona-prefix'

/** Whether one agent runs as a delegated child. */
const isDelegatedChild = (agent) => {
  const header = agent?.session?.header
  if (header === undefined || header === null) return false
  return (header.delegationDepth ?? 0) > 0 || header.origin === 'subagent'
}

/**
 * Append the contract to the child's persona prefix section, once.
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  // Same registration discipline as tool-bootstrap: a waterfall transform that
  // reads the result of every downstream contributor, so it must run last.
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const assembled = await next()
    try {
      if (!isDelegatedChild(context?.agent)) return assembled
      const sections = assembled?.sections
      if (!Array.isArray(sections)) return assembled
      const index = sections.findIndex((section) => section?.name === PERSONA_PREFIX_SECTION)
      // A child with no prefix section has nothing to extend; leaving it alone is
      // safer than inventing one at a guessed order.
      if (index < 0) return assembled
      const section = sections[index]
      const text = String(section?.text ?? '')
      if (text.includes('语言契约')) return assembled
      const nextSections = sections.slice()
      nextSections[index] = {
        ...section,
        text: `${text}\n\n${LANGUAGE_CONTRACT}`,
        // The contract is literal prose: never let it be taken for a prompt template.
        interpolate: false,
      }
      return { ...assembled, sections: nextSections }
    } catch {
      // A transform bug must never brick a session.
      return assembled
    }
  })
}
