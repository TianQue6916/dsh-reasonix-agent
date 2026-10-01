---
id: mem-44740692744ad1fe62777a5982fd8878
revision: 1
created_at: "2026-09-20T01:43:43.4518797Z"
updated_at: "2026-09-20T01:43:43.4518797Z"
name: tool-dsh-stream-interrupt-retry-20260920
title: dsh 流式中断与重试（2026-09-20）
description: 'dsh 流式中断（TRANSPORT / Stream ended without finish_reason）的调查与处置：两档重试策略（normal 8 次 vs always 无上限）、-AlwaysRetry 开关落地与验证、上游 issue #1263/#2143/#373/#978 与修复 commit 7e95a00、headless 无 resume 的硬限制、超长单次生成两次对照实测'
activation: relevant
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh 流式中断与重试（2026-09-20 调查 + 两档并存落地）

## 现象
长输出任务中途断：会话事件 `llm/retry`，`failure = {"message":"Stream ended without finish_reason","code":"TRANSPORT"}`，随后 `llm/retry-started`。

## 重试机制（@deepseek-ai/dsh-llm-retry 执行；策略归 provider 的 retryPolicy 所有）
- `mode: normal`（默认）：可重试码 EMPTY_RESPONSE / RATE_LIMIT / SERVER / TIMEOUT / **TRANSPORT**；默认 maxRetries=5（实测 policyKey `["normal",5,[...],500,10000,0.1]` 与官方文档一致）；退避 500ms→10s、+10% 抖动。
- `mode: always`：**无尝试上限**，重试到成功/取消/插件卸载；连确定性错误也重试。
- **不可重试**：CONTEXT_WINDOW_EXCEEDED / QUOTA / INVALID_CREDENTIAL / MISSING_CREDENTIAL / NO_ADAPTER / DUPLICATE_ADAPTER / INVALID_MODEL_INFO。
- 关键语义（官方文档 llm-routing）：重试**重建同一显式请求、在同一份持久历史里重跑失败步骤**，“失败的部分 chunk 永不进入派生消息”。
- 配置位置：provider 里嵌 `retryPolicy:`。**旧式扁平字段 maxRetries / maxRetryDelayMs 写在 provider 顶层会被 pi-ai 拒绝启动**。

## 本机落地（两套并存，用户 2026-09-20 拍板）
- 全局 `~/.dsh/settings.yaml`（commandcode-goat）：`retryPolicy: {mode: normal, maxRetries: 8, backoff: {initialDelayMs: 1000, maxDelayMs: 30000, jitterRatio: 0.2}}`（备份 settings.yaml.bak-20260920-retry）
- 新增开关 `dsh-gate-conc.ps1 -AlwaysRetry`：生成独立 settings 副本时改写该段的 `mode` 为 `always`（只碰 retryPolicy 段）；异步经 `job-<id>.json` 的 `alwaysRetry` 字段透传给 `dsh-gate-runner.ps1`（runner 已改四分支显式调用）。验证：runner 日志打印 `alwaysRetry=True`、副本内 `mode: always`、任务 4s 正常完成。失败时 exit 5 不静默。
- 脚本备份：`dsh-gate-conc.ps1.bak-20260920-retry`、`dsh-gate-runner.ps1.bak-20260920-retry`。
- ⚠️ always 会对确定性错误（400/参数错/模型不存在）无限重试并持续计费 —— 只在盯着时用。

## 上游 GitHub（deepseek-ai/deepseek-harness，discussions）
| 编号 | 现象 | 状态 |
|---|---|---|
| #1263 / #2143 | max-tokens 截断 + **tool call 在飞行** → assistant/message 与 pi-ai replayState 块数不一致 → 下一轮 `INVALID_REPLAY_STATE`，**会话永久不可继续**（官方 UI 提示的 “Send 'continue'” 反而直接失败） | 已由 **commit 7e95a00** 修复 |
| #373 | 流干净 EOF 无 terminal finish → 被当成功提交，绕过重试、污染历史 | 同类缺陷另一分支 |
| #978 | tool call 成功后的那一轮 LLM 请求必 TRANSPORT（headless 5/5 失败，web 1/1 成功） | 同码不同触发 |
| #4341 | pi-ai 把 WebSocket 失败压成文本、分类器漏词 → 落 PI_AI_ERROR 不进重试 | 修复提案 |

**commit 7e95a00 已包含在 0.1.5**（本地验证）：写入侧 version-2 ReplayEnvelope（`readReplayState` 要求 `kind==="pi-ai"` + `version===2`）；读侧 `toPiAssistant(message, onDegrade)` 不可用时 `onDegrade?.(...)` + `foreignAssistant(message)` **降级重建**而非抛错。

## “发继续”到底行不行
- **web**：官方 UI 就这么引导恢复，会话可 resume ✓
- **headless**：**不支持 resume** —— 实测 `dsh --profile headless --resume <id>` → `error: unknown option '--resume'`（headless patch 只暴露 -h/--help；--resume 是 tui/web 侧 app 插件的参数）→ gate 的会话中断后**不能续写**，只能重跑或分块重发。

## 实测：超长单次生成不可靠（两次同规模对照，均失败但失败点不同）
| 次 | 配置 | 结果 |
|---|---|---|
| 1 | maxRetries=5 | TRANSPORT 中断 → llm/retry-started → 15 分钟无新事件，手动停进程 |
| 2 | maxRetries=8 | 连首个流事件都没回来，8 分钟无 assistant/attempt，手动停进程 |

→ 瓶颈是**流式传输时长/稳定性**，不是 maxTokens 也不是重试次数。长任务必须分块（≤ 18KB 规范）。对照：5000 汉字 ✓ 22.7KB；8000 汉字 ✓ 45.7KB。

## 收尾技巧
- `dsh-gate-conc.ps1` 没有 kill 参数：`Get-CimInstance Win32_Process | Where CommandLine -match 'dsh'` 找到 runner 与 node 两个 PID 后 Stop-Process（注意别误伤同时在跑的其它任务）。

## 技能
`dsh-mode` v1.3.0 第六节「输出上限」+「流式中断与重试」；`dsh-gate` v2.4.0 新增 `-AlwaysRetry` 小节。
