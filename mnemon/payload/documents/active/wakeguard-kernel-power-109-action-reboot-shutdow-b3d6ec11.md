---
id: "b3d6ec11-22d3-4927-b573-c994490638a2"
title: "WakeGuard 连环关机根因：Kernel-Power 109 的 Action 语义判定（Reboot / Shutdown / Shutdown Off）"
description: "接 94d97a1a / 8f426f8b / f7c9342c 的「109 时间戳 + 60 秒阈值」自愈方案 B：2026-10-27 查出该判据缺 Action 维度，脚本自己发出的 shutdown /s 会写一条 109(Shutdown)，导致重启被误判 PHANTOM 并连锁关机。含三种 Action 语义、Action 字段只能从 Message 正则提取（ToXml 无此字段、ShutdownActionType=4 歧义）、改进后的判定代码、11 条历史 CHECK 数据、有意保留的误杀边界、WakeGuard 计划任务真实作用域与「非提权查不到 ≠ 不存在」的教训，以及 idle-loop-guard 从注入警告升级到 agent.cancel() 的附带结论。"
status: "active"
created_at: "2026-10-27T08:52:44.605Z"
updated_at: "2026-10-27T08:52:44.605Z"
content_hash: "e55beb074505fce98ad62eece0987673e4ea3fb1875a9895d99e6073164461ac"
source_paths:
  - ".dsh/storages/tools/wake-guard.ps1"
  - ".dsh/storages/tools/wake-guard-setup.ps1"
  - ".dsh/logs/wake-guard.log"
  - ".agent-presets/anchored-standard/idle-loop-guard.mjs"
  - ".dsh/logs/idle-loop-guard.log"
session_ids:
  - "435cbd2e-0cfc-4e06-b51a-08f5d751fe9c"
memory_body_ids:
  []
---

# WakeGuard 连环关机：Action 语义判定的根因与修复（2026-10-27）

前置：
- 现象与 60 天实证：`f7c9342c-8f53-4d5f-a8b7-405828718eae`
- 推翻 WoL 定论、转向 EC/AC 边沿：`8f426f8b-b86c-42e6-9985-473fa201d22b`
- OS 侧自愈方案 B（109 时间戳 + 60 秒阈值的来历、计划任务形态、验收探针）：`94d97a1a-bb18-4ec4-8dba-d50eaf88c7b3`

本文只补方案 B 上线后暴露的缺陷与修复，不重述上述结论。

## D 定论

方案 B 的判据 `gap = boot − last109 < 60s ⇒ 判 PHANTOM 并 shutdown /s /f` **缺少 Action 维度**，且 guard 自己发出的关机也会写一条新的 Kernel-Power 109。两者叠加产生**自我维持的连环关机**：上线两天唯一的实际战果，是把用户的 3 次「重启」变成了 6 次强制关机。

## M 连环关机是怎么闭环的

```
16:29:42  109  Action = Reboot        ← 用户在开始菜单点「重启」
16:29:59  boot →  gap=16.7s → PHANTOM → 执行 shutdown /s /t 0 /f
16:30:50  109  Action = Shutdown      ← 这一条是 guard 自己刚写的
16:31:19  boot →  gap=29.4s → 又判 PHANTOM → 再关机
16:32:11  109  Action = Shutdown      ← 又一次自写
```

关键机制：**`shutdown /s /t 0 /f` 与用户关机在内核日志里是同一种事件形状**（Kernel-Power 109，Action 文本为 `Shutdown`）。所以「上次是关机」这个前提一旦被 guard 自己写成真，下一次开机必然再次满足「刚关完机」，直到 gap 自然涨过 60 秒才停手。判据不做区分 ⇒ 杀不动不了手。

## J 判据：三种 109 的语义分层

| Message 中的 Action | 发起者 | 是否该进 gap 判定 |
|---|---|---|
| `Reboot` | 开始菜单 / 电源菜单「重启」 | **否**，语义上不是关机 |
| `Shutdown` | `shutdown.exe /s`（含 wake-guard 自己那条） | **否**，纳入即连环关机 |
| `Shutdown Off` | `winlogon.exe`（真·完全关机：开始菜单关机 / 电源键关机） | **是**，唯一可能是「关机后 EC 假加电」的场景 |

判定顺序应是**先按 Action 早退，只剩 `Shutdown Off` 才做 gap < 60s**：

```powershell
if ($action -eq 'Reboot')       { 'OK: user-initiated restart'; exit }
if ($action -eq 'Shutdown')     { 'OK: shutdown.exe (incl. this guard''s own)'; exit }
if ($action -ne 'Shutdown Off') { 'SKIP: not a full power-off'; exit }
# 落到这里才判定 gap < 60s
```

## M Action 字段在哪：只能从 Message 抠

```text
170-UserData / EventData 里：ShutdownActionType = 4    ShutdownEventCode = 0    ShutdownReason = 5
```

- **`ToXml()` 的 EventData 根本没有 Action 字段**
- `ShutdownActionType=4` 对 `Reboot` 与 `Shutdown Off` **两者都是 4** ⇒ 无法区分，不可用作判据

只能从 `$ev.Message` 文本中正则提取：

```powershell
# 中文系统：Action： Power Action Shutdown  事件代码： 0x0  原因： Kernel API
# 英文系统：... Power Action Shutdown Off ...
if ($ev.Message -match 'Power Action ([A-Za-z ]+?)\s*(?:事件|Event|$)') { $action = $Matches[1].Trim() }
```

这个正则对中英两种本地化都成立（`Shutdown Off` 里的空格已被 `[A-Za-z ]+?` 覆盖），但**强依赖文本格式**；若 `Message` 解析不到 Action，代码应回退到「不动手」而不是默认判 PHANTOM。

## R 历史数据：这套判据从没抓到过真货

`wake-guard.log` 共 11 条 CHECK：

- `PHANTOM` 总计 **2** 条，全部产生于 2026-10-27 这次连环关机
- gap 分位：p0=16.7s、p25=29.4s、p50=99.7s、p75/p90=38601.2s、p100=56732.5s
- `gap < 60s` 的 **4 条全部是事件链内产物**（前两条来自连环关机；10-25 的 38601s 样本是真远程开机，属于正常放行）

⇒ 60 秒阈值本身没有在真实假自启场景里被验证过；它的收益仍是「假设」，代价已实测为负。

## X 有意保留的误杀边界

若用户**命令行** `shutdown /s` 关机，Action 同为 `Shutdown`，会被放行 ⇒ 那种情形下的假自启抓不到。

取舍理由：把 `shutdown.exe` 纳入判定会同时把 guard 自己发出的关机算进去，连环关机立刻回归。**宁可漏报也不可自杀**。真出现该场景时人工看 `wake-guard.log` 的 `CHECK` 原文即可，日志保留了 boot / last109 / gap / threshold / dryrun 全字段。

## M 部署形态：改脚本即改全局，无需重注册

提权查出的任务定义（普通权限查不到，见下节）：

```
TaskName : WakeGuard          TaskPath : \
State    : Ready
Principal: UserId=SYSTEM  LogonType=ServiceAccount  RunLevel=Highest
Trigger  : MSFT_TaskBootTrigger  Enabled=True  Delay=PT20S
Action   : pwsh.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "...\wake-guard.ps1"
```

结论：任务只存**脚本路径**，脚本内容变了下次开机即生效——**不需要重跑 `wake-guard-setup.ps1`、不需要重新注册**。`RunLevel=Highest` 才有权限执行 `shutdown /f`；`SYSTEM` + `ServiceAccount` 使其不依赖任何用户登录会话。

## X 教训：非提权查不到系统计划任务，是「假否定」

四条路全部失败，但任务其实存在：

```
Get-ScheduledTask -TaskName WakeGuard     → 系统找不到指定的路径
schtasks /Query /FO TABLE                 → The system cannot find the path specified
Schedule.Service COM GetFolder('\')       → 0x80070003
Test-Path C:\Windows\System32\Tasks\WakeGuard → Access is denied
```

`C:\Windows\System32\Tasks\` 对普通用户连列目录都不允许。**在这台机器上，非提权查不到系统任务不能推断任务不存在**，必须提权复核后再下结论。

## R 验收

改动后先用 `-DryRun` 在现有事件链上复跑，期望 `PHANTOM` 消失：

```
CHECK boot=... last109=... gap=99.7s threshold=60s dryrun=True
ACTION last109 (Shutdown)
OK: last transition was Shutdown (shutdown.exe, incl. this guard's own) — not a phantom boot
```

端到端验收 = **真正重启一次**，看 `tail -3 ~/.dsh/logs/wake-guard.log` 是否出现：

```
ACTION last109 (Reboot)
OK: last transition was Reboot (user-initiated restart) — not a phantom boot
```

旧版正是在这里输出 `PHANTOM: shutting down now`，所以这一行就是回归判据。若仍关机，先取 `ACTION last109 (...)` 那行的实际 Action 文本，判断是否本地化格式与正则不符。

## 附带：idle-loop-guard 从「劝说」升级到「动手」

同一轮排查中的第二个发现（另一台 preset 插件）：

- 检测有效：`idle-loop-guard.log` 共 9 次 `FIRE`，`textChars=0` 恒成立（无 tool call 的纯空转 step）
- **注入无效**：警告文本确实进了对话（`role:'user'` 的注入消息），模型照旧继续写分析不调工具——「检测 ✅ 注入 ✅ 行为改变 ❌」
- 修法：加 `escalateAfter`（默认 2），第一次注入警告、第二次直接 `agent.cancel({ kind: name, reason: 'consecutive-idle-steps' })`，参考 `stall-guard` 的做法——对话消息无法强制任何行为，**只有 cancel 能**
- 已知小 bug：`if (frame?.type === 'text-delta')` 从来没匹配上（`textChars` 恒 0），说明 `agent/assistant-stream` 的 frame 真实取值与猜测不符；不影响主判据（`0 <= maxText` 恒真），待单独确认 frame 类型
- 部署：preset `.mjs` **不参与 HMR**，改完必须重启 dsh 才加载；验收看日志是否出现 `ESCALATE sess=... fires=2 steps=N — cancelling turn`（只有 `FIRE` 没有 `ESCALATE` ⇒ `agent.cancel()` 调用形状不对，需对齐 `stall-guard`）

## 相关源文件

- `C:\Users\27063\.dsh\storages\tools\wake-guard.ps1`（判定逻辑，改后 137 行，含备份 `wake-guard.ps1.bak-20261027-163910-pre-action-aware`）
- `C:\Users\27063\.dsh\storages\tools\wake-guard-setup.ps1`（注册脚本，本次未改）
- `C:\Users\27063\.dsh\logs\wake-guard.log`、`wake-guard-setup.log`
- `.agent-presets/anchored-standard/idle-loop-guard.mjs`（改后 239 行；参考 `stall-guard.mjs`）
- `C:\Users\27063\.dsh\logs\idle-loop-guard.log`
