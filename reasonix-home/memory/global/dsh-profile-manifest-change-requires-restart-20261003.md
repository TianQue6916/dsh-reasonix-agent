---
id: mem-211e6771b240f730b6a08298089ab1fe
revision: 1
created_at: "2026-10-03T11:11:50.384Z"
updated_at: "2026-10-03T11:11:50.384Z"
name: dsh-profile-manifest-change-requires-restart-20261003
description: "dsh 改 profile manifest（bundles/deps）会触发 requires-a-process-restart，导致 turn 中断 + 上下文丢失；含 interrupted closer 的识别判据与排除链"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论

`turn/end reason={"kind":"interrupted"}` 出现在 `~/.dsh/sessions/--C-Users-27063--/session-a0d5fbf8-0fb1-419e-9baf-d95df0190144/session.v4.jsonl.zstd` seq=21367，time=1791024718204。**这个 time 是复用值，不是真实发生时刻。**

判据（来自源码逐字）：
- `@deepseek-ai/dsh-session/lib/index.js` 的 `openTurnClosers()` 文档：`Return deterministic synthetic events that close an open tail turn. … sequences continue the log and timestamps reuse the last real event.`
- `@deepseek-ai/dsh-agent-loop/lib/index.js:1950` 在 **resume** 路径调用：`const closers = interruptedTurnClosers(persisted); if (closers.length > 0) await handle.append(closers);`
- 因此 `step/end seq=21366` 与 `turn/end seq=21367` **同毫秒**（1791024718204）；而真实闭合永远隔几毫秒（对照 seq 21232 step/end → 21233 workspace/changes → 21234 hook/invoked → 21236 turn/end completed）。

真实时间线：18:51:58.204 写最后一条真实事件（`thinking-language` 注入 seq=21365）→ App 进程停止、turn 未闭合 → 19:00:39 用户重启 App → 19:00:54.693 resume 补写 synthetic closers + `session/end-seed seq=21368`。

## 根因：改 profile manifest 触发「requires a process restart」保护

- **18:51:35** 我 `--apply` 了 `~/.dsh/storages/tools/patch-thinking-guard-desktop.py`（给 `profiles/desktop/package.json` 的 `dsh.profile.bundles` append `@ethanwong-hk/dsh-thinking-guard`，15→16；备份 `package.json.bak-20261003-185135-pre-thinking-guard`）
- **18:51:58.204** turn 终止 —— 相隔 23 秒
- 机制在 `@deepseek-ai/dsh-app-boot/lib/index.js:1365-1372` `ResolutionRouter.replace()` 逐字抛错：
  - `profile resolution: replacing ${JSON.stringify(name)} requires a process restart`
  - `profile resolution: removing local package ${JSON.stringify(name)} requires a process restart`
  - `profile resolution: overriding ${JSON.stringify(name)} locally requires a process restart`
  - `profile resolution: relinking ${JSON.stringify(root.name)} requires a process restart`

⇒ **dsh 对 profile 的 package 解析集合变更是「要重启进程」语义，不是热重载**。新加的包目录落在 `profiles/desktop/node_modules/` 下 ⇒ `localPackageNames` 变化 ⇒ 命中该保护。

## 排除项（都已验证）

- **不是 thinking-guard**：全机 1058 个 session，`turn/end` 的 `aborted` cause 只有 `{"kind":"user"}` 23 次 + `{"kind":"parent"}` 8 次，**从无 `thinking-guard`**；`user/message` 的 `source.kind` 分布（git-context 4211 / thinking-anchor 2718 / user 1430 / plan-anchor 1103 / fallback 1047 / runtime-context 860 / skill-catalog 860 / provider 247 / dsh-mnemon 143 / …）里**没有 thinking-guard**。⇒ 它一次都没真正熔断过。
- **不是 gateway loop-guard**：`D:\Toolbox\goat-gateway\logs\loop-guard.jsonl` 当日全部 `"hits":[]`、全部 `status=200`。
- **不是崩溃**：`%LOCALAPPDATA%\CrashDumps` 最新是 11:37 的 powershell.exe，无 DeepSeek Harness；Windows Application 事件日志 18:40–19:10 **零** Error/Warning。
- **不是 max-tokens**（另有 `dsh-maxtokens-notice-suppress-patch-20261003`）。

## 「上下文消失」的机制

- `@deepseek-ai/dsh-api-session-controller/lib/client.js:1502`：`if (entry.event.type === "assistant/message" && entry.event.data.interrupted !== true) { this.retainedAttempt = {...}; return this.publish(entry); }` ⇒ `interrupted === true` 的 assistant message **不走 publish，改走 settlement**。
- `@deepseek-ai/dsh-client-ui-chat/lib/client.js:7184-7191`：`CHAT_SYNTHETIC_SEQ_OFFSETS = { interruptedAssistant: -.9, interruptedFollowup: -.8, … }` ⇒ UI 对 interrupted assistant 走**合成 seq 偏移**的独立渲染路径。
- 叠加：这次是**进程死**而非 abort signal ⇒ `@deepseek-ai/dsh-agent-loop/lib/index.js:1085-1097` 的 `live.interruptedBlocks()` → `append("assistant/message", { interrupted: true })` **从未执行** ⇒ 那一轮的思考与文本没有落盘，只剩已写盘的 `tool/result`。

## 全机 `turn/end` reason 分布（1058 session，截至 2026-10-03）

`completed 1329 / aborted 31 / error 33 / max-tokens 14 / interrupted 6 / blocked 1`。6 次 interrupted：09-27 13:12:27、09-28 01:33:00、09-28 01:33:21、09-30 02:10:42、09-30 18:03:54、10-03 18:51:58（其中 4 次在 session-a0d5fbf8）。

`session/end-seed` 105 次（104 次 data 为 `{}`、1 次 `{"inherited":true}`）= 会话关闭标记，属正常。

## 行动规则（今后必须遵守）

**改 `~/.dsh/profiles/*/package.json` 的 `dsh.profile.bundles` 或 `dependencies` 是「需要进程重启」级别操作**：不要在用户正用着 App、turn 进行中时做；做完必须立刻明确告知「需要重启 App」，否则用户会遭遇一次 turn 被中断 + 那一轮上下文丢失，且现象看起来像「熔断 / 上下文消失」，极易被误诊为插件 bug。
