/**
 * session-age-warn —— 会话水位提醒。
 *
 * 为什么需要它（2026-10-28 用户拍板「会话水位提醒」）
 *   社区实测（dsh-degeneration-kit，493 个会话日志）：24 个真退化块里 **18 个回合正常结束**，
 *   只在思考里烂 —— 退化不是「突然坏了」，是长会话里历史被无关内容稀释之后慢慢发生的。
 *   [社区 FAQ](https://dsh-ai.com/faq/762/) 的结论一致：「长会话出现空转时及时新建会话，
 *   避免退化思考反复回传累积」。
 *   另一篇复盘（eogee.com/article/172）：一轮 4927 行思考里 98.6% 是重复，「执行。」出现
 *   1254 次，模型反复说停止却一次没停，最后靠 max_tokens 硬掐断。
 *
 *   ⇒ 与其装一个「已经烂了之后才打断」的熔断器，不如在会话变长时提醒换会话。
 *   这正是 thinking-guard 保持 `enabled: false` 之后选的那条路线。
 *
 * 为什么不是自动 compaction / 退化块折叠
 *   - 自动 compaction 会压掉对话（用户踩过「上下文突然消失」的坑）。
 *   - 折叠历史里的 reasoning 要改 transcript，影响 prefix cache 与会话一致性，风险最高。
 *   本插件只**注入一句话**，不动任何历史。
 *
 * 与 concurrency-discipline 的区别（别混淆）
 *   那个按**步数**周期性下发固定纪律文本；本插件按**会话累计长度**在越线时提醒一次，
 *   而且提醒本身要足够稀疏 —— 它同样落在 transcript 尾部，会破坏 prefix cache。
 *   所以默认：200 步后才第一次提醒，之后每 80 步最多再提醒一次。
 *
 * 契约（踩过的坑写在这里，别重犯）
 *   `agent/pre-step` 是 cordis 的 **waterfall**：listener 签名必须是 `(payload, next)`，
 *   而且**必须 `await next()`**。不调 next() 的 listener 会否决内层整条链
 *   （cordis/lib/index.js:317-325 原文：a listener that does not call `next()` vetoes
 *   the rest of the chain）—— concurrency-discipline 就是这么把 plan-anchor /
 *   thinking-anchor / git-context 全吃掉的（2026-10-28 事故）。
 */

import { randomUUID } from 'node:crypto'

export const name = 'session-age-warn'
export const inject = []

const DEFAULTS = {
  enabled: true,
  /** 累计到多少步之后才第一次提醒。默认 200（实测本机一个下午的深任务约 250 步）。 */
  softSteps: 200,
  /** 首次提醒之后，每多少步最多再提醒一次。 */
  reWarnEvery: 80,
  /** 子 agent 不提醒：它的任务本来就短，而且提醒会挤占它的上下文。 */
  skipSubagents: true,
}

export const stats = { warned: 0, skipped: 0 }

/** 每进程一份，按 session 计数。重启即丢 —— 重启通常意味着换会话，可接受。 */
const state = new Map()

const isOwnMessage = (m) => m?.source?.kind === name

function buildText(steps) {
  return [
    `[session-age] 本会话已累计 ${steps} 步。`,
    '长会话的典型失败模式不是"不会做"，而是历史里的无关内容把当前目标稀释掉，',
    '然后思考开始在原地打转（实测：24 个退化块里 18 个回合看起来是正常结束的）。',
    '',
    '建议按这个顺序收口：',
    '1. 把当前进展写进本会话的 plans/<session-id>.md 的「已完成」段；',
    '2. 在「下一步」只留下真正要做的 1-3 条；',
    '3. 然后开新会话继续 —— 新会话会自动拿到这份规划，不继承这里的无关历史。',
    '',
    '如果这个任务还剩很多步，那就忽略本条，继续做（本提醒不会每步都出现）。',
  ].join('\n')
}

export function apply(ctx, config) {
  const cfg = { ...DEFAULTS, ...(config?.sessionAgeWarn ?? config ?? {}) }
  if (cfg.enabled === false) return
  const soft = Math.max(1, Number(cfg.softSteps) || DEFAULTS.softSteps)
  const reWarn = Math.max(1, Number(cfg.reWarnEvery) || DEFAULTS.reWarnEvery)

  // { prepend: true }：抢最外层，让提醒落在决策链的最外侧（与 plan-anchor 同待遇）。
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    try {
      if (decision !== null && typeof decision === 'object' && decision.kind === 'reject') return decision
      const agent = payload?.agent
      if (cfg.skipSubagents && agent?.isSubagent === true) return decision
      const sid = agent?.session?.id
      if (typeof sid !== 'string' || sid === '') return decision

      let s = state.get(sid)
      if (s === undefined) {
        s = { steps: 0, lastWarnAt: 0 }
        state.set(sid, s)
      }
      s.steps += 1
      if (s.steps < soft) return decision
      if (s.steps - s.lastWarnAt < reWarn) return decision

      const messages = Array.isArray(decision?.messages) ? decision.messages : null
      if (messages === null) return decision

      const text = buildText(s.steps)
      // 历史里已有逐字节相同的副本就只更新水位，不重复插入（省 prefix cache）
      const last = [...messages].reverse().find(isOwnMessage)
      if (last !== undefined) {
        const covered = Array.isArray(last.content) && last.content[0]?.text === text
        if (covered) {
          s.lastWarnAt = s.steps
          stats.skipped += 1
          return decision
        }
      }
      s.lastWarnAt = s.steps
      stats.warned += 1
      return {
        ...decision,
        messages: [
          ...messages.filter((m) => !isOwnMessage(m)),
          {
            id: randomUUID(),
            role: 'user',
            content: [{ type: 'text', text }],
            source: { kind: name, form: 'notice', sections: [{ name, text }] },
          },
        ],
      }
    } catch {
      // 提醒失败绝不能影响正常流程
      stats.skipped += 1
      return decision
    }
  }, { prepend: true })
}
