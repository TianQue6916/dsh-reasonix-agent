---
id: "9cd9e6d8-d357-4ff4-84cd-332cebc040e3"
title: "agent/pre-step 注入“谁最贴采样点”：prepend 抢占规则修正与 7 个注入者审计（thinking-anchor 被挤走事故）"
description: "2026-10-28 在 ~/.dsh web profile 定位并修复「thinking-anchor 语言锚点被 plan-anchor 挤出采样点」的事故：prepend 与 push 混用导致链头由注册晚者决定，含 7 个 pre-step 注入者清单、统一规则「越早注册=消息越靠后」、切片重排脚本丢段的踩坑与守恒断言、以及仍待用户决策的两条修复路径。"
status: "active"
created_at: "2026-10-28T08:30:31.176Z"
updated_at: "2026-10-28T08:30:31.176Z"
content_hash: "4e6a18500ef79b106c7cd3b790944d77cc645431af4f2e7b1086a581a5c7c8a9"
source_paths:
  - ".agent-presets/anchored-standard/plan-anchor.mjs"
  - ".agent-presets/anchored-standard/thinking-anchor.mjs"
  - ".agent-presets/anchored-standard/context-gate.mjs"
  - ".agent-presets/anchored-standard/concurrency-discipline.mjs"
  - "profiles/web/cordis.patch.yml"
  - "PLAN.md"
session_ids:
  - "e5511823-333d-4f94-afc1-02e1d252bb65"
memory_body_ids:
  []
---

# 事故本体

语言锚点（`thinking-anchor`，把「思考链用中文」注入到生成点最尾部）没有生效，且不是偶发 —— 它是被同链上另一个插件挤走的。

根因不是 plan-anchor 单独写错，而是一条**从没被写下来的隐式规则**：`agent/pre-step` 的 listener 有两种插入方式（默认 `push` 与 `{ prepend: true }` 的 `unshift`），而插到数组 head 的 listener 在 after-next transform 的逆序执行中**最后**改写结果 —— 也就是消息落在**最贴近采样点**的位置。于是"谁贴采样点"实际上由「谁用了 prepend + 谁注册得晚来 unshift」决定，而不是由语义决定。

`plan-anchor.mjs` 当初的注释写着"与 thinking-anchor 同理，两者都用 `{ prepend: true }`"，但这个前提是**错的**：thinking-anchor 用的是默认 push。于是 plan-anchor 加了 prepend 之后反而抢到链头，把 thinking-anchor 顶离采样点，且因为它每一步都注入，问题是稳定可见的。

# 统一后的规则（本次唯一需要记住的一条）

> 越早注册 = 数组越靠 head = 最后改写 = 注入消息越靠后（越贴采样点）。
> 默认 `push` 下，注册顺序**本身**就是语义；`prepend` 会绕过这个语义。

因此 `prepend` 只应保留给明确要求"最外层"的角色，不应用来抢位置。目前 `context-gate` 是唯一合法的 prepend 使用者，它必须最外层才能保证不变量不被绕过 —— 这条不变量是选择"改 plan-anchor"而不是"给 thinking-anchor 也加 prepend"的决定性理由（后者会让锚点反超 gate 成为链头）。

# 全部 7 个 pre-step 注入者（审计表，含修复后状态）

| 插件 | 定位方式 | 注册行(patch) | 是否每步注入 |
|---|---|---|---|
| stall-guard | push | 109 | 条件触发 |
| context-gate | **prepend** | 146 | 不注入（只过滤，合法） |
| thinking-anchor | push | 172 | 每步 |
| concurrency-discipline | **prepend** | 182 | 条件触发 |
| plan-anchor | push（本次由 prepend 改） | 210 | 每步 |
| instruction-hint | **prepend** | 343 | 条件触发 |
| git-context | push | 529 | 每步 |

审计方法是 grep 三件套，对每个候选 `.mjs` 统计：`agent/pre-step` 注册次数、是否注入 `role: 'user'` 消息、`{ prepend: true }` 次数。只用"是否注入 user 消息"筛，会漏掉 context-gate 这类只过滤的插件（它 prepend 但无害）。

# 本次已落地的改动

1. `plan-anchor.mjs`：移除 `{ prepend: true }`；同时修正两处**已失效的注释**（第 51 行、第 161 行原本都以"thinking-anchor 也用了 prepend"为前提 —— 正是这个错误前提制造了 bug）。
2. `profiles/web/cordis.patch.yml`：把 plan-anchor 的注册段移出原位置并排在 thinking-anchor 之后，最终顺序为 `context-gate(146) → thinking-anchor(172) → concurrency-discipline(182) → plan-anchor(210)`；顺带修掉 concurrency-discipline 被夹在 plan-anchor 注释与注册行之间的结构性错位，并重写两段 anchor 注释使其与真实机制一致。
3. 验证：`dump-config` rc=0；`plan-anchor.mjs` 可加载（11 exports）；两个 anchor 各出现 1 次、注释标题无重复。

**未生效**：`.mjs` 不参与 HMR，必须 `systemctl --user restart dsh-web`（会断开当前会话，刷新页面即回）。

# 踩坑：切片重排脚本丢了整段注册块

第一版重排脚本按行号切分 patch 文本，**漏算了需要保留的一段，导致 thinking-anchor 的整个注册段被丢弃**（`- id:` 列表里消失），只是靠事后打印 id 列表才发现。回滚重做。

教训与做法：文本级重排必须带
- **切片守恒断言**（切出的行数总和 == 原文件行数，本例 1394 行）；
- **期望出现的 id 恰好 N 次**断言，而不是"至少 1 次"；
- 断言本身也要按"故意丢弃了哪些注释段"来算，否则会像本轮那样先误报一次 AssertionError。

# 仍待决策（未做）

`concurrency-discipline`（182）与 `instruction-hint`（343）也用了 prepend，后者注册得比 thinking-anchor 晚得多 —— 只要触发就 unshift 到更靠链头，同样能把锚点挤走。plan-anchor 只是眼下唯一**每步都注入**因而稳定可见的抢占者。可选路线：①只重启验证当前修复；②把这两处也改 push，规则收敛成一条（推荐方向）；③反向让 thinking-anchor 自己 prepend 并注册在最后一位。

# 相关

- 前序交接文档：`7ffee013-e0cd-425c-9209-1bce9cc84239`（plan-anchor 实现交接；其"使用 prepend"的设计前提已被本文修正，正文未改动）
