---
id: "9c31add6-6f59-4ff5-a0c4-056d0a36d6de"
title: "dsh stall-guard：turn「永久冻住」的结构性根因与落地验证（2026-10-04）"
description: "2026-10-04 对 dsh「turn 永久冻住」的定案与修复交接：三层源码级根因（dsh-llm 无 stream timeout、dsh-agent-loop 无时限消费流、checkpoint-policy 的 fail-closed flush barrier 放大）、stall-guard.mjs 的活性兜底与 toolBreaker 设计、cordis.patch.yml 接线、verify-stall-guard.ps1 判据与 web 3080 实测证据、重启级生效约束与踩坑。"
status: "active"
created_at: "2026-10-04T02:41:58.381Z"
updated_at: "2026-10-04T02:41:58.381Z"
content_hash: "2d01c61d4720b3fdfe20e7a3b5cd3d06f7ba0ba5706c490e255187b9fe3cda72"
source_paths:
  - ".agent-presets/anchored-standard/stall-guard.mjs"
  - "profiles/web/cordis.patch.yml"
  - "profiles/desktop/cordis.patch.yml"
  - "storages/tools/verify-stall-guard.ps1"
  - "logs/stall-guard.log"
  - "PLAN.md"
session_ids:
  - "99590068-40ee-40fd-9dfa-bff20f4b4fa6"
memory_body_ids:
  []
---

# dsh stall-guard：turn「永久冻住」的结构性根因与落地验证（2026-10-04）

用户诉求（m03713 / m04711，原话）：「不要假设，彻底给他解决」。本机实测过 11 次 `turn/end interrupted`（进程活着、无 crash log、gateway 零记录、32 个文件全局 mtime 在 23:10:17.521 之后无一由 host 写）。

关联文档：`b2d5fd4e-11b1-4266-af11-50fec153e1e9`（卡死取证、session-checkpoint barrier **假说**、host-log-tee 可观测性）、`16837db5-c829-453c-a02a-76085c6c73a1`（max-tokens 假警报）。本篇记录该假说的**定案与修复实现**，两者互补不重复。

## 1. 根因（三层，全部源码级；不是网络、不是上游）

1. **`dsh-llm` 内没有任何 stream 级 watchdog** —— `dsh-llm/lib/index.js:7` 只 import 了 `MAX_TIMER_DELAY_MS`，无 per-stream timeout。
2. **`dsh-agent-loop` 消费流的地方无时限** —— `for await (const chunk of stream)` 没有 race 任何 timer。上游建连后一个字节都不吐，这里就永远等下去，且没有异常可 catch。
3. **checkpoint-policy 的 fail-closed flush barrier 放大它** —— `dsh-session-checkpoint-policy` 在 `llm/stream`、`tools/execute`、`agent/pre-step` 三处都插了 `await ctx.sessions.flush(session)`；`dsh-session/lib/index.js:1832 async flush(session)` 走 `ctx.parallel("session/flush", …)`，**要等每个 listener settle 才返回**。全库 listener 只有 `dsh-session-persistence-jsonl:413`（`await writer.drainLive(); await writer.flush();`）与 telemetry 两个 ⇒ 任一个不 settle，整个 step 冻住。

结论：冻住是**结构性**的，加日志不解决，必须加兜底。

## 2. 修复实现：`stall-guard.mjs`

模块：`~/.dsh/.agent-presets/anchored-standard/stall-guard.mjs`（最终 **12190 B**，mtime 2026-10-04 10:28:46；单测阶段为 10132 B）。

接线：`profiles/web/cordis.patch.yml` 与 `profiles/desktop/cordis.patch.yml` 均含 `- id: stall-guard`（**line 88**）。

机制：

- **活性兜底**：`agent/pre-step` 记计时起点；`agent/assistant-stream` 每帧刷 lastActivity；每 **15s** 扫一次，**idle > 240s** 即 `agent.cancel({ kind: 'stall-guard', reason: 'no-stream-activity' })`，把「永久冻住」变成 aborted 干净收尾。
- **落盘证据**：`~/.dsh/logs/stall-guard.log` 写一行 `STALL-CANCEL`，注明卡在哪一步、idle 多久、收到几帧；另写 `installed pid=` / `stallGuard armed stallMs=240000 tickMs=15000` / `toolBreaker armed maxConsecutiveFailures=3`。
- **故意不 autoContinue**：thinking-guard 的「注入『继续』→ 新 attempt → 又空转」正是死循环来源。
- **toolBreaker**（回应 m04699「像这样的命令能不能熔断」）：同 session 同工具连续失败 **3** 次 ⇒ 下一步注入 `<stall-guard>` 提示，要求换本质不同的策略或停下汇报，不许再微调参数重试。

关键 API 事实（避免误杀）：`agent/assistant-stream` 的 payload 一定含 `agent` —— `dsh-agent/lib/index.js:242 agentEvents` 里 `fused = (payload) => ({ ...payload, agent })`；emit 点在 `dsh-agent-loop/lib/index.js:1068`。所以 `touch()` 拿得到 agent，不会退化成「刷不到活动时间 ⇒ 每 4 分钟误杀正常 turn」。

## 3. 验证与实测证据

- **单测 35 passed / 0 failed**（`~/.dsh/tmp-probe/test-stall-guard.mjs`，mock ctx 驱动真实模块）。过程中抓到真 bug：tick 间隔写成 `Math.max(1000, …)` 把测试的 100ms 抬到 1000ms，已修为 `MIN_TICK_MS = 250`。
- **一键验证脚本**：`~/.dsh/storages/tools/verify-stall-guard.ps1`（修好后 5187 B）。判据四类：① 模块存在 + 两个 profile 的接线行；② 当前在跑的 dsh host 进程（web-host / desktop-host 分别列 pid 与启动时间）；③ `stall-guard.log` 的 `installed` / `STALL-CANCEL` / `toolBreaker-armed` 计数；④ `stall-guard.log` 最新 `installed pid` **是否仍在运行** 且 **host 启动时间晚于模块 mtime**（即真加载了最新代码）。
- **web 3080 已生效**：10-04 10:37:42 `installed pid=26976`，host 启动 10:37:37 晚于模块 mtime，脚本报 **6 passed / 0 failed**，结论「turn 不会再永久冻住（4 分钟无 stream 活动即 cancel）」。中间有一次 4 passed / 1 failed 的**正确失败**：最新 installed 的 pid 18072 已不在运行（旧进程），脚本据此判定需先重启。
- desktop 侧 `.agent-presets/**/*.mjs` 不参与 `patchReload: live`（实测改完等 60s host tee 计数未动）⇒ 必须重启桌面 App 才加载（对话会 resume，不丢）。重启后跑同一脚本，期望 `last installed pid=` 是新 desktop host 且仍在运行。

## 4. 踩坑与运维约束

- **PowerShell 静默误报 PASS**：`$x = $lines | Where-Object{…}` 在命中 0/1 条时返回标量，`$x[-1]` 退化成取末字符 —— 写这类校验脚本时必须强制数组化（`@(...)`）。
- stall-guard 的 target 在 `.agent-presets/`（用户层），不受 `pnpm install` 覆盖；但同批的 `dsh-tool-subagent` always-continuable patch 落在 `profiles/node_modules/`，`pnpm install` 会覆盖需重跑。
- 同一次 web 3080 重启顺带加载了 `dsh-tool-subagent` always-continuable patch（其 `lib/index.js` mtime 10:37:17 早于 host 启动 10:37:37，`--check` 报 `already-patched`，sha256=51fdfddc39aa28cb）。

## 5. 未决

- desktop 侧 stall-guard 生效待一次 App 冷启动 + 重跑 `verify-stall-guard.ps1` 确认。
- `STALL-CANCEL` 实际触发记录尚未出现（armed 但 0 次），触发一次后才能验证 cancel 收尾与日志字段是否符合预期。
