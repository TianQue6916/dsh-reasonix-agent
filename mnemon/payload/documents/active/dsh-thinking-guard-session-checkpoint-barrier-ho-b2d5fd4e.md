---
id: "b2d5fd4e-11b1-4266-af11-50fec153e1e9"
title: "dsh 卡死取证与可观测性补全：thinking-guard 静默死亡、session-checkpoint barrier 假说、host-log-tee（2026-10-04）"
description: "2026-10-04 desktop host 卡死攻坚的取证与实现交接：三个已修真 bug（thinking-guard 裸名 resolve / 熔断阈值 45s / maxTokens 393216→131072）、卡死位置的逐项排除与剩余唯一机制（session-checkpoint-policy 的 llm/stream 前置 barrier 等所有 flush listener settle）、host-log-tee.mjs + host-watchdog.ps1 的落地与 E2E 证据、elu 心跳判据。"
status: "active"
created_at: "2026-10-03T16:14:21.937Z"
updated_at: "2026-10-03T16:14:21.937Z"
content_hash: "5d01a377e4c9be036ab48a24df60b46778e77d6986ce6f9da92aef01dd6b9214"
source_paths:
  - ".agent-presets/anchored-standard/host-log-tee.mjs"
  - ".agent-presets/anchored-standard/agent.cordis.yml"
  - "profiles/web/cordis.patch.yml"
  - "profiles/desktop/cordis.patch.yml"
  - "storages/tools/host-watchdog.ps1"
  - "storages/tools/patch-thinking-guard-name.py"
  - "patches/README-thinking-guard-name.md"
  - "logs/host-stdio.log"
  - "PLAN.md"
session_ids:
  - "1dc350c2-e541-4fdd-bb48-adc83d92cb7c"
memory_body_ids:
  []
---

# dsh 卡死取证与可观测性补全（2026-10-04）

触发：desktop App 中一个 turn 的请求「永不发出 + host 零写入 + 零报错」，session 永久冻住，且当时**没有任何 host 日志可查**。本文记录该卡的取证边界、确认并修掉的三个真 bug，以及为抓下一次现场而造的观测设施。

## 1. 三个已确认并已修复的真 bug

1. **thinking-guard 静默死亡 —— 包自带 patch 用裸名，无法 resolve**
   - `@ethanwong-hk/dsh-thinking-guard` 自带的 `cordis.patch.yml` 写 `name: 'dsh-thinking-guard'`，真包名带 scope ⇒ dsh 按模块名 resolve ⇒ `ERR_MODULE_NOT_FOUND` ⇒ entry 的 `fiber` 建不起来。
   - 报错被吞：`dsh-app-boot/lib/index.js:3910` 的 `entry.fiber === undefined` 分支（原始错误在此丢失，日志只剩一句 `failed to import`）。
   - **不能改 profile 的 row**：profile patch 按 `(id, name)` 匹配，会报 `patch: name mismatch … skipping`；必须改源头 `profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/cordis.patch.yml`（928 → 942 B）。
   - 双验证：`--dump-config` exit=0 / stderr 0 B；隔离实例 `--port 3099` boot 日志仅 1 行、err 0 B、无 `failed to import`。
   - 脚本 `storages/tools/patch-thinking-guard-name.py`（幂等 / `--check` / `--verify` / `--restore`），说明 `patches/README-thinking-guard-name.md`。⚠️ target 在 node_modules ⇒ `pnpm install` 覆盖，需重跑。
   - 推论：用户 22:5x 截图中的「上一回合因思考空转被熔断中止」是**另一次成功熔断**；该插件此后因上述 bug 静默死亡，所以「熔断有 bug」的观感成立。

2. **熔断阈值反噬，自身制造循环**（已 `enabled: false`，web + desktop）
   - `thinkingOnlyMs: 45000` < 上游 180 s first-chunk 超时 ⇒ 45 s 判空转 → 注入「继续」→ 新 attempt → 45 s → 死循环。

3. **单步预算过大**（已改）
   - `deepseek/deepseek-v4.1-flash` 的 maxTokens：desktop `262144`、web `393216` → 统一 **131072**。
   - 旁证：25 MB session 里 `request/header` 的 `config.maxTokens` 分布是 `{131072: 3, None: 3}`（最新三条），历史 54 条为 262144 ⇒ 补丁已生效。

## 2. 卡死定位：已排除项与剩余唯一机制

逐项排除（均有正面证据，不是猜测）：
- **不在网络**：turn 198 step 4 的请求从未离开本机 —— gateway 在 `15:05–15:16Z` 对本 session（`sess=cca42431`）只记到 step 3（`id=197`），之后零记录、零 CLIENT-ABORT、零 STREAM-IDLE。
- **不在磁盘/内存/换页**：C: 70.7 GB 空闲、内存 Free 19.7 GB、pagefile 使用 0。
- **不在 session 锁（决定性）**：`SessionWriteLease` 在 Windows 用具名内核 semaphore、`waitForSingleObject(handle, 0)` 零超时 —— 争用只会立刻抛 `SessionAlreadyOwnedError`，**结构上不存在「排队等锁」**。POSIX 侧走非阻塞 `flock(2)`，`session.lock` 为 lease 文件名（见 `acquireLease`）。
- **不在全量重写**：`persistBatch` 稳态走 `appendLines`，只有首次 `materialize` 才全量写；step 1 的 LLM 耗时 40943 ms 中本地只占 ~200 ms。
- **不在这些插件**：`billion-context`（只挂 `webserver/index-inject`，注入一个全局变量）、`dsh-headroom`（只挂 `tools/post-execute`）、`dsh-deja`（只注册 tools/commands，零 agent hook）、`dsh-mnemon` 定时任务（卡死窗口零活动）、llm 层（`semaphore|mutex|acquire` 全 0 命中）。

**剩余唯一机制（与观测逐项吻合）**：`@deepseek-ai/dsh-session-checkpoint-policy` 给 `llm/stream` 装了 per-request barrier —— `await ctx.sessions.flush(session)` 之后才 `next()`；其头注释原文 *"Checkpoint failures are fail-closed … the downstream adapter is not invoked"*。而 `flush` 走 `ctx.parallel("session/flush", …)`，**等每一个 listener settle 才返回**。只要 `dsh-session-persistence-jsonl` 的 `drainLive()` / `flush()` 有一个 promise 永不 settle，整个 step 就永久冻住 —— 表现为「注入落盘后 host 零写入 + gateway 零记录 + 零报错」。

## 3. 已造的取证设施（重启后生效）

**`host-log-tee.mjs`**（`storages` 之外，位于 `.agent-presets/anchored-standard/host-log-tee.mjs`，已接线进 web/desktop 两份 `cordis.patch.yml` 第 44 行前部，E2E 通过）
- 动机：打包版 desktop 的 Electron main 把 host stdout 直接 pipe 进黑洞、stderr 只留在内存（app.asar `lib__main.js:3667-3704`，`spawn(..., {stdio:["ignore","pipe","pipe","ipc"]})`，stderr 64 KiB 从不落盘），而 App 从 explorer 启动时没有 console；`ctx.logger.warn` 与未捕获异常全部不可查，卡死现场等于零证据。
- `DSH_DESKTOP_HOST_INSPECT_PORT` 这条路已死：打包版里 `developmentHostInspectPort(enabled)` 在 `enabled=development` 为 false 时直接 `return undefined`（同文件 `:11045-11052`）。
- 三件事：tee `process.stdout` / `process.stderr` 到 `logs/host-stdio.log`；每 5 s 一行 `monitorEventLoopDelay` 心跳（`elu[ms] p50/p99/max` + `rss/heap/res`）；挂 `uncaughtException` / `unhandledRejection`。
- 它不注册任何 agent hook，所以不参与 `agent/pre-step` waterfall；profile 注释里的「context gate must stay FIRST」只约束那条 waterfall，两者不冲突。
- 实测输出（E2E 通过）：
  ```
  [tee] installed pid=7144 ppid=15240 plat=win32 node=v24.15.0 log=...\host-stdio.log
  [hb] t=2026-10-03T16:10:07.318Z elu[ms] p50=20.0 p99=564.7 max=978.3 rss=602MB heap=398MB res=123 writes=0
  [out] dsh web: http://127.0.0.1:3099/?token=<redacted>
  [hb] ... p50=31.1 p99=32.7 max=48.6 rss=256MB heap=160MB res=122 writes=1
  ```
- **判据（下次卡死时一刀切开两种情形）**：`elu` 飙到秒级 ⇒ event loop 被同步代码阻塞；`elu` 正常但日志停摆 ⇒ async 卡在 promise 上（即上一节的 barrier）。
- 观测副产物：`elu p50=31.1 ms` 对 idle web profile 偏高（健康 Node idle 应 <5 ms），`res=122` 活跃 resource 偏多；且整个 boot 只写了 **1 次 stdout**（`writes=1`）且无任何 `[err]` ⇒ **`ctx.logger.warn` 根本不走 stdout/stderr**，logger 另有 sink。**这条推翻了「host 日志被吞 = stdout 被 pipe 进黑洞」的原始设想**，也意味着卡死当晚的 warn 可能已落在某个文件 sink 上而未被查看 —— 该 sink 尚未定位，是下一个待办。

**`host-watchdog.ps1`**（`storages/tools/host-watchdog.ps1`，计划任务 `DshHostWatchdog`，已在跑）
- 外部 liveness probe：每 5 s `curl` host 的 `8783` / `19387` 端口；卡死时 curl TIMEOUT 而进程仍活着即铁证。日志 `logs/host-watchdog.log`。

## 4. 关键文件与代码锚点

- `.agent-presets/anchored-standard/host-log-tee.mjs`（`ctx.effect(() => () => {...})` 做卸载，约 `:187`）
- `profiles/web/cordis.patch.yml`、`profiles/desktop/cordis.patch.yml`（host-log-tee row 插在第 44 行前；备份 `cordis.patch.yml.bak-20261004-000921-pre-host-log-tee`）
- `dsh-session-persistence-jsonl`：`persistBatch`（`:2869`，稳态 `appendLines`）、`persistHeader`（`:2883`）、`truncateTornTail` 里的 `logger.warn(... recovered from a torn tail ...)`（`:2923` 附近）
- `dsh-app-boot/lib/index.js:3910`（`entry.fiber === undefined` 吞错点）
- 0.1.7 迁移：preset 改为 declaration 机制（`@deepseek-ai/dsh-agent-preset` 的 plugins 列表），旧 `$DSH_HOME/.agent-presets/<id>/` 目录不再被扫描，`@deepseek-ai/dsh-workflow-worker-thread` → `@deepseek-ai/dsh-workflow-ptc`。

## 5. 教训

- Windows 上没有「排队等锁」这种卡法：零超时 semaphore 争用是**立刻报错**，用「锁竞争」解释长冻是错误方向。
- 插件「装了」不等于「在跑」：entry 的 `fiber` 建不起来时 boot 只留一句 `failed to import`，其余错误被吞；看 boot 日志行数与 `--dump-config` stderr 双验证才可靠。
- node_modules 内的 patch 会被 `pnpm install` 冲掉；profile 侧 patch 按 `(id, name)` 匹配，改不了上游的错误 name。
- 观测先行：在「无日志 + 无写入 + 无报错」的现场上做诊断，先补 tee/心跳，再谈定位。

## 6. 关联文档

- `16837db5-c829-453c-a02a-76085c6c73a1` —— dsh「已达到输出 token 上限」通知假警报取证与抑制补丁（同属 dsh patch 运维范式：node_modules patch 被 install 冲掉、app.asar 边界、replay-all-patches）。

## 7. 待办（截至 2026-10-04）

- 重启 desktop App 使三件事同时生效：host-log-tee 上线、thinking-guard 暂停、flash maxTokens 131072（重启即中断当前 session，但中断本身就是要抓的现场）。
- 定位 `ctx.logger` 的真实文件 sink，回看卡死当晚的 warn。
- thinking-guard 真正生效仍需一次 web 进程重启（3080 那条进程 14:39:11 起，仍是旧的失败状态）；desktop 侧无法用 CLI dump（`error: profile "desktop" is managed exclusively by the Electron application`）。
- 另一主线：`reasoning-echo-filter`（goat-gateway，开关 `.reasoning-filter.json` = `{"enabled":true,"minCjk":0.25,"mode":"strip"}`）在 gateway 层剥掉回灌的非中文 reasoning 以切断语言自锁；棘轮实测 `id=1 dropped=27 kept=0` → `id=56 dropped=1 kept=12` ⇒ 中文 reasoning 占比持续上升。最终确认需统计本 session 最近 reasoning block 的 CJK，但脚本报 `total reasoning blocks: 0`，说明块类型名不是 `'reasoning'`，需先 dump 一条真实结构。
