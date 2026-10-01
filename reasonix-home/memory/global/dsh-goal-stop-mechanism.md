---
id: mem-460d396dbb907776f586e4d27e383691
revision: 2
created_at: "2026-09-28T07:06:06.512Z"
updated_at: "2026-09-28T08:57:57.290Z"
name: dsh-goal-stop-mechanism
description: "dsh goal 自动续跑的 6 条停止路径、pause 的误导性症状与只能由人做的恢复、以及\"卡死\"诊断方法"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论
"任务没完成却自己结束"不是 dsh 故障，是 `update_goal(action=blocked)` 的**终态 + 强制 wrapup** 组合。2026-09-28 排查确认。

## 6 条停止路径（源码级，dsh 0.1.7-rc.2）
1. **模型主动 block**（最常见）：`@deepseek-ai/dsh-tool-goal/lib/index.js` 里 `blocked` 在 goal-round 内唯一门槛是 `roundsStarted >= blockedAfterConsecutiveRounds`（默认 **3**）。通过后调 `ctx.goals.block()` → phase=blocked + **disarm**，紧接着 `exec.deferContext(renderWrapupContext(...))` 注入 `<goal_blocked>`，原文含 **"Write the closing message to the user now... Do not call any more tools in this run"** ⇒ 模型写收尾、停工具、回合自然结束。
2. **round budget 打满**：`dsh-goal-round-driver/lib/index.js` 在 `roundsStarted >= maxGoalRounds` 时自己 block，`code: "round-limit"`。默认 `maxGoalRounds` = 256（`dsh-goal` 的 `Config.defaultMaxGoalRounds`）。
3. **静默 disarm（goal 仍显示 active）**：driver 里 `turn/end` reason `max-tokens` → disarm；`agent/error` → disarm；`aborted` 且 attempt 非 claimed/admitted → disarm；driver 内部异常（checkpoint flush / `followup` queue / pre-step 校验）→ disarm。
4. **`pause`：用户中断排队/执行中的 goal round**（2026-09-28 深夜实证）。触发链：用户按停止 → `turn/end` reason `aborted` + `reason.kind === "user"` → driver 在 `session/event` 里置 `attempt.cancelled = true` → agent 转 `idle` 时 driver 的 `agent/status` handler 发现 `attempt.cancelled` → **`ctx.goals.pause()`**。
   - **症状极具误导性**：UI 上就是"卡住了、不动了"，而且之前几轮都在正常推进。实际系统完全健康。
   - **恢复只能由人做**：`update_goal(action=resume)` 对 paused goal 会被拒 —— `the model cannot resume a paused goal; the user must resume it`（`GOAL_TOOL_RESUME_PAUSED`）。路径是 **`/goal resume`**（`dsh-command-goal` 的 `USAGE = "Usage: /goal [<objective>|clear|edit <objective>|pause|resume]"`）或 web UI 的对应按钮。
5. **进程重启**：`dsh-goal` 构造里 `ctx.on("agent/created")` → `setActivation(session,"disarmed")`；driver 启动时 `for (const agent of ctx.agents.list()) disarm(...)`。**dsh 重启后 active 的 goal 也不会自动续跑，必须人工 resume。**
6. `turn/end` reason `interrupted` / `error`（环境类：provider 503、NO_ADAPTER、缺 API key、unsupported reasoning effort）。

## 权限不对称（结构性根因）
- `edit` / `pause` / `resume` 要求 `requireDirectHuman()`：当前 root turn 内必须有 `user/message` 且 `source.kind === "user"`。
- `blocked` / `complete` 在 `authority.kind === "goal-round"`（自动续跑轮）里**就允许**。
⇒ 模型有"主动停车"权，**没有**"自己重新发动"权；一旦 block/pause 必须等人类开口。

## 正规恢复路径
`update_goal(action=edit, max_goal_rounds=N)` 扩预算 → 再 `update_goal(action=resume)`。**不需要 block**，源码报错原文即 `goal "..." exhausted N goal rounds; increase maxGoalRounds before resuming`。两个动作都必须落在含 direct human turn 的那一轮里。（paused 例外：模型无法 resume paused。）

## 诊断方法（下次遇到"卡死"先跑这个）
在 session 文件里按时间窗口看 `turn/end` + `goal/change`：
- 出现 `{"kind":"aborted","reason":{"kind":"user"}}` 紧跟 `goal/change operation=pause` ⇒ 路径 4，是**用户中断**引发，不是系统故障。
- 若某个 `tool/call` 与其 `tool/result` 之间隔了几十分钟 ⇒ **是那条命令挂住了**（`tool/result` 会是被 abort 打断的 None）。2026-09-28 实测挂 51 分钟。

## 实测时间线（goal-d2338893）
09-27 23:13 create(30 轮) → 09-28 01:36 **block rev2 @26/30**（code=model-reported）→ 11:55 resume rev3 → 13:34 **block rev4 @30/30** → resume rev6（预算 30→120）→ 16:49:33 **pause rev7**（用户按停止，起因是一条 bash 挂住）。
