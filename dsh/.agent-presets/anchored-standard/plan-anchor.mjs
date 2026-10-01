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
 * 注入形状（与 thinking-anchor.mjs / git-context.mjs 同构）
 *   { id, role: 'user', content: [{type:'text', text}], source: { kind, form:'snapshot', sections:[…] } }
 *   id 必填 —— 缺失会让 session validator 报 `session event at seq N lacks an identified message`。
 *
 * 与 thinking-anchor.mjs 的关系
 *   两者都挂在 `agent/pre-step` 且都用了 `{ prepend: true }`。谁后 unshift 谁在外层（改写更靠后）。
 *   顺序由 cordis.yml 里的注册先后决定，见 contexts 的记账。
 */

import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'plan-anchor'
export const inject = []

/** 默认 plan 文件：放在 DSH_HOME 根，跨项目共用一份（用户的主战场是 ~/.dsh 本身）。 */
const DEFAULT_PLAN_FILE = 'PLAN.md'
/** 默认只给前 30 行 —— 对齐 pwf 的 `head -30` 剂量。 */
const DEFAULT_HEAD_LINES = 30
/** 单次注入的硬上限（字节），防止一个巨型 plan 把上下文吃掉。 */
const DEFAULT_MAX_BYTES = 8000

export const dshHome = () => process.env.DSH_HOME ?? join(homedir(), '.dsh')

/** plan 文件路径：cfg.path 优先，否则 $DSH_HOME/PLAN.md。 */
export const planPath = (cfg) =>
  typeof cfg?.path === 'string' && cfg.path !== '' ? cfg.path : join(dshHome(), DEFAULT_PLAN_FILE)

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
export const stats = { injected: 0, pruned: 0, skipped: 0 }

/** 只认自己的 source.kind，绝不误删别人的消息。 */
const isOwnMessage = (message) =>
  message !== null &&
  typeof message === 'object' &&
  message.source !== null &&
  typeof message.source === 'object' &&
  message.source.kind === name

/** 拼最终注入文本。<plan-anchor> 外层标签极短，内容主体是那份可验证包裹。 */
export function render(text, cfg) {
  const file = planPath(cfg)
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
  const lead = typeof cfg.prefix === 'string' && cfg.prefix !== ''
    ? cfg.prefix
    : '当前计划（每步重注入；truncated=no 时以下就是全文）。用它决定下一步，做完一项就更新这个文件。'
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

        // 每步现读（不缓存）。fail-closed：拿不到就不注入，而不是注入占位噪声。
        const file = planPath(cfg)
        const text = readPlan(file)
        if (text === null) {
          stats.skipped += 1
          return decision
        }

        const payload = render(text, cfg)
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
