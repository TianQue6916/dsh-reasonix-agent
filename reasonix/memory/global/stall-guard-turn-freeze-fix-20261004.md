---
id: mem-bad127d761cfd2be5e3cb872b442ff7a
revision: 1
created_at: "2026-10-04T02:40:29.424Z"
updated_at: "2026-10-04T02:40:29.424Z"
name: stall-guard-turn-freeze-fix-20261004
description: "stall-guard preset 模块：turn 永久冻住的结构性兜底 + toolBreaker 熔断（原理、代码锚点、验证方法）"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 问题（用户 m03713/m04711「不要假设，彻底给他解决」）
dsh 的 turn 会**永久冻住**：进程活着、无报错、无文件写入、gateway 零记录，UI 上表现为「对话莫名其妙断掉」。本机实测 11 次。

## 为什么是结构性的（根因链，全部已用源码坐实）
1. **没有 stream 级 timeout**：`dsh-llm/lib/index.js:7` 只 import `MAX_TIMER_DELAY_MS`；`for await (const chunk of stream)` 无时限。
2. **fail-closed flush barrier**：`dsh-session-checkpoint-policy` 在 `llm/stream` / `tools/execute` / `agent/pre-step` 三处注册 `await ctx.sessions.flush(session)`；`dsh-session/lib/index.js:1832 async flush(session)` 走 `ctx.parallel("session/flush", …)` 并 `results.find(r => r.status === "rejected")`。全库 listener 只有 `dsh-session-persistence-jsonl/lib/index.js:413`（`await writer.drainLive(); await writer.flush();`）与 `dsh-session-telemetry/lib/index.js:80`。**任一个永不 settle ⇒ 整个 step 冻住，且无异常可捕获**（`ctx.parallel` 等所有 listener settle 才返回）。
3. ⇒ 无论冻在哪一层，dsh 自身都没有恢复路径。

## 解法：`~/.dsh/.agent-presets/anchored-standard/stall-guard.mjs`（10132 B）
- `export const name = 'stall-guard'; export const inject = [];`；只 import `node:` 内建；全文件 try/catch。
- **section 1 活性兜底**：`ctx.on('agent/pre-step', …)` 在 `await next()` **之后** arm（计时起点 = 注入落盘前，因为真卡死发生在「注入落盘后、请求发出前」，那时还没有 start frame）；`ctx.on('agent/assistant-stream', (payload) => touch(payload.agent, payload.frame), { global: true })` 每帧刷 `lastActivity`；`ctx.effect` 里 `setInterval(tick, interval).unref()` 每 15s 扫，idle > 240000ms 就 `agent.cancel({ kind: 'stall-guard', reason: 'no-stream-activity', detail, sessionId })` + 写 `$DSH_HOME/logs/stall-guard.log` 的 `STALL-CANCEL` 行。
- **故意不 autoContinue**：thinking-guard 的「注入『继续』→ 新 attempt → 又空转」正是死循环来源。
- **section 2 toolBreaker**：`ctx.on('tools/post-execute', …)` 按 sessionId+toolName 记连续 `result?.isError === true` 失败，3 次后下一步 `agent/pre-step` 注入一条 `<stall-guard>` user 消息要求换本质不同的策略或停下汇报；成功/换工具即重置。
- `DEFAULTS = { stallGuard: { enabled: true, stallMs: 240000, tickMs: 15000 }, toolBreaker: { enabled: true, maxConsecutiveFailures: 3 }, logPath: null }`。
- **常量坑（已修）**：`const MIN_TICK_MS = 250; const DEFAULT_TICK_MS = 15000;` —— 原写 `Math.max(1000, …)` 把测试的 `tickMs: 100` 抬到 1000，导致 7 项单测 FAIL。

## 关键 API 事实（写新 preset 模块必用）
- **`agent/assistant-stream` 的 payload 一定含 `agent`**：`dsh-agent-loop/lib/index.js:1068 this.dispatch.emit("agent/assistant-stream", { frame })`，而 dispatcher 来自 `@deepseek-ai/dsh-agent/lib/index.js:242 function agentEvents(ctx, agent, carrier = agentCarrier(agent))`，其 `fused = (payload) => ({ ...payload, agent })` ⇒ listener 收到 `{frame, agent}`。listener 抛错只被 `ctx.logger.warn` 吞掉，不会炸 harness。
- **waterfall 的 after-next transform 按逆注册序应用** ⇒ 先注册 = 更外层 = 更后运行。
- `.agent-presets/**/*.mjs` **不参与 `patchReload: live`** —— 改完必须重启进程（实测：改 `cordis.patch.yml` 等 60s，desktop host 的 tee 计数恒为 4，无任何 reload）。

## 接线
`~/.dsh/profiles/{web,desktop}/cordis.patch.yml` **line 88-89**：`- id: stall-guard` / `name: ../../.agent-presets/anchored-standard/stall-guard.mjs`，位置在 host-log-tee 块之后、`# ── context gate (must stay FIRST) ──` 之前（放在 gate 之前才能保证注入不被 `allowKinds` 过滤）。备份 `cordis.patch.yml.bak-<stamp>-pre-stall-guard`。

## 验证
- 单测：`node ~/.dsh/tmp-probe/test-stall-guard.mjs` —— mock ctx 驱动真实模块，**35 断言全绿 EXIT=0**。
- 一键脚本：`powershell -File ~/.dsh/storages/tools/verify-stall-guard.ps1` —— 检查模块存在、两 profile 有该 row、列出在跑的 host（判据 = cmdline 匹配 `dsh[/\\]lib[/\\]bin\.js` 或 `expose-internals`）、**核心判据 = stall-guard.log 最后一条 `installed pid=` 的 pid 是否仍在运行 + host 启动时间是否晚于模块 mtime**。
- **脚本自身的 PowerShell 坑**：`$x = $lines | Where-Object {…}` 命中 0/1 条时返回**标量**，`$x[-1]` 变成「取字符串末字符」⇒ 断言静默跳过、误报 PASS。修法 = 一律 `@(...)` 强转数组 + `$arr[$arr.Count - 1]`。
- 状态（截至 2026-10-04 10:37Z）：**web 3080 已生效**（`[2026-10-04T02:37:42.817Z] installed pid=26976 node=v24.15.0`）；desktop 待 App 重启。web 重启手法 = `Stop-Process -Id <host pid> -Force` → 2s → `Stop-Process -Id <cmd.exe wrapper pid> -Force` → 2s → `schtasks /Run /TN 'dsh-web-3080'`（重启后 URL token 会变）。
