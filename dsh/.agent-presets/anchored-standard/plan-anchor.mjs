/**
 * plan-anchor —— 把「当前目标 / 下一步」钉在采样点旁边，每步重注入。
 *
 * 为什么需要它（问题陈述）
 *   长任务的失败模式不是「模型不会做」，而是**目标在上下文里被稀释**：turn 1 说清的目标，
 *   到 turn 20 已经埋在几万 token 的历史里，模型开始做局部最优而丢掉全局。dsh 原生
 *   `todo_write` 解决了「任务栏可见」，但那是**写给用户看的**，且只在被调用时才更新；
 *   它没有解决「模型每一步采样时，眼前有没有当前目标」这个问题。
 *
 * 设计依据（社区经验，不是凭空设计）
 *   参考 `OthmanAdi/planning-with-files`（★27229，v3.21.0）—— 目前这个方向最成熟的开源实现，
 *   其 README 原文的关键句是 "**per-turn re-injection against context rot**"。
 *   从它那里抄了四条经过验证的做法，逐条对到 dsh 的 hook 上：
 *
 *   ① **每轮重注入**（pwf 的 UserPromptSubmit hook）→ 本行挂在 `agent/pre-step`。
 *      pwf 用 5 个 hook 事件做不同剂量；dsh 只有一个 pre-step 注入点，所以剂量控制
 *      只能靠本行自己（见下条）。
 *
 *   ② **按上下文收窄剂量**：pwf 的 inject-plan.sh 头注释原文 ——
 *      `pretool — short plan head only (head -30), no progress.`
 *      `precompact — compaction reminder only (no plan body), matches v2.`
 *      即：**只在每轮开头给完整 plan，工具调用之间只给 30 行 head**。
 *      本行取后者作为唯一剂量（head，默认 30 行）—— 因为 dsh 的 pre-step 每一步都会跑，
 *      给全文等于每步重发全文，那是纯浪费且会加剧 habituation。
 *
 *   ③ **可验证包裹**（pwf 第 1076-1089 行，这是它的设计精华）：
 *      `===BEGIN-PWF-DATA kind=… nonce=… bytes=… sha256=… truncated=…===`
 *      其中 nonce = sha256("planning-with-files-context-v1\0" + kind + "\0" + 文件全文) 前 24 字符，
 *      bytes = 原文件字节数，truncated = 是否被裁剪。
 *      意义：**模型能自证「我看到的这份 plan 是不是最新、有没有被截断」** —— 没有这个，
 *      模型无法区分「计划只有这三条」和「计划被截断了，后面还有」。这是反 context rot 的关键。
 *      本行照抄这个形状（见 frame()）。
 *
 *   ④ **fail-closed**（pwf 多处）：`"Fix or unset the pin; a broken pin fails closed rather
 *      than selecting another plan."` / `"Multiple plans are available … nothing injected."`
 *      即：**状态不明就不注入，绝不猜**。本行照办 —— 读不到、空文件、抛异常，一律静默跳过
 *      （而不是注入一段「plan 读不到」的噪声）。
 *
 * 故意不抄的
 *   pwf 的 completion gate（Stop hook 拒绝停止）在本行里是**另一个独立杠杆**：dsh 侧的等价物是
 *   `agent/turn-stopping` + `agent.steer()`（机制已验证：dsh-agent-loop/lib/index.js:999-1005
 *   在 dispatch 之后**重新检查** inbox.nextStep.length，listener 里 steer 进去就能阻止 break）。
 *   但它会改变 agent loop 的终止行为，风险等级完全不同，所以**不在本文件里**，留给独立的 gate 行。
 *   本文件只做一件事：让目标可见。
 *
 * per-session 规划文件（2026-10-28 新增）
 *   全局 `$DSH_HOME/PLAN.md` 被每个会话同时注入的问题：多任务并行时目标互相污染、
 *   文件无界增长（实测 2616 行 / 317 KB，head 永远是同一段）、会话结束无从审计。
 *   现在每个会话有自己的 `$DSH_HOME/plans/<session-id>.md`：首次注入自动建骨架，
 *   内容天然有界，会话结束即审计单元。全局 PLAN.md 降级为「跨会话长期档案」，
 *   不再自动注入 —— 会话内需要时自己 read。
 *   配置：perSession（默认 true）/ subagents: 'own' | 'parent' | 'none'（**默认 own**）
 *   / projectTodos（默认 true，2026-10-29 加）—— 把 plan 的「下一步」投影成 dsh 原生 todos，
 *   让用户能在对话流的 TodoPanel 里看见（详见 apply() 里那段投影的注释）。
 *   2026-10-28 用户拍板：**每个会话（含子 agent）各建一份独立文件** —— 原话「每次新开一个
 *   会话都要自动建立一个全新的、不可被替代的任务模板，就是这个 plan.md」。
 *   所以 'parent'（子 agent 共享父文件）不再是默认；它保留为可选，但实测无效（见 planOwnerId）。
 *
 * 注入形状（与 thinking-anchor.mjs / git-context.mjs 同构）
 *   { id, role: 'user', content: [{type:'text', text}], source: { kind, form:'snapshot', sections:[…] } }
 *   id 必填 —— 缺失会让 session validator 报 `session event at seq N lacks an identified message`。
 *
 * 与 thinking-anchor.mjs 的关系
 *   两者都挂在 `agent/pre-step` 且都用了 `{ prepend: true }`。谁后 unshift 谁在外层（改写更靠后）。
 *   顺序由 cordis.yml 里的注册先后决定，见 contexts 的记账。
 */

import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'plan-anchor'
export const inject = []

/** 默认 plan 文件：放在 DSH_HOME 根，跨项目共用一份（用户的主战场是 ~/.dsh 本身）。 */
const DEFAULT_PLAN_FILE = 'PLAN.md'
/** per-session 规划文件的目录（相对 DSH_HOME）。2026-10-28 新增。 */
const DEFAULT_PLANS_DIR = 'plans'
/** 默认只给前 30 行 —— 对齐 pwf 的 `head -30` 剂量。 */
const DEFAULT_HEAD_LINES = 30
/** 单次注入的硬上限（字节），防止一个巨型 plan 把上下文吃掉。 */
const DEFAULT_MAX_BYTES = 8000

export const dshHome = () => process.env.DSH_HOME ?? join(homedir(), '.dsh')

/** plan 文件路径：cfg.path 优先，否则 $DSH_HOME/PLAN.md。 */
export const planPath = (cfg) =>
  typeof cfg?.path === 'string' && cfg.path !== '' ? cfg.path : join(dshHome(), DEFAULT_PLAN_FILE)

/**
 * per-session 规划文件的目录。默认 $DSH_HOME/plans/。
 *
 * 为什么需要它（2026-10-28 用户明确要求：「plan 这个文件是不是被所有 agent 任务都用了？
 * 混到一块了吧？……给每个会话自动建立独立的任务规划模块」）
 *   全局 PLAN.md 的问题：① 它被**每一个** session（含 subagent）同时注入，多任务并行时
 *   目标互相污染 —— A 任务的「下一步」会被 B 任务当成自己的；② 文件本身会长到几百 KB
 *   （实测 2616 行 / 317 KB），每次注入都取同一份 head，新会话看到的是历史堆积而不是自己
 *   的任务；③ 会话结束后无从审计「那次会话到底想干什么」。
 *   ⇒ 拆成 per-session 文件：一个会话一个文件，创建即建、随会话走、内容天然有界。
 */
export const plansDir = (cfg) => {
  const dir = typeof cfg?.plansDir === 'string' && cfg.plansDir !== '' ? cfg.plansDir : DEFAULT_PLANS_DIR
  return dir.startsWith('/') || /^[A-Za-z]:[\/]/.test(dir) ? dir : join(dshHome(), dir)
}

/** session id 直接来自 dsh（`session-<uuid>` 或裸 uuid），字节安全，不需要再转义。 */
const SAFE_SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/

/**
 * 一个会话的规划文件路径。
 * sessionId 缺失 / 形状异常时返回 null —— 调用方据此回落到全局 PLAN.md（fail-open，
 * 绝不能因为拿不到 session 就让注入整个消失）。
 */
export const sessionPlanPath = (cfg, sessionId) => {
  if (typeof sessionId !== 'string' || !SAFE_SESSION_ID.test(sessionId)) return null
  return join(plansDir(cfg), `${sessionId}.md`)
}

/** 会话创建时写入的骨架。刻意短：它会被反复重注入，长模板等于每步发一遍噪音。 */
export function sessionTemplate({ sessionId, cwd, now = new Date() }) {
  const lines = [
    `# 任务规划 · ${sessionId}`,
    '',
    '> 本文件由 plan-anchor 自动创建，**只属于这一个会话**。每步取前 30 行重注入。',
    '> 做完一项就更新这里 —— 它是你下一步的判据，不是给别人看的报告。',
    `> 历史细节在 \`${join(dshHome(), 'PLAN.d')}/<任务>/archive.md\`（一个任务一个目录），需要时自己 read。`,
    '> **不要往 `PLAN.md` 或任何公共档案里写** —— 这个文件就是你唯一该写的地方。',
    '',
    `- 会话：\`${sessionId}\``,
  ]
  if (typeof cwd === 'string' && cwd !== '') lines.push(`- 工作目录：\`${cwd}\``)
  lines.push(
    `- 创建：${now.toISOString()}`,
    '',
    '## 目标（一句话，写成可判定的完成条件）',
    '',
    '<!-- 反例："继续推进任务"。正例："给 plan-anchor 加 per-session 支持，并用两个会话验证隔离"。 -->',
    '',
    '## 下一步（最多 3 条，按优先级）',
    '',
    '1. ',
    '',
    '## 已完成',
    '',
    '- ',
    '',
    '## 卡住的点 / 待确认',
    '',
    '',
  )
  return lines.join('\n')
}

/**
 * 确保该会话的规划文件存在，返回路径。
 * 用 `flag: 'wx'` 独占创建：并发/重复调用不会覆盖已有内容（覆盖 = 静默丢用户的任务笔记）。
 * 任何失败都吞掉并返回路径 —— 读取侧 fail-closed 会跳过注入，但绝不抛异常影响会话。
 */
export function ensureSessionPlan(cfg, { sessionId, cwd }) {
  const file = sessionPlanPath(cfg, sessionId)
  if (file === null) return null
  try {
    mkdirSync(plansDir(cfg), { recursive: true })
    writeFileSync(file, sessionTemplate({ sessionId, cwd }), { encoding: 'utf8', flag: 'wx' })
    stats.created += 1
  } catch {
    // EEXIST（已存在）是正常路径；其它错误交给读取侧处理
  }
  return file
}

/**
 * fail-closed 读取。
 * 文件不存在 / 只有空白 / 读失败 / 编码错误 —— 一律返回 null，调用方直接跳过本步注入。
 * **绝不缓存旧内容顶替**（north star：过期的状态比没有状态更坏），
 * 也**绝不用 `mtimeMs:size` 之类的键做缓存**（thinking-anchor.mjs 踩过：两个不同的
 * JSON 恰好同字节数时，同毫秒切换会读回旧值）。
 */
export function readPlan(file) {
  try {
    const raw = readFileSync(file, 'utf8')
    return raw.trim() === '' ? null : raw
  } catch {
    return null
  }
}

/** 取前 n 行（按 \n 切，保留行内容；不补尾随换行）。 */
/**
 * 从 plan 文本里抽「下一步」清单 —— 投影成 dsh 原生 todos 用（用户可见的 TodoPanel）。
 *
 * 为什么只抽「下一步」、不抽「已完成」：
 *   todos 是「还要做什么」的视图，不是归档。plan 的「已完成」是逐条累积的，会越来越长；
 *   映射进去会让 TodoPanel 变成滚动日志，反而看不见当前该干的事。
 *
 * 认的写法：`## 下一步` 段下，以 `1. ` / `2. ` / `- ` / `* ` 开头的行；段落到下一个 `## ` 为止。
 * 拿不到该段、或段里没条目 → 返回 null。调用方据此**跳过**投影（绝不清空用户已有的列表）。
 */
/**
 * 写类工具：调过就说明「这一轮真的干活了」。只读类（web_search / 纯读文件）不算 ——
 * 社区同款做法见 planning-with-files v3 的 PostToolUse nudge，注释原文 `off read-only tools`。
 */
export const WRITE_TOOLS = new Set([
  'bash', 'pwsh', 'str_replace_editor', 'write_file', 'edit', 'apply_patch',
])

/** 每个会话「本轮已提醒过陈旧」的轮次号。轮次号来自 turn/start 事件的 data.turn。 */
const staleSeen = new Map()

/**
 * 本轮「干了活但没更新 plan」的检测。返回 null 表示没什么可提醒的。
 *
 * 为什么需要它（2026-10-31 用户反馈「会话干完活 UI 都不更进」）：
 *   todos 是 plan 的投影，plan 不更新 ⇒ 界面永远停在旧状态。实测本会话 plan 停在 10-29，
 *   而那天之后干了一整天活。所以问题不是投影，是**没人督促模型在收尾时落笔**。
 *
 * 判据全部来自 session.log 里现成的东西，不额外维护状态：
 *   - 最后一条 `turn/start` 的 `data.turn` = 当前轮次（事件自带，不用自己数）
 *   - 本轮 `tool/call` 里 name ∈ WRITE_TOOLS 的条数 = 干了多少活
 *   - plan 文件的 mtime 是否 >= 本轮开始时刻 = 本轮落过笔没有
 *
 * 社区依据：planning-with-files v3 用 PostToolUse hook 在写操作后提醒，并明确「**once per turn**」。
 * 它踩过的坑是把提醒发成 `systemMessage`（Claude Code 里那只显示给用户），模型根本收不到 ——
 * 所以这里走**注入进上下文**这条路（和 plan 本身同一条通道），保证模型真的看见。
 */
export function staleHint({ log, file, now = Date.now(), lookback = 400 } = {}) {
  if (!Array.isArray(log) || log.length === 0) return null
  const floor = Math.max(0, log.length - lookback)
  let turn = null
  let turnTime = 0
  for (let i = log.length - 1; i >= floor; i -= 1) {
    if (log[i]?.type === 'turn/start') {
      turn = log[i].data?.turn ?? null
      turnTime = log[i].time ?? 0
      break
    }
  }
  if (turn === null) return null
  let writes = 0
  for (let i = log.length - 1; i >= floor; i -= 1) {
    const ev = log[i]
    if (ev?.type === 'turn/start') break
    if (ev?.type === 'tool/call' && WRITE_TOOLS.has(ev.data?.name)) writes += 1
  }
  if (writes === 0) return null
  let mtime = 0
  try {
    mtime = statSync(file).mtimeMs
  } catch {
    return null
  }
  if (turnTime > 0 && mtime >= turnTime) return null
  return { turn, writes, minutes: Math.max(1, Math.round((now - mtime) / 60000)), mtime }
}

/** 提醒文案。刻意短 —— 它跟着 plan 每轮注入，长了就是噪音。 */
export function staleLead({ writes, minutes }) {
  return `⚠️ 本轮你调了 ${writes} 次写类工具，但本会话的 plan 文件最后一次更新在 ${minutes} 分钟前。`
    + '收尾前把做完的挪进「## 已完成」、再写新的「## 下一步」—— 界面上那个任务列表读的就是它，'
    + '不更新就会一直停在旧状态。'
}


export function todosOf(text, { maxCompleted = 5 } = {}) {
  if (typeof text !== 'string' || text === '') return null
  const done = sectionItems(text, /^##\s*已完成/)
  const next = sectionItems(text, /^##\s*下一步/)
  if (done.length === 0 && next.length === 0) return null
  const out = []
  // 已完成 → completed（只取最近 maxCompleted 条，太久远的会让 TodoPanel 变成滚动日志）
  for (const item of done.slice(-maxCompleted)) out.push({ content: item, status: 'completed' })
  // 下一步 → 第一条 in_progress，其余 pending
  next.forEach((item, i) => out.push({ content: item, status: i === 0 ? 'in_progress' : 'pending' }))
  return out.length > 0 ? out : null
}

/**
 * 抽某个 `## xxx` 段下的列表条目。
 * 认 `1. ` / `2) ` / `- ` / `* ` 四种写法，剥掉 checklist 的 `[ ]`/`[x]` 和 markdown 强调符
 * （TodoPanel 是纯文本渲染，留着 `**` 只会显示成星号）。
 */
export function sectionItems(text, heading) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => heading.test(line))
  if (start < 0) return []
  let end = start + 1
  while (end < lines.length && !/^##\s/.test(lines[end])) end += 1
  const items = []
  for (let i = start + 1; i < end; i += 1) {
    const m = /^\s*(?:\d+[.)]|[-*])\s+(.*\S)\s*$/.exec(lines[i])
    if (m === null) continue
    const cleaned = m[1]
      .replace(/^\[[ xX]\]\s*/, '')       // checklist 标记
      .replace(/\*\*/g, '')               // 加粗
      .replace(/`([^`]*)`/g, '$1')        // 行内代码
      .trim()
    if (cleaned !== '') items.push(cleaned)
  }
  return items
}

/**
 * 条目 → TodoItem[]。
 *
 * dsh 的 `todo_write` 校验（`dsh-tool-todo/lib/index.js` 的 toTodoList）要求：
 *   content 非空、**互不重复**、且除非 allowParallelInProgress 否则**最多一个 in_progress**。
 * 这里自己先满足这些约束 —— 我们是直接 append 事件，根本不经过那道校验，没人兜底：
 *   - 重复内容直接丢弃（plan 里偶尔会有两条字面相同的条目）
 *   - 第一条标 in_progress（表示当前在推进它），其余 pending
 *   - 单条超长截断到 160 字符，最多 12 条（TodoPanel 不是滚动容器）
 */
export function toTodos(items, { max = 12, maxLen = 160 } = {}) {
  const out = []
  const seen = new Set()
  let active = 0
  for (const item of items) {
    const raw = typeof item === 'string' ? item : item?.content
    const status = typeof item === 'string' ? (out.length === 0 ? 'in_progress' : 'pending') : item.status
    if (typeof raw !== 'string' || raw === '') continue
    const content = raw.length > maxLen ? `${raw.slice(0, maxLen - 1)}…` : raw
    if (seen.has(content)) continue
    // 最多一个 in_progress：多出来的降级为 pending（dsh 的 todo_write 也是这个约束，
    // 我们是直接 append 事件、绕过那道校验，所以必须自己保证）
    const finalStatus = status === 'in_progress' ? (active === 0 ? (active += 1, 'in_progress') : 'pending') : status
    seen.add(content)
    out.push({ content, status: finalStatus })
    if (out.length >= max) break
  }
  return out
}

export function headLines(text, n) {
  const lines = text.split(/\r?\n/)
  return lines.slice(0, n).join('\n')
}

/**
 * 可验证包裹（照抄 pwf 的形状）。
 *   sha256 = **全文**摘要（不是 head 的），配合 truncated 标志，模型才能判断
 *   「我手上这份是不是权威版本」—— 如果是 truncated，它可以自己 read 全文。
 */
export function frame({ file, text, shown, headCount, totalLines, overByteLimit = false }) {
  const digest = createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
  const truncated = shown !== text
  return [
    `===BEGIN-PLAN-DATA file=${file} bytes=${Buffer.byteLength(text, 'utf8')} ` +
      `lines=${totalLines} head=${headCount} sha256=${digest} truncated=${truncated ? 'yes' : 'no'}===`,
    shown,
    '===END-PLAN-DATA===',
    truncated
      ? `（上面是前 ${headCount} 行 / 共 ${totalLines} 行${overByteLimit ? '，且已按字节上限再裁' : ''}；` +
        '要看全文自己 read 这个文件，不要凭这截断段猜测后面的内容。）'
      : '',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

/** 观测计数（自测与现场诊断用；每进程各持一份）。 */
export const stats = { injected: 0, pruned: 0, skipped: 0, created: 0, projected: 0 }

/** 拿会话 id：agent.session 的形状在版本间有差异，逐级兜底（集合了 stall-guard / compaction-epoch 两处的写法）。 */
export function sessionIdOf(agent) {
  const candidates = [
    agent?.session?.id,
    agent?.session?.header?.id,
    agent?.sessionId,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return null
}

/** 拿会话工作目录，同样逐级兜底。拿不到返回 undefined（模板里就不写这一行）。 */
export function cwdOf(agent) {
  const candidates = [
    agent?.session?.cwd,
    agent?.session?.header?.cwd,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return undefined
}

/**
 * 该 agent 的规划文件归属于谁。
 *
 * 默认 **'own'：每个会话各管各的，子 agent 也一样**（2026-10-28 用户拍板）。
 *
 * ⚠️ 'parent' 分支在本机**实测从未生效**：它依赖 `agent?.isSubagent === true`，
 * 而该字段在这个 dsh 版本里恒为 `undefined`（同一坑已记在 concurrency-discipline.mjs:82，
 * 那里 `skipSubagents` 也因此从来没生效过）。所以即使配置写 'parent'，实际行为也是 'own'。
 * 想真正实现 'parent'，得先找到真实存在的子 agent 判据字段；在那之前**不要把 'parent' 当默认**，
 * 配置与行为必须一致，否则就是配置在说谎。
 * 'none'（完全不给子 agent 注入）同样受这个坑影响。
 */
export function planOwnerId(agent, cfg) {
  const own = sessionIdOf(agent)
  if (own === null) return null
  const policy = cfg?.subagents ?? 'own'
  if (policy === 'none' && agent?.isSubagent === true) return null
  if (policy === 'own' || agent?.isSubagent !== true) return own
  const parent = agent?.session?.header?.parentSession ?? agent?.session?.parentSession
  return typeof parent === 'string' && parent !== '' ? parent : own
}

/** 会话首次建档时的那句引导 —— 只有建了档的那一步用它，后续步回落到常规 lead。 */
const LEAD_AUTOCREATED = '这个会话的规划文件刚建好（骨架在下面）。先把它填成你这个会话真正的目标与下一步，'
  + '再开始做事；这份骨架每步都会重注入，空着等于每步发一遍噪音。'

/** 只认自己的 source.kind，绝不误删别人的消息。 */
const isOwnMessage = (message) =>
  message !== null &&
  typeof message === 'object' &&
  message.source !== null &&
  typeof message.source === 'object' &&
  message.source.kind === name

/** 拼最终注入文本。<plan-anchor> 外层标签极短，内容主体是那份可验证包裹。 */
export function render(text, cfg, explicitFile, leadOverride) {
  const file = typeof explicitFile === 'string' && explicitFile !== '' ? explicitFile : planPath(cfg)
  const headCount = Number.isInteger(cfg.headLines) && cfg.headLines > 0 ? cfg.headLines : DEFAULT_HEAD_LINES
  const maxBytes = Number.isInteger(cfg.maxBytes) && cfg.maxBytes > 0 ? cfg.maxBytes : DEFAULT_MAX_BYTES
  const allLines = text.split(/\r?\n/).length
  let shown = headLines(text, headCount)
  let overByteLimit = false
  if (Buffer.byteLength(shown, 'utf8') > maxBytes) {
    // 字节上限兜底：按 code point 逐步回退，避免把多字节字符切坏。
    // overByteLimit 必须**在这里**定下来 —— 裁完之后 shown 必然 <= maxBytes，
    // 再拿它去比就永远算不出「这次是被字节上限裁的」（自测第一轮就是这样打红的），
    // 而这条信息恰恰是给模型看的：「后面的内容是行数截断，还是连字节都被砍了」。
    overByteLimit = true
    const chars = Array.from(shown)
    let cut = chars.length
    while (cut > 0 && Buffer.byteLength(chars.slice(0, cut).join(''), 'utf8') > maxBytes) cut -= 1
    shown = chars.slice(0, cut).join('')
  }
  const body = frame({ file, text, shown, headCount, totalLines: allLines, overByteLimit })
  const lead = typeof leadOverride === 'string' && leadOverride !== ''
    ? leadOverride
    : (typeof cfg.prefix === 'string' && cfg.prefix !== ''
      ? cfg.prefix
      : '当前计划（每步重注入；truncated=no 时以下就是全文）。用它决定下一步，做完一项就更新这个文件。')
  return `<plan-anchor>\n${lead}\n${body}\n</plan-anchor>`
}

export function apply(ctx, config) {
  const cfg = config && typeof config === 'object' ? config : {}
  if (cfg.enabled === false) return

  // { prepend: true }：与 thinking-anchor.mjs 同理 —— 抢最外层，让注入的消息落在最贴近采样点的位置。
  ctx.on(
    'agent/pre-step',
    async ({ agent }, next) => {
      const decision = await next()
      try {
        if (decision && decision.kind === 'reject') return decision
        const messages = Array.isArray(decision?.messages) ? decision.messages : null
        if (messages === null) return decision

        // ── per-session 规划文件（2026-10-28） ────────────────────────────────
        // 每个会话一个文件：$DSH_HOME/plans/<sessionId>.md，首次注入时自动建骨架。
        // 全局 PLAN.md 不再是注入源，降级为「跨会话长期档案」——会话内需要时自己 read。
        // agent.session.id 的形状在不同版本间有差异，逐级兜底（照抄 stall-guard 的做法）；
        // 拿不到 session id 时**回落到全局 PLAN.md**（fail-open），
        // 绝不因为拿不到 id 就让注入整个消失。
        let file = null
        let autoCreated = false
        if (cfg.perSession !== false) {
          const sessionId = planOwnerId(agent, cfg)
          if (sessionId !== null) {
            const before = readPlan(sessionPlanPath(cfg, sessionId) ?? '')
            file = ensureSessionPlan(cfg, { sessionId, cwd: cwdOf(agent) })
            autoCreated = before === null && file !== null
          }
        }
        // subagents:'none' 时 planOwnerId 返回 null 且 perSession 开着 ⇒ 明确不注入，
        // 不回落到全局 PLAN.md（那会把 root 的长期档案塞给每个子 agent）。
        if (file === null) {
          if (cfg.perSession !== false && cfg.subagents === 'none' && agent?.isSubagent === true) {
            stats.skipped += 1
            return decision
          }
          file = planPath(cfg)
        }

        // 每步现读（不缓存）。fail-closed：拿不到就不注入，而不是注入占位噪声。
        const text = readPlan(file)
        if (text === null) {
          stats.skipped += 1
          return decision
        }

        // ── 把「下一步」投影成 dsh 原生 todos（2026-10-29 用户拍板方案 B）──────────────
        // 为什么要有这段：plan 文件只有**模型**看得见（注入进上下文），用户在界面上什么都看不到。
        // dsh 自带 TodoPanel 读的是 session projection `todos`，唯一写入方式就是
        // `session.append('todo/write', { todos })` —— 公开 API，pre-step hook 的 agent 就带 session。
        // 所以直接把 plan 的「下一步」投影过去：**plan 是唯一事实源，todos 只是它的一个视图**，
        // 不维护第二份手写数据，也就不存在「两边漂移」这种失败模式。
        //
        // 去重靠读 session.log 的**最后一条事件**，而不是自己记 Map：
        // projection 在 `turn/start` 时把 todos 重置为 null（每轮开头 UI 会清空），
        // 所以「本轮已投过」的判据是「最后一条事件正是我们投的同一份 todos」。
        // 用 Map 记会跨 turn 永远跳过，UI 就一直空着。
        if (cfg.projectTodos !== false && typeof agent?.session?.append === 'function') {
          try {
            const items = todosOf(text)
            if (items !== null) {
              const todos = toTodos(items)
              const key = JSON.stringify(todos)
              // 从 log 尾部**向前扫**，而不是只看最后一条：
              // pre-step 的时候最后一条永远是上一步的响应事件，不是我们投的 todo/write。
              // 遇到 `turn/start` 就停 —— 它会把 projection 重置为 null，说明本轮还没投过；
              // 遇到自己的 `todo/write` 就比较内容。只扫尾部 200 条，避免长会话里 O(n)。
              const log = Array.isArray(agent.session.log) ? agent.session.log : null
              let covered = false
              if (log !== null) {
                const floor = Math.max(0, log.length - 200)
                for (let i = log.length - 1; i >= floor; i -= 1) {
                  const ev = log[i]
                  if (ev?.type === 'turn/start') break
                  if (ev?.type === 'todo/write') {
                    covered = JSON.stringify(ev.data?.todos) === key
                    break
                  }
                }
              }
              if (!covered) {
                agent.session.append('todo/write', { todos })
                stats.projected += 1
              }
            }
          } catch {
            // 投影失败绝不影响注入 —— 用户看不到列表是小事，丢掉 plan 是大事
          }
        }

        // 本轮干了活却没更新 plan ⇒ 把 lead 换成提醒（**每轮最多一次**）。
        // 社区依据：planning-with-files v3 的 PostToolUse nudge 明确 'once per turn'；
        // 它踩过的坑是把提醒发成 systemMessage（只给用户看），模型收不到 —— 这里走注入通道。
        let stale = null
        if (cfg.staleHint !== false) {
          try {
            const info = staleHint({ log: agent?.session?.log, file })
            if (info !== null) {
              const owner = planOwnerId(agent, cfg) ?? file
              if (staleSeen.get(owner) !== info.turn) {
                staleSeen.set(owner, info.turn)
                stale = info
              }
            }
          } catch {
            // 检测失败就当没陈旧 —— 绝不因为提醒机制影响注入
          }
        }

        const lead = stale !== null
          ? staleLead(stale) + '\n'
          : (autoCreated ? LEAD_AUTOCREATED : undefined)
        const payload = render(text, cfg, file, lead)

        // plan-anchor v2: skip identical.
        // 本插件每步都会「删掉历史里上一条自己的消息 + 在尾部追加新的」。那条旧消息
        // 位于**历史中间**，删它会让从该位置往后的消息序列整体错位 —— prefix cache
        // 从此处全部失效。绝大多数步 PLAN.md 根本没变，却仍在付这笔钱。
        // 因此：只有确认历史里已有一条**逐字节相同**的副本时才跳过（一条都不动），
        // 拿不准（找不到自己的消息 / 内容不同）时一律照旧删除+重投，绝不赌。
        // stats.skipped 会记下跳过的步数，可直接观测省了多少次注入。
        try {
          if (cfg.skipIdentical !== false) {
            const mine = messages.filter(isOwnMessage)
            const last = mine.length > 0 ? mine[mine.length - 1] : null
            if (last !== null) {
              const covered =
                (typeof last.text === 'string' && last.text === payload) ||
                (Array.isArray(last.content) &&
                  last.content.length > 0 &&
                  last.content[0] !== null &&
                  typeof last.content[0] === 'object' &&
                  last.content[0].text === payload)
              if (covered) {
                stats.skipped += 1
                return decision
              }
            }
          }
        } catch {
          // 任何异常一律走原路（删除+重投），绝不因为优化而漏注入
        }
        const kept = cfg.pruneHistory === false ? messages : messages.filter((m) => !isOwnMessage(m))
        stats.injected += 1
        stats.pruned += messages.length - kept.length
        return {
          ...decision,
          messages: [
            ...kept,
            {
              id: randomUUID(),
              role: 'user',
              content: [{ type: 'text', text: payload }],
              source: { kind: name, form: 'snapshot', sections: [{ name, text: payload }] },
            },
          ],
        }
      } catch {
        // 注入失败绝不能吃掉用户上下文 —— 原样放行
        stats.skipped += 1
        return decision
      }
    },
    { prepend: true },
  )
}
