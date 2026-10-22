---
id: mem-d58ba423e584d72b6ad86fc77e7e9c7d
revision: 2
created_at: "2026-10-03T14:32:58.5215765Z"
updated_at: "2026-10-03T15:01:21.3744301Z"
name: dsh-桌面端频繁中断-根因取证与-maxtokens-收敛-20261003
title: dsh 桌面端「对话莫名其妙断开」根因取证 + maxTokens 收敛 + 暂停熔断（2026-10-03）
description: interrupted 只是 resume 补记；真身是 turn 卡死；thinking-guard 确在熔断但 cancel 无 durable 痕迹（已按用户要求暂停）；v4.1-flash maxTokens 降至 131072
keywords: dsh, interrupted, maxTokens, thinking-guard, 熔断, goat-gateway, turn 卡死
metadata:
  type: user
  fact_type: project
  scope: global
---

## 一、核心纠正：interrupted 是补记，不是病因

`turn/end reason={kind:"interrupted"}` 只能来自 `@deepseek-ai/dsh-session` 的 `interruptedTurnClosers()`（`openTurnClosers` L747/L904），在 **resume 路径**（agent-loop L1950）补写，**复用时戳**。判据：`closer.time == 前一条真实事件.time`。本机 11 次 interrupted 100% 命中。
对照组：09-30 18:03:54 ↔ `~/.dsh/logs/restart-desktop.log` 的 `18:04:04 Stop-Process DeepSeek Harness`。
⇒ interrupted = 进程在 turn 进行中被终止后的补记。

## 二、真身：turn 卡死（进程还活着）

`session-a0d5fbf8` 的 turn 196（21:12:33 起）停在 21:13:39 未闭合，而 Harness 进程（21:12:04 起）一直活着 ⇒ 进程活着但回合卡死。
根因链：长会话 prompt 涨到 20 万 token → 上游偶发**建连后 180 秒不吐首 chunk** → `step()` 只在流结束时判定 ⇒ turn 永不闭合 → 用户重启 → 补记 interrupted + 该轮思考/文本永久丢失（「上下文消失」）。
网关证据 `D:\Toolbox\goat-gateway\logs\gateway-2026-10-03.log`（UTC=本地-8）：`12:11:02Z STREAM-IDLE id=82 idle=180000ms where=waiting-first-chunk` + `NETWORK upstream first-chunk timeout after 180000ms`；全天 OK 733 / NETWORK 5 / STREAM-IDLE 3 / AGENT-RECYCLE 60 / CLIENT-ABORT 14；毫秒互证 `13:11:19.541Z OK id=91` ↔ session `21:11:19.543`。

## 三、thinking-guard 的真相（更正 2026-10-03 早先的错误论断）

**早先我写「它一次都没出手」——错。** 用户 22:5x 截图里出现了它的 `notifyContinue()` 原文：「继续。上一回合因思考空转被熔断中止（**thinking-only-timeout**）。现在立即恢复原有任务…」⇒ **它确实在熔断并注入提示**。

**但它的动作没有 durable 痕迹**（这才是 bug 所在）：全库 220 session 精确搜该文案 —— 命中全是**别的 agent 在讨论它**的文本，插件真正的注入消息从未落盘；`turn/end` reason 精确匹配 `thinking-guard` = **0**（而 agent-loop L1009-1014 明确：cancel ⇒ `{kind:"aborted", reason:<cause>}`）。
⇒ `agent.cancel({kind:'thinking-guard'})` 在 session 层不可见：要么抛错被 try/catch 吞掉，要么那轮先被进程终止淹没。
**加剧机制（解释用户「仍然这样」）**：`thinkingOnlyMs=45000`，而上游实测有 180s 不吐首 chunk ⇒ **45s 先判「空转」→ 注入「继续」→ 新 attempt → 45s → 再熔断**，死循环。

## 四、本次两项改动（均已备份可回滚）

1. **maxTokens 收敛**：`profiles/{desktop,web}/cordis.patch.yml` 的 `deepseek/deepseek-v4.1-flash`：desktop 262144→**131072**、web 393216→**131072**。脚本 `~/.dsh/storages/tools/patch-flash-maxtokens.py`（--check/--apply/--verify/--restore），备份 `cordis.patch.yml.bak-20261003-223121-pre-flash-maxtokens`。其余模型未动（desktop 6 处 / web 46 处）。
2. **暂停熔断**：`profiles/{desktop,web}/node_modules/@ethanwong-hk/dsh-thinking-guard/cordis.patch.yml` 的 `enabled: true→false`（用户拍板：先暂停）。脚本 `~/.dsh/storages/tools/patch-thinking-guard-disable.py`，备份 `.bak-20261003-225739-pre-guard-disable`。停用逻辑见该包 `lib/index.js` L30/L120（`DSH_THINKING_GUARD_DISABLED=1`）/L404（`if (!cfg.enabled) return`）。包目录不是符号链接，可直接改。

**两项都不触发 requires-a-process-restart**（未增删 package resolution）。但 thinking-guard 的 enabled 属 bundle 内 patch 的 config，走 boot 加载路径 ⇒ **需重启桌面端才生效**。

## 五、未修（待决策）

1. `gateway.mjs:189-192` 的 agent 回收用 `e.agent.destroy()`，**销毁该 origin 全部 socket（含在途流）**，且只在下一个请求到来时检查（age 曾飙到 56 分钟）→ 并发会话可能被顺手掐断。
2. **桌面端无日志**：从 explorer 启动，主进程与插件的 `console.warn`（含 thinking-guard 的熔断日志）全部丢失 —— 这是本次排查最大的观测缺口。
3. `billion-context` 的 bundle patch 把 `compaction-basic.automatic` 设成 `auto:false`。

## 六、教训

① 用户口中的术语（「熔断」）不是猜测，是**他在 UI 里真看到的文案** —— 应向他要截图/原文，而不是自己扫日志下「从无」的绝对论断；② 插件的「可见注入」与「durable 痕迹」是两套（inbox 未消费就不落盘）；③ 备份文件的 mtime 是源文件时间，文件名时间戳才是改动时刻；④ 网关日志是 UTC（本地 -8）。

取证脚本（%TEMP%，可复用）：`scan-int.py`、`scan-guard2.py`、`scan-guard3.py`、`find-phrase.py`、`timeline.py`、`dump-types.py`、`search-str.mjs`。
