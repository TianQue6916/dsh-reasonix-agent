---
id: "67873213-f563-4655-b614-91628a801db5"
title: "AcRecoverySwitch 机理定案（EC 充电状态边沿，BiosSupport=0）与 wake-guard 2026-10-29 修复：Reboot 第一顺位隔离、连发拦截、-match 大小写踩坑"
description: "接 b3d6ec11 之后的机理修正与脚本实现：OEM\\GamingCenter2 注册表证据显示 AcRecoverySwitch 为同方 EC 固件逻辑（BiosSupport=0），判据是「未充电→充电」状态翻转而非 AC 电平或 BIOS Power On after AC Loss；含时刻插电用户的选项收敛（A 关开关 / B guard 兜底）、wake-guard.ps1 六分支干跑验收、PowerShell -match 忽略大小写导致 -34.5s 负数间隔的隐蔽 bug，以及 USB S5 给电为何触动不了该判据。"
status: "active"
created_at: "2026-10-29T05:48:22.989Z"
updated_at: "2026-10-29T05:48:22.989Z"
content_hash: "0bccc5f8b0851eda2c82b7ea4349a5c1779f2cb9f28d6b7c06ffe02bb5906ac2"
source_paths:
  - ".dsh/storages/tools/wake-guard.ps1"
  - ".dsh/logs/wake-guard.log"
  - ".dsh/plans/session-d7523965-42f8-4548-855d-99d4598eeb90.md"
session_ids:
  - "c366b024-6d7e-488d-91e0-285f4b3828f6"
memory_body_ids:
  []
---

# AcRecoverySwitch 机理定案与 wake-guard 修复（2026-10-29）

前置文档（不在本文重述）：
- `f7c9342c-8f53-4d5f-a8b7-405828718eae` —— 现象与 60 天 26 次实证、逐项排除清单
- `b3d6ec11-22d3-4927-b573-c994490638a2` —— 2026-10-27 查出 Kernel-Power 109 缺 Action 维度、Reboot 连环关机
- `94d97a1a-bb18-4ec4-8dba-d50eaf88c7b3` —— 小米插座两条路判死

本文记录 2026-10-29 的**机理修正**与**脚本实现**。b3d6ec11 把判据收敛到「109 时间戳 + Action」，但没解释**为什么** S5 后 13~21 秒会重新加电；这次把开关的物理落点挖出来了。

## 一、机理修正：判据是 EC 的「充电状态边沿」，不是 AC 电平

### 配置层证据（实测读取）

```
HKLM\SOFTWARE\OEM\GamingCenter2\MySetting\AcRecoverySwitch = 1
HKLM\SOFTWARE\OEM\GamingCenter2\ItemSupport\AcRecoverySwitchSupport     = 1
HKLM\SOFTWARE\OEM\GamingCenter2\ItemSupport\AcRecoverySwitchBiosSupport = 0
```

`AcRecoverySwitchBiosSupport = 0` 是关键：**BIOS 没有这个开关**（进 BIOS 找不到是正常的），逻辑在**同方 EC 固件**里，控制中心（`GCUBridge.exe` + `UWACPIDriver` + `UEFI_Firmware.dll`）只是它的面板。

这推翻了先前的两个假设：
1. 不是 BIOS 的 `Power On after AC Loss` 策略 —— BIOS 无此项
2. 不是「AC 边沿」（适配器断电/来电）—— 用户最早的质疑「电源一直插着也会自启」是对的，AC 电平自始未变

### 判据原文（控制中心 UI 文案，唯一权威表述）

> 由**未充电状态**改变为**充电状态**时自动开机（保持充电状态关机不会自动开机）

### 重建出的链条

```
① 电池满（RemainingCapacity == FullChargedCapacity == 80080）→ EC 停充 → Charging=False
② 用户关机 → S5
③ 关机后 +5VSB 耗电 / 电池自放电 / EC 重新采样
④ 电量微降 → EC 恢复补电 → 状态翻转为「充电」
⑤ 该 0→1 翻转被 AcRecoverySwitch 逻辑捕获 → 加电 → 完整 POST（Kernel-Boot 27 BootType=0x0）
```

一次吻合的实测快照：`RemainingCapacity=80080 / FullChargedCapacity=80080`，`Charging=False`，`ChargeRate=0`，`PowerOnline=True`。

该链条解释了此前所有怪现象：13~21 秒延迟（EC 采样周期）、约 35% 而非 100% 的触发率（满电锂电电压/容量读数在阈值附近的抖动，受温度与老化影响）、「第二次关机常能关住」（状态机已稳定，无新翻转）、08-28/09-11/09-25 连发三次（那晚电池反复跨阈值）。

**推论**：只要电池常住满电，这就是概率问题，配置层没有稳定规避手段——翻转的另一端「充电中」需要电池真的不满。

## 二、选项收敛（用户为「时刻插电」型，放电 A/B 实验已撤回）

曾提出的「把电池放到 50% 再关机做对照」被撤回：用户时刻插电，放电等于要求用户改使用习惯去迁就 bug，不成立。

| | 做法 | 得到 | 失去 |
|---|---|---|---|
| A | 关掉 `AcRecoverySwitch` | 彻底不再自启 | 失去「插座断电→通电」的远程开机（主板无 WoL 替代品） |
| B | 保留开关 + wake-guard 兜底 | 远程开机保住 | 约 1/3 的关机要「亮 15~20 秒再自己关掉」 |

「电池健康保护浮充」曾作为窄路被检验并**自我否决**：若 EC 在保护上限处保持 `Charging=True`，则远程开机时同样没有 0→1 翻转，会把远程开机一起废掉。结论：判据设计成「充电状态边沿」，就意味着「稳态不自启」与「边沿时能开机」不可能同时成立。

用户已拍板选 **B**，A 保留为退路。

## 三、wake-guard 修复（2026-10-29，六分支干跑全过）

脚本：`.dsh/storages/tools/wake-guard.ps1`（157 行）；日志 `.dsh/logs/wake-guard.log`；`WakeGuard` 计划任务（AtStartup + Delay=PT20S + SYSTEM）**无需重装**，路径与参数未变。

### 用户的硬约束

> 「别影响我手动重启就行，上次就是影响了我自己修改了」

10-27 的连环关机事故即源于把用户「重启」判成假自启。落实现：**`Reboot` 放行分支置于分流第一顺位，命中即 `exit`，后续 gap 判定 / 循环保护 / 关机命令一行都执行不到**，并在源码注释里锁死。

### 三处缺陷修复

| 缺陷 | 后果 | 修法 |
|---|---|---|
| guard 自己发的 `shutdown` 把上次 Action 改写成 `Shutdown` → 一律放行 | 连发中的第 2、3 次漏拦（10-27 实际发生） | 新增 `Get-LastPhantomTime`：距上次本脚本关机 < `BurstWindowSeconds`(150s) 则继续判 gap |
| `shutdown /s /t 0 /f` 强制立即关 | 数据风险虽小但非必要 | 改 `/t 10`（保留 `/f`），10 秒内可 `shutdown /a` 撤销 |
| 阈值 60 秒 | 10-27 出现 gap=100s 的漏网 | 配合 burst 标记后不再靠放宽阈值兜底；循环保护由 1 小时 3 次放宽到 5 次以容纳连发 |

另加**保命开关**：`logs\wake-guard.off` 文件存在即完全空转；彻底停用另有 `schtasks /delete /tn WakeGuard /f`。

### 六分支干跑验收（对应真实日志）

1. `Reboot` → `OK: Reboot — never touched`（硬约束）
2. `Shutdown`，8 小时前有 PHANTOM → `OK: leaving alone`（窗口外）
3. `Shutdown` + 大 burst 窗口 → `BURST → OK: normal boot`
4. `Shutdown` + BURST + 小 gap → `BURST → would shut down in 10s`
5. `Shutdown Off` + 大阈值 → 真·假自启路径 → `would shut down in 10s`
6. 真实状态（不注入）→ `OK: leaving alone`

**残留风险（已向用户明示）**：关机后 60 秒内又手动开机，仍可能被误判一次；有 10 秒缓冲可 `shutdown /a` 取消。

## 四、踩坑：PowerShell `-match` 忽略大小写

旧正则 `.*PHANTOM` 匹配日志时，**`-match` 默认大小写不敏感**，命中了说明行

```
OK: last transition was Shutdown ... — not a phantom boot
```

里的小写 `phantom`，于是「上次 guard 关机时间」被解析成该说明行的时间（12:13:39），算出 `boot − phantom = **−34.5 秒**` 的负数间隔，再被 `-lt 0` 判为无效 → **连发分支永远走不到**。

修法：改 `-cmatch` 并精确匹配 `PHANTOM: shutting down`。

教训：这个 bug 只有把各分支逐个干跑打出来才会暴露，**光看代码看不出来**。干跑注入参数（`TestAction` 等）值得保留在脚本里。

## 五、USB S5 给电为何触动不了该判据（用户提问的结论）

用户接线：以太网线直连另一台电脑（Realtek 2.5GbE，ICS 共享），Type-C 接移动 WiFi（`Remote NDIS` RNDIS，150 Mbps，是事实上网通道）。

- **不会烧主板**：S5 下 USB 供电是笔记本标准功能（USB PowerShare / Always-On USB），MiFi 功耗约 2.5~5W，在口的能力内。唯一物理风险是**供电不足**导致 MiFi 欠压-重启-回弹循环，而这种周期性波动反而可能**增加**假边沿。
- **对抖动开机期望值极低**：USB 负载从适配器→主板 5V 轨取电，**不经过电池充放电回路**，`Charging` 仍为 `False`，判据原封不动。若按旧的「适配器空载漂移」机理算，5W / 180~230W ≈ 2%，仍属轻载区，量级不够。
- **真实收益在别处**：S5 期间 Type-C 不断电 → MiFi 不掉电 → 远程开机回来后网络立即可用，不必等 RNDIS 重连。
- **注册表找不到该开关**：`HKLM\SOFTWARE\OEM` 全树搜 `USB|PowerShare|OffCharge|AlwaysOn` 零命中；`MySetting` 下仅 8 项（AcRecoverySwitch / CopilotKey / DeepSleep / DisplayFeatures / GpuConfig / HighPerformancePowerMode / lcdOverdrive / LocalDimming）。说明由 `GCUBridge` 内存态管理或存 EC NVRAM，**只能从控制中心 UI 切**。
- 若智能插座断电，USB 供电转由电池承担（80Wh 可撑十几小时），不宜长期挂着。
- 判据方法：开该功能后连续关机 ≥5 次，比对 `wake-guard.log` 中 `CHECK|PHANTOM` 的频率——0 次可继续观察，≥2 次即无改善。

## 六、排除项：BIOS 是原厂的

`BIOS_PROJECT_ID = IDW`（与机型匹配）、`IsNvGpu = 1`（吻合 RTX 5070）、`AcRecoverySwitchSupport = 1`（功能位图自洽）、`BIOS = N.1.21MRO16 (2025-07-24)`，用户称未刷 BIOS。若刷错板号，`ItemSupport` 位图会大面积错位；本机自洽，故**社区「刷极光Pro BIOS 导致关机必自启」的线索不适用**。

## 待办

- 源头判据在 EC 固件内，改不动。只要 `AcRecoverySwitch=1` 就仍会有约 1/3 关机经历一次「亮 10 秒再关」。
- 用户若日后觉得烦：把 `AcRecoverySwitch` 置 0 并让 `GCUBridge` 重新下发，代价是远程开机一并失去（此时 WakeGuard 可留作残留假边沿兜底）。
