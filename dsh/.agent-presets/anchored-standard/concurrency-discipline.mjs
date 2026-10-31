/**
 * concurrency-discipline — 每 N 步注入一小段「子 agent 并发使用纪律」。
 *
 * WHY: dsh 的两道并发闸门（`agent-loop.maxParallelToolCalls: 100` 与
 * `subagent.maxActiveSubagents: 32`）放开之后，模型容易走向两个极端：
 *   ① 不敢并发（只发 1-2 个，浪费已放开的容量）
 *   ② 无脑并发（32 个重型任务一起上，构建互踩、写同一文件、撞 gateway 限流）
 * 本插件把「什么能并发多少」写成一条短提示，按冷却步数周期性注入。
 *
 * 判据来源（社区实测，写进提示里让模型可核对）：
 *  - 早先抄自 zhu1090093659/dsh-web commit ddc8f1a 的「重型实施并发 ≤ 3」已作废（2026-10-29）：
 *    那是**别人的机器 + GUI 响应**的实测，不是本机数据。本机 32 逻辑核实测拐点是 4 路，
 *    劣化主因是 >8 路后溢出到 E-core（单线程慢 2.8 倍），详见下面 TEXT 里的数据。
 *  - 只读/轻量任务不受此限：本机 6 路 subagent 并发 12.7s 全部完成、tool-calls 时间戳严重重叠，
 *    瓶颈在 provider 不在本机 —— 详见同目录的实测记录。
 *  - sandbaseai handbook subagent-scale-oom：480 agents → Heap OOM；1000 ≈ 4 GB V8 heap 致命。
 *  - 翻译工程交接文档 §4 坑 #11：多 worker 并发写同一文件会静默覆盖（MacKay p161-180 真实发生过）。
 *
 * 注入形态与 plan-anchor 一致：一条 user/message，source.kind = name。
 * 冷却由 state 记录，默认每 12 步一次；内容恒定 ⇒ 与上一条逐字节相同就跳过，
 * 避免无谓的 prefix cache 失效。
 */
import { randomUUID } from 'node:crypto'

export const name = 'concurrency-discipline'
export const inject = []

const DEFAULTS = {
  enabled: true,
  // 每多少步注入一次
  cooldownSteps: 12,
  // 首次注入前要等多少步（避免开局就塞）
  firstAfterSteps: 3,
  // 只在非子 agent 会话里注入（子 agent 不需要这份纪律，省 token）
  skipSubagents: true,
}

const TEXT = `[concurrency-discipline] 子 agent 并发的容量与纪律（本机实测，不是建议）：

容量：\`subagent.maxActiveSubagents = 32\`（默认 8，已放开）、\`agent-loop.maxParallelToolCalls = 100\`。
两道闸门相互独立：前者限制「同时活着的子 agent 数」，后者限制「一条消息里能并行发几个工具调用」。

按任务类型定并发，不要一刀切：
- 轻量只读（读文件 / grep / 查文档 / 翻一小段）→ 可以真正并发到 32。
- 重型实施（装包 / 构建 / 跑测试 / tsc / vitest）→ **4 路是拐点**（本机实测，2026-10-29）。
  32 逻辑核（0-15 P-core / 16-31 E-core）下的净计算时间：1 路 410ms、4 路 462ms(+13%)、
  8 路 684ms(+67%)、16 路 1126ms(+175%)。>8 路溢出到 E-core，而 E-core 单线程慢 2.8 倍
  （570 vs 205ms），墙钟由最慢的 E-core 决定。**不是 GUI 卡顿，是核调度。**
- 写文件：**同一路径绝不允许两个 worker 同时写**，会静默覆盖（已发生过）。要么一个路径只派一个 worker，要么先分区再派。

派发时的 prompt 必须显式禁止三件事，否则子 agent 会自行发挥：
1. 不准调用 \`subagent\` / \`subagent_fork\` / \`workflow\`（禁止二次派发）
2. 不准加载任何 skill
3. 只准调用指定的那一个工具、只准返回指定格式

**timeout 纪律（2026-10-29 修好）**：\`bash\` 工具**有 \`timeout\` 参数（秒）**，优先级高于插件的兜底上限 \`timeoutMs\`（现配 300000）。
挂了整整一年的 bug 已修：\`custom-bash.mjs\` 里 \`timeoutMs\` 只被读进变量、**从未使用**，
所以以前**根本没有超时**，命令能无限挂住。现在到点 abort 整个进程树。
用法：**可能 >60s 或可能挂住**的命令传 \`timeout\`：
- \`{"command": "dsh --dump-config", "timeout": 30}\`、\`{"command": "pnpm install", "timeout": 180}\`
- N ≈ 预期耗时的 3 倍；**不要给 5 秒**，会误杀正常慢命令
- 可能挂住的（等 stdin / 网络 / ssh / 交互式）**一定要传** —— 不传就等满 300s 兜底
- 纯读文件 / grep / 短命令**不用传**，兜底 300s 足够

派完必须能回答「怎么证明它们真的并行了」——看 \`logs/tool-calls.jsonl\` 的时间戳重叠度，或 \`list_agents\` 的 depth=1 数量。`

export const stats = { injected: 0, skipped: 0 }

const state = new Map()

function keyOf(sessionId) {
  return String(sessionId?.id ?? sessionId ?? 'unknown')
}

function isOwnMessage(m) {
  const k = m?.source?.kind
  return k === name
}

export function apply(ctx, config) {
  const cfg = { ...DEFAULTS, ...(config?.concurrencyDiscipline ?? {}) }
  if (cfg.enabled === false) return
  const cooldown = Math.max(1, Number(cfg.cooldownSteps) || 12)
  const firstAfter = Math.max(0, Number(cfg.firstAfterSteps) || 3)

  // ⚠ 2026-10-28 修复（严重）：本 handler 原写成 `async (decision, sessionId, agent)`
  // 且**从不调用 next()**。在 cordis 的 waterfall 语义下这是致命的（cordis/lib/index.js:317-325
  // 原文："a listener that does not call `next()` vetoes the rest of the chain,
  // including the built-in behavior"）：
  //   - waterfall 的 listener 签名是 `(payload, next)`，payload =
  //     { messages, turn, step, signal, agent } —— agent 由 agentEvents 的 fused() 注入。
  //   - 本行用 prepend:true 抢到最外层后，不调 next() 就把内层全部裁掉。
  // 实测后果：root session 里 plan-anchor / thinking-anchor / git-context /
  // context-gate / runtime-context 全部消失，只剩本行自己的注入
  // （session-3315a426：plan=0 think=0 git=0 conc=10）。
  // 第二个 bug：第二个形参拿到的是 next 函数而不是 sessionId，第三个是
  // undefined ⇒ `agent?.isSubagent` 恒为 undefined ⇒ skipSubagents 从来没生效过。
  // 修法：回归 waterfall 契约 —— 先 await next() 拿内层结果，再决定改不改。
  ctx.on(
    'agent/pre-step',
    async (payload, next) => {
      const decision = await next()
      try {
        if (decision !== null && typeof decision === 'object' && decision.kind === 'reject') return decision
        const agent = payload?.agent
        if (cfg.skipSubagents && agent?.isSubagent === true) return decision
        const key = keyOf(agent?.session ?? payload?.sessionId)
        let s = state.get(key)
        if (s === undefined) {
          s = { steps: 0, cooldownLeft: firstAfter }
          state.set(key, s)
        }
        s.steps += 1
        if (s.cooldownLeft > 0) {
          s.cooldownLeft -= 1
          return decision
        }
        const messages = decision.messages ?? []
        // 与上一条自己的消息逐字节相同就跳过（避免无谓的 prefix cache 失效）
        const mine = messages.filter(isOwnMessage)
        const last = mine.length > 0 ? mine[mine.length - 1] : null
        if (last !== null) {
          const covered =
            (typeof last.text === 'string' && last.text === TEXT) ||
            (Array.isArray(last.content) &&
              last.content.length > 0 &&
              last.content[0] !== null &&
              typeof last.content[0] === 'object' &&
              last.content[0].text === TEXT)
          if (covered) {
            s.cooldownLeft = cooldown
            stats.skipped += 1
            return decision
          }
        }
        const kept = messages.filter((m) => !isOwnMessage(m))
        s.cooldownLeft = cooldown
        stats.injected += 1
        return {
          ...decision,
          messages: [
            ...kept,
            {
              id: randomUUID(),
              role: 'user',
              content: [{ type: 'text', text: TEXT }],
              source: { kind: name, form: 'snapshot', sections: [{ name, text: TEXT }] },
            },
          ],
        }
      } catch {
        stats.skipped += 1
        return decision
      }
    },
    { prepend: true },
  )
}
