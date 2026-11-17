/**
 * skill-gesture — 让用户输入 `/name` 变成确定性的 skill 正文注入。
 *
 * 用户原话（2026-11-17）：
 *   「我有时候会直接在信息开始或者结尾输入 /compress，但是有些时候模型不理会这个
 *     技能，有没有办法能让模型直接被动读取这个技能，而不是主动去寻找？
 *     就是说，只要我发了这个技能，他就必须把这个技能的详情塞进上下文」
 *   「那就 b 吧，如果其他技能也需要这么做，就一块做了吧，依靠模型自觉性还是有点差的」
 *
 * ── WHY 不是「注册成 /name 命令」 ─────────────────────────────────────────────
 * dsh 的 `commands/execute` 定义原文（app.asar）：
 *   "Parse and execute a known command WITHOUT sending it to the model. ...
 *    Admission misses (syntax or unknown name) log nothing — they never entered a handler."
 * 命令结果只到 UI，永不到模型。`/thinklang` 那种能工作，是因为它只写一个 JSON 文件。
 * 所以「注册一个 /compress 命令来吐正文」是死路：用户在界面上看得见那一大段，
 * 模型看见的仍然只有他自己敲的那句 `/compress`。
 *
 * ── WHY 是 `agent/pre-step` 而不是 `agent.inject` ────────────────────────────
 * `agent.inject`（skill-search.mjs 的 skill_load 就用它）进的是 **next-step inbox**，
 * 也就是「下一个 request」。而用户那条 `/compress` 已经在**当前**批次里了：
 * 用它注入正文会晚一步 —— 模型先答一版没读 skill 的，下一轮才拿到正文。
 * 那不是「发了就必须看到」，是「发了之后某一轮会看到」。
 * pre-step waterfall 能直接改 `decision.messages`，让正文与用户消息**同批采样**。
 *
 * ── WHY source.kind 用 'skill-invocation' ───────────────────────────────────
 * 两条理由，缺一条就塌：
 *  1. 这是 dsh 的原生类型（app.asar: SkillInvocationSource
 *     { readonly kind: 'skill-invocation'; readonly name: string; readonly form: 'instructions' }），
 *     形状与 skill_load 的注入**逐字一致**，所以可回放、可压缩、可恢复。
 *  2. 本 preset 的 context-gate 只放行这一个 kind：
 *     `allowKinds: [skill-invocation]`。用别的 kind，未晋升会话里这条正文会被
 *     整个剥掉 —— 插件看起来「生效了」，模型其实什么都没收到。
 *
 * ── WHY 用 ctx.skills.get 而不是自己扫 ~/.dsh/skills ─────────────────────────
 * `get(name)` 返回 undefined 就说明这个名字不是 skill —— 正好消化掉
 * `/usr/bin`、`/api/thinking-language` 这类合法但非技能的斜杠文本，不需要
 * 维护索引、不需要缓存失效、不需要自己解析 frontmatter。
 * 顺带把 open standard 的两条轴分开落实：
 *   - `user-invocable: false` → 用户手势也不响应（这条是 `/name` 的轴）
 *   - `disable-model-invocation` → **不检查**（那条轴管模型自动调，与手势无关）
 * 用户原来的 compress/SKILL.md 写 `disable-model-invocation: false` 正是把两条轴
 * 混成了一句话：那句 false 只表示「模型也可以自己调」，从来不表示「用户打了就注入」。
 */

import { randomUUID } from 'node:crypto'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'skill-gesture'

/** The skill registry must exist before the pre-step listener can resolve names. */
export const inject = ['skills']

/**
 * 一条消息里所有 `/name` 形态的 token。
 *
 * 边界是**故意收紧**的：前一个字符必须是行首、空白或左括号，后一个字符必须是
 * 行尾、空白、右括号或标点。这样 `6.042J/mit`、`C:/Users/27063`、`and/or`
 * 都不会被认成手势 —— 假阳性会白白注入一份正文，而且用户看不出为什么。
 *
 * 全角 `/`（Ｕ+FF0F）也认，中文输入法下很容易打出来。
 *
 * `position` 的代价在这里说清楚：
 *  - `'any'`（默认）认消息里任意位置的 `/name`。代价是**讨论这个机制本身**会触发它 ——
 *    「我打 /compress 没反应」这句话会真的注入一份 compress 正文。
 *  - `'edge'` 只认「第一个 token」或「最后一个 token」。代价是「帮我 /compress 一下再继续」
 *    这种夹在中间的用法不认。用户原话是「信息开始或者结尾输入」，所以 edge 正好覆盖，
 *    但默认仍取 any —— 少一个「我明明打了却没反应」的意外。
 *
 * @param message - one message from the claimed batch.
 * @param position - `'any'` (default) or `'edge'`.
 * @returns skill-name candidates, in first-seen order, deduplicated.
 */
export function gesturesOf(message, position = 'any') {
  const blocks = Array.isArray(message?.content) ? message.content : []
  const text = blocks
    .filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
  if (text === '') return []
  const seen = []
  const pattern = /(?:^|[\s(（[{])[/／]([a-zA-Z0-9][a-zA-Z0-9-]{0,63})(?=$|[\s)）\]}，。,.!?;:、])/gm
  for (const match of text.matchAll(pattern)) {
    const candidate = match[1]
    if (position === 'edge') {
      // `match[0]` 含前导分隔符，所以斜杠位置要减掉「前缀 + 名字」的长度。
      const offset = match.index ?? 0
      const slashAt = offset + (match[0].length - candidate.length - 1)
      const afterAt = offset + match[0].length
      const atHead = slashAt === 0
      const atTail = text.slice(afterAt).trim() === ''
      if (!atHead && !atTail) continue
    }
    if (!seen.includes(candidate)) seen.push(candidate)
  }
  return seen
}

/**
 * Extract the model-facing body of a loaded skill definition.
 *
 * 与 skill-search.mjs 的 extractSkillBody 同形状 —— 那是本机在跑的代码，
 * `ctx.skills.get()` 的返回字段在不同版本间漂过（content / instructions / body），
 * 这里照抄三分支兜底，不猜。
 *
 * @param skill - the object `ctx.skills.get()` resolved.
 * @returns the skill body, or '' when the definition carries none.
 */
export function extractSkillBody(skill) {
  const content = skill?.content ?? skill?.instructions ?? skill?.body
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('\n')
  }
  return ''
}

/**
 * Build the injection message. Shape copied from skill_load's `agent.inject` call,
 * so this message is indistinguishable from a native user gesture.
 *
 * @param skillName - the `/name` that fired.
 * @param body - the SKILL.md body.
 * @param id - message id (caller supplies it so the test can assert).
 * @returns a durable user message carrying the skill instructions.
 */
export function buildInjection(skillName, body, id) {
  return {
    id,
    role: 'user',
    content: [{ type: 'text', text: body }],
    source: { kind: 'skill-invocation', name: skillName, form: 'instructions' },
  }
}

/**
 * Register the pre-step listener.
 *
 * @param ctx - the plugin context (needs `skills`).
 * @param config - `{ enabled?: boolean, skills?: string[] }`.
 *   - `skills` 省略 = 所有 SKILL.md 都响应（用户的「一块做了」）；给了数组 = 只认这些名字。
 *   - `enabled: false` 用于临时整体关掉，不必删行。
 */
export function apply(ctx, config) {
  const cfg = config !== null && typeof config === 'object' ? config : {}
  if (cfg.enabled === false) return

  const allow = Array.isArray(cfg.skills) && cfg.skills.length > 0 ? new Set(cfg.skills) : null
  const position = cfg.position === 'edge' ? 'edge' : 'any'
  const stats = { injected: 0, skipped: 0, probed: 0, lastBytes: 0 }

  // { prepend: true }：与 plan-anchor / thinking-anchor 同理 —— 抢外层，
  // 让注入的消息落进「贴采样点」的那一段。context-gate 注册得更早，仍是最外层，
  // 它会按 allowKinds 复核；skill-invocation 是它唯一放行的 kind。
  ctx.on(
    'agent/pre-step',
    async ({ agent }, next) => {
      const decision = await next()
      try {
        if (decision !== null && typeof decision === 'object' && decision.kind === 'reject') return decision
        const messages = Array.isArray(decision?.messages) ? decision.messages : null
        if (messages === null || messages.length === 0) return decision

        // 第一道闸：整批里没有斜杠就什么都不做。
        // 这是每步都跑的路径，必须在碰 registry / 文件系统之前返回。
        const candidates = []
        for (const message of messages) {
          if (message === null || typeof message !== 'object') continue
          if (message.role !== 'user') continue
          // 只认真正的用户输入：'user' 是 dsh 的 user-rpc source kind。
          // 任何别的 kind（plan-anchor / git-context / 我自己 …）一律不看，
          // 否则它们正文里偶然出现的 /xxx 会触发一次莫名其妙的注入。
          const sourceKind = message?.source?.kind
          if (sourceKind !== undefined && sourceKind !== 'user') continue
          for (const skillName of gesturesOf(message, position)) {
            if (!candidates.includes(skillName)) candidates.push(skillName)
          }
        }
        if (candidates.length === 0) return decision

        // 已经在批次里的同名注入不再重复（重发同一条消息、
        // 或本插件在同一个 turn 的后续步被再次触发时）。
        const already = new Set()
        for (const message of messages) {
          if (message?.source?.kind === 'skill-invocation' && typeof message.source.name === 'string') {
            already.add(message.source.name)
          }
        }

        const scope = agent ?? ctx
        const cwd = agent?.session?.header?.cwd
        const extra = []
        for (const skillName of candidates) {
          if (allow !== null && !allow.has(skillName)) continue
          if (already.has(skillName)) continue
          stats.probed += 1
          let skill
          try {
            skill = await ctx.skills.get(skillName, { scope, cwd })
          } catch {
            continue // registry 不认识这个名字 —— 那就是一段普通斜杠文本，放过
          }
          if (skill === undefined || skill === null) continue
          // 用户手势只看 user-invocable 这一轴；disable-model-invocation 不参与判断。
          if (skill?.invocation?.userInvocable === false) {
            stats.skipped += 1
            continue
          }
          const body = extractSkillBody(skill)
          if (body === '') {
            stats.skipped += 1
            continue
          }
          extra.push(buildInjection(skillName, body, `skill-gesture-${skillName}-${randomUUID()}`))
          stats.injected += 1
          stats.lastBytes = Buffer.byteLength(body, 'utf8')
        }
        if (extra.length === 0) return decision
        return { ...decision, messages: [...messages, ...extra] }
      } catch {
        // 注入失败绝不能吃掉用户上下文 —— 原样放行。
        stats.skipped += 1
        return decision
      }
    },
    { prepend: true },
  )

  return { stats }
}
