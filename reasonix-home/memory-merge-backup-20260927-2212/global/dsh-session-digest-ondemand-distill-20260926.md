---
id: mem-276d0f0f5dea7521b111b21fc038d368
revision: 1
created_at: "2026-09-26T15:31:46.933Z"
updated_at: "2026-09-26T15:31:46.933Z"
name: dsh-session-digest-ondemand-distill-20260926
description: "dsh session_digest 上线（按需蒸馏会话：任务/轮次/工具调用/结论），并记录「为何不做无条件自动蒸馏」的设计判断"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh session_digest 上线 + 关于「自动蒸馏」的设计判断（2026-09-26）

## 一、判断：不做「无条件自动蒸馏」，改做「按需蒸馏」

Codex 的 `memories.stage1_outputs` 是**自动**的（后台 jobs 把每个 rollout 压成 `raw_memory` + `rollout_summary`）。dsh 侧我**刻意没照抄自动触发**，理由：

1. 无条件把每个会话压成 fact，会产生大量低质量 fact，**污染记忆语料**（本机已有 800+ 会话，其中 640 个是批量任务的重复模板）
2. 用户整套 preset 的哲学是**按需拉取**（`skill-search.mjs` 的注释：9KB 常驻目录注入 → 0/9 anchored vs 81% 无注入）
3. 记忆注入在 dsh 是 **append-only**，自动写入一旦变多会永久累积

所以 dsh 侧的组合是：**按需蒸馏（读取）+ 显式写入（存档）** —— 能力等价，触发方式不同。

## 二、本轮上线：`session_digest`

- 文件：`~/.dsh/.agent-presets/anchored-standard/session-index.mjs`（与 session_index 同插件，共 2 个工具）
- 工具：`session_digest({id, maxChars})` —— 把某个会话压成结构化摘要
- 输出：session id / cwd / preset / 最后写入时间 / 大小 / 帧数 / **turns / tool calls / errors** / 任务（首条 user 消息）/ 结论（最后一条 assistant 回复）
- 实现：逐帧解压 zstd（每帧只解一次），统计用正则计数（`"type":"tool/result"`、`"isError":true`、`"turn":N`），结论取尾部 8 帧
- 只读；id 支持精确、前缀匹配；省略 id 则取最近修改的会话

## 三、实测

| 会话 | 规模 | 耗时 | 提取结果 |
|---|---|---|---|
| `session-a0d5fbf8`（当前会话） | 1074K / 389 帧 | 197ms | 7 turns / 152 tool calls / 7 errors |
| `session-30e34c4f`（批量审计） | 426K / 139 帧 | 143ms | 1 turn / 50 tool calls；**结论 = `DONE 1.5a2 4721`** |

批量任务会话的**完成状态一眼可见**（结论就是 "DONE xxx" 那种一行回复）。

## 四、Codex 对标进度（更新）

| # | Codex 能力 | 状态 |
|---|---|---|
| 1 | `memories` 蒸馏记忆 | ✅ 能力齐备（**按需**替代自动；显式写入 + session_digest + 画像加权） |
| 2 | `threads` 统一索引 | ✅ session_index（827 会话 / 813ms / title 覆盖 99%） |
| 3 | `goals` 带 budget/usage | ❌ 下一个建议目标 |
| 4 | `agent_jobs` CSV 批处理 | ❌ |
| 5 | `thread_spawn_edges` | ❌（实测 delegationDepth 全 0，dsh 当前没在用子会话） |
| 6 | `remote_control` | ❌ |
| 7 | `computer-use` | ❌ |
| 8 | `thread_dynamic_tools` | ⛔ 架构上做不到 |

## 五、生效

新会话生效（preset 在会话创建时加载）。`session-index.mjs` 已在 preset 里，本轮只扩展了内容，无需改 `cordis.patch.yml`。
