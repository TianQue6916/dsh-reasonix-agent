---
id: "b4a7aa94-d8f4-4494-817e-407d1112e249"
title: "DSH 注入链断裂根因（concurrency-discipline waterfall veto）与 per-session plan / todo_write 常驻改造：修复、证据与待重启验收"
description: "2026-10-28 定位并修复 anchored-standard 注入链断裂：concurrency-discipline.mjs 的 async handler 从不调用 next()，以 prepend:true 否决内层全部 waterfall，导致 root session 的 plan-anchor/thinking-anchor/git-context/context-gate/runtime-context 注入全灭（分界 16:01:33，session-5f807f79 起）；附带形参错位使 skipSubagents 从未生效。同轮把 plan-anchor 改成 per-session（$DSH_HOME/plans/&lt;session-id&gt;.md）、给 tool-bootstrap 加 RESIDENT_TASK_TOOLS=['todo_write']，并查明 thinking-guard 的 cancel kind 被 abortedCancelCause() 的 assertNever 打死（未修）。含进程优先级实测表、双 profile patch 注册证据、重启后验收清单与并发写冲突风险。承接 7ffee013（plan-anchor 全局 head 注入）与 c7fb1eaf（resident tool set 常驻化）。"
status: "active"
created_at: "2026-10-28T09:23:18.587Z"
updated_at: "2026-10-28T09:23:18.587Z"
content_hash: "2722edb618b4311837257cb506b3ff24a515c623da28a87c4b4c0b1ddd9c1291"
source_paths:
  - ".agent-presets/anchored-standard/concurrency-discipline.mjs"
  - ".agent-presets/anchored-standard/plan-anchor.mjs"
  - ".agent-presets/anchored-standard/tool-bootstrap.mjs"
  - "profiles/desktop/cordis.patch.yml"
  - "profiles/web/cordis.patch.yml"
session_ids:
  - "8a55b1e8-64c0-46af-99a5-223f389dfa80"
memory_body_ids:
  []
---

# DSH 注入链断裂与 resident tool set 调整（2026-10-28）

**状态**：代码全部落盘、`node --check` 通过；**尚未重启 dsh**。`.agent-presets/*.mjs` 不参与 HMR，所以下列修复在重启前不生效——当前 root session 仍在跑旧代码，`plan-anchor` / `thinking-anchor` / `git-context` / `context-gate` / `runtime-context` 依然不注入。

承接文档：`7ffee013-e0cd-425c-9209-1bce9cc84239`（plan-anchor 原始实现，全局 PLAN.md head 注入）、`c7fb1eaf-710f-4758-b8ab-b628d7e49746`（resident tool set 常驻化的先例与「必须重启」边界）。

## 1. 故障：root session 的系统注入整体消失

现象：某时刻之后新建的 session 里 `plan-anchor` / `thinking-anchor` / `git-context` / `context-gate` / `runtime-context` 五条注入全部不见，只剩 `concurrency-discipline` 自己那条 630 字提示（每 12 步刷一次）。

- 分界时间 **16:01:33**，从 `session-5f807f79` 开始；之前创建的 session 全部正常。
- subagent 反而正常——它挂在旧实例上，未受新代码影响。

## 2. 根因 A：waterfall handler 从不调用 `next()`

`concurrency-discipline.mjs` 注册 `agent/pre-step` 时写成：

```js
async (decision, sessionId, agent) => { /* ... */ }   // 错：形参对不上，且没有 next
```

而 cordis 的 waterfall 语义是「不调用 `next()` 即否决内层全部 handler」，该插件又用 `prepend: true` 抢在最外层 ⇒ 内层所有注入插件被整体吃掉。

**修复形态**：

```js
async (payload, next) => { const decision = await next(); /* ... */ }
```

本地 cordis 回归测试通过。

## 3. 根因 B（附带 bug）：形参错位使 `skipSubagents` 从未生效

旧签名把 `decision / sessionId / agent` 当形参，实际 payload 结构与配置里的 `skipSubagents` 判断对不上，导致该开关自上线起从未真正跳过 subagent。修 A 时一并对齐 payload 字段。

## 4. plan-anchor 改成 per-session

`plan-anchor.mjs` +185 行，行为变更：

- 注入目标从全局 `PLAN.md` 改为 `$DSH_HOME/plans/<session-id>.md`；
- 首次注入自动建骨架文件；
- 全局 `PLAN.md` 降级为「跨会话档案」，不再自动注入——这一条直接修正了 `7ffee013` 的设计前提（单文件必然所有 session 串内容）；
- 拿不到 session id 时回落全局文件；`../evil` 一类危险 id 被拒。

双 profile patch 注册（`profiles/desktop/cordis.patch.yml:187`、`profiles/web/cordis.patch.yml:169`）均为：

```yaml
- id: plan-anchor
  name: ../../.agent-presets/anchored-standard/plan-anchor.mjs
  config:
    enabled: true
    perSession: true
    subagents: parent
```

已验证两个 session 各自建档、内容互不串。

## 5. tool-bootstrap：`todo_write` 进 promoted keep-set

`todo_write` 一直挂着（`profiles/desktop/cordis.patch.yml:737`），但按 `tool-bootstrap.mjs` 头部注释的设计「read/write/edit/glob/grep/todo/ask 非常驻——bash + str_replace_editor 覆盖文件工作」，它必须先 `dev_tool_search` 解锁才可调用，所以会话里看不到任务面板。

新增：

```js
const RESIDENT_TASK_TOOLS = ['todo_write']
// promoted keep-set = bootstrapTools + RESIDENT_DISCOVERY_TOOLS
//                    + RESIDENT_MEMORY_TOOLS + RESIDENT_TASK_TOOLS
//                    + unlockedFor(session)
```

保留原设计约束：promoted 阶段**不**把整个 Standard catalog 灌进来（那是 post-promotion 行为回归的根因），只多一个 schema 的 token 代价。渲染侧为 `dsh-client-ui-chat` 会话内 todo 面板 + `better-sidebar` tasks tab，dsh 无桌面级悬浮窗。

## 6. thinking-guard：根因找到，未修

`agent.cancel({ kind: 'thinking-guard' })` 传的自定义 kind 被 `dsh-agent-loop` 的 `abortedCancelCause()` 用 `assertNever` 打死（源码只白名单 `user/parent/disposed/hook`）。后果：熔断确实触发，但「为什么被中断」的说明一条都没送到用户面前。

两条修法（待用户批准）：
1. 熔断时改传 `{ kind: 'hook', reason: 'thinking-guard' }`；
2. 给上游提 issue 扩展白名单。

## 7. 进程优先级：实测结论（不改）

i9-14900HX，32 逻辑核（0-15 P-core / 16-31 E-core），同一单线程 JS 负载：

| 配置 | 耗时 |
|---|---|
| Normal + 全核 | 206 ms |
| High + 全核 | 204 ms |
| Normal + P-core(0-15) | 205 ms |
| Normal + E-core(16-31) | **570 ms** |

判断标准：CPU 单核占用 <50% 或总体 <20% 时，调优先级对单线程 JS 无收益；优先级只解决多进程争抢。真正的 2.8 倍差异来自 P/E-core（调度器本来就把该负载放在 P-core：实测 CPU 0-15 忙度 40-64%，16-31 仅 4%；EcoQoS 全 off）。用户已确认不提优先级。

## 8. 并发写冲突风险

`profiles/desktop/cordis.patch.yml` 里出现非本会话添加的 `# hmr-trigger: 2026-10-28 17:08:23 … dsh-experimental-session-titles-bundle` 注释；`package.json` / `pnpm-lock.yaml` 也有他方改动，且有多个 session 在最近 10 分钟活动（`session-5975e549`、`session-3315a426` 等）。本轮改 patch 一律用精确替换、未整文件重写；若另一方整文件写入，`perSession/subagents` 两行可能被静默覆盖。

## 9. 重启后验收清单

1. 新建 session：五条注入（`plan-anchor` / `thinking-anchor` / `git-context` / `context-gate` / `runtime-context`）齐全；
2. `$DSH_HOME/plans/` 下出现 per-session 骨架文件，两 session 内容不互串；
3. promoted 阶段 `todo_write` 直接可调，todo 面板出现；
4. `concurrency-discipline` 提示恢复每 12 步一次、且不再吞掉内层注入；
5. subagent 路径：注入只走 `subagents: parent`，子 agent 不受影响。

## 10. 改动文件

`.agent-presets/anchored-standard/concurrency-discipline.mjs`（+20/-?）、`.agent-presets/anchored-standard/plan-anchor.mjs`（+185）、`.agent-presets/anchored-standard/tool-bootstrap.mjs`、`profiles/desktop/cordis.patch.yml`、`profiles/web/cordis.patch.yml`，另含 `.gitignore` 两行。autosave 提交 `2b6f1c8` 已包含前两项。

## 11. 未决（用户已挂起，勿重复追问）

- 学业层面「大三内容提前到大二」具体是哪些科目；
- 休学起止时间、期间主线、考研目标（宁夏大学 081200）是否仍成立；
- thinking-guard 是否按方案 1 动手修。
