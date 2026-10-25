---
id: "f7c9342c-8f53-4d5f-a8b7-405828718eae"
title: "关机后 13 秒自动开机（S5 后冷启动）定位为 Realtek 网卡 Wake-on-Pattern：60 天 26 次实证、排除清单与 why-checks-lie（2026-10-25）"
description: "实测调查记录：以 Kernel-Boot 27 BootType=0x0 为分水岭，证明「关机完成后 13~21 秒主板被重新加电冷启动」而非唤醒/假关机；60 天 26 次（26/74 次关机≈35%，含三次「关→启→关→启」三连）；逐项打掉 waketimers/hiberboot/lastwake/wake_armed/RTC/AC 掉电等嫌疑并说明这些检查为何会骗人；剩下 Realtek S5WakeOnLan+WakeOnPattern+10Mbps 保链路的完整因果链；方案 A/B/C 与三个可量化验证实验；附带两次真实 bugcheck（0xEF / 0x154）与 S0ix 被键盘唤醒属独立议题。"
status: "active"
created_at: "2026-10-25T06:16:23.960Z"
updated_at: "2026-10-25T06:16:23.960Z"
content_hash: "6b13e61ebe59cfca5f93f77a24e46df6201d4ebe8b5d3b58a2bec43683877d2f"
source_paths:
  - ".dsh/PLAN.md"
session_ids:
  - "25e03216-b996-49aa-a30c-42140d025aad"
memory_body_ids:
  []
---

# 关机后自动开机（S5 冷启动）定位为网卡 Wake-on-Pattern（2026-10-25）

> 用户报告「笔记本关机后又自己开机好几次」。本文是用 System 事件日志做的实证定位，不是猜测。原始计划文件：`C:\Users\27063\.dsh\PLAN.md`。

## 一、结论

不是「关机后又自动开机」，而是**关机真的完成了（S5），13~21 秒后主板被重新加电、走完整 POST 冷启动**。60 天内 **26 次**同款（74 次关机中 ≈35%），08-28 / 09-11 / 09-25 三晚各出现「关机→自启→再关→再自启」的三连。

指向最明确的一条：**Realtek 有线网卡的 S5 Wake-on-LAN 链路完整使能**，且关机后 PHY 降到 10 Mbps 保持链路、对 pattern 帧唤醒，网线常插。

## 二、关键判据（这套方法可复用）

`Kernel-Boot` **Event ID 27 = 引导类型**，是区分「唤醒」与「冷上电」的分水岭：

| BootType | 含义 |
|---|---|
| `0x0` | 冷启动，完整 POST，固件自己决议上电 |
| `0x1` | 从 hibernate 恢复 |
| `0x2` | 从 fast startup 恢复 |

60 天内 26 次自启 **BootType 全为 0x0** ⇒ 每次都真的断电、真的重新 POST，不存在「假关机」或「从睡眠睁眼」。

配对探针（找出所有 shutdown→boot 的间隔）：取 `Id=109`（Kernel-Power，shutdown 转换）与 `Id=27` 排序后逐个找下一个 27，算 `TimeCreated` 差值。同款探针同时用于事后量化验证。

## 三、单次时间线（10-25 凌晨，逐条对齐）

```
01:59:53  Kernel-Power 506  进入 Modern Standby(S0ix)，原因 Idle Timeout
02:00:39  Kernel-Power 507  退出 S0ix，原因 Input Keyboard   ← 键盘唤醒
02:22:01  1074 User32       Explorer 发起「关闭电源」
02:22:06  1074 User32       winlogon 接管
02:22:08  6006 EventLog     事件日志服务停止
02:22:13  109  Kernel-Power  内核电源管理器启动关闭转换 Action: Shutdown Off  ← 正常 S5
02:22:16  577  Kernel-Power  系统已准备好从 Active 启动
──────── 断电（真正的关机成功）────────
02:22:34  27   Kernel-Boot  引导类型 0x0   ← 冷启动，POST 过
02:22:34  20   Kernel-Boot  「上一次关机的成功状态为 true」← 证明上次是干净关机
02:22:38  125  Kernel-Power  ACPI 热区域枚举（boot 初期）
02:22:40  521  Kernel-Power  可用电池计数变化（boot 初期）
02:22:45  6005 EventLog     日志服务启动
02:22:57  1074 User32       winlogon 再次发起关机  ← 用户看到它自己亮了，又关了一次
02:23:15  109  Kernel-Power  Shutdown Off
──────── 这次真的关住了，直到 13:06 ────────
```

## 四、排除清单 + 为什么这些检查会骗人（最有复用价值的一段）

| 嫌疑 | 检查结果 | 结论 |
|---|---|---|
| Windows 定时唤醒任务 | `Get-ScheduledTask \| ? {$_.Settings.WakeToRun}` → 空 | 排除 |
| `powercfg /waketimers` | 无输出 | 排除 |
| 快速启动/混合关机 | `HiberbootEnabled=0`；`powercfg /a` 明说快速启动被系统策略禁用 | 排除 |
| 睡眠恢复 | 只有 S0ix + hibernate，无 S3；且 BootType 全 0x0 | 排除 |
| `powercfg /lastwake` | 「唤醒历史记录计数 - 0」 | ⚠️ **不能当证据**：从 S5 冷上电，Windows 没参与唤醒，记不到 |
| `powercfg /devicequery wake_armed` | 只列 `HID-compliant mouse` | ⚠️ **不能排除 WoL**：这是 ACPI 唤醒设备表，管 S3/S0ix；S5 的 WoL 走网卡自己的 WAKE#/PME#，不在这张表里 |
| AC 掉电恢复（BIOS Restore AC Power Loss） | 电池在位、状态 OK、100%（`BatteryStatus=2` 正在 AC 供电） | 基本排除：电池在位时 S5 掉 AC 不会加电 |
| BIOS RTC 定时开机 | 延迟仅 13~21 s，且第二次关机后不再触发（非周期性） | 排除 |
| S0ix 自唤醒 | 01:59:53 进 → 02:00:39 被 `Input Keyboard` 叫出 | 另一件事，见文末 |

## 五、机理链

Realtek Gaming 2.5GbE 的 `Get-NetAdapterAdvancedProperty` 相关项：`S5WakeOnLan=开启`、`*WakeOnPattern=开启`、`*WakeOnMagicPacket=开启`、`WolShutdownLinkSpeed=10 Mbps 优先`、`*PMARPOffload`/`*PMNSOffload=开启`。Intel AX201 的 `*WakeOnMagicPacket`/`*WakeOnPattern` 亦启用（`*ModernStandbyWoLMagicPacket` 关闭）。Realtek 另有 `EnableGreenEthernet=开启`、`PowerSavingMode=开启`、`AdvancedEEE/EEE=关闭`。

```
① 关机 → Windows 走完 S5（109 Shutdown Off）
② 主电源断，+5VSB 仍在（BIOS 未开 ErP）→ 网卡继续带电
③ 驱动关机前下推 pattern 表：ARP、NS、若干广播/组播
④ PHY link down → 交换机端口重新协商 → 网卡以 10 Mbps 重起链路  ← 这几秒决定固定延迟
⑤ 局域网第一批匹配帧：路由器 ARP 探测 / IPv6 RA-NS / DHCP / SSDP / mDNS / LLMNR
⑥ pattern match → 拉 WAKE#/PME# → 主板从 S5 加电
⑦ 完整 POST → BootType 0x0 冷启动
```

解释了两个现象：**延迟恒定在 13~21 s**（是链路重建+首批广播的相位，不是等唤醒源，离群的 31/33/59 s 是错过一波广播等下一波）；**概率约 35%** 且有时连起 2~3 次（后几次关机相位躲开广播）。

## 六、待验证的强线索（不要当铁证）

`Win32_ComputerSystem.WakeUpType = 6`（SMBIOS Type 1，6 = LAN Remote）。若该字段由 BIOS 动态填写，就是直接指认 WoL 的铁证；但同方模具（`MECHREVO KUANGSHI-JIGUO Series-X6xx55xW-B2`，BIOS `N.1.21MRO16` / 2025-07-24）可能写死，故只当待验证线索。另有 `Kernel-Power 41` 在 10-18 12:36（`BugcheckCode=239` / 0xEF CRITICAL_PROCESS_DIED）与 10-23 09:51（`340` / 0x154 UNEXPECTED_STORE_EXCEPTION），两次 `PowerButtonTimestamp=0`（非长按电源）。

## 七、社区共识（spurious wake 的来源）

做低延迟/渲染农场/串流主机的脚本普遍「只留 magic packet、关掉 pattern wake」：`hayhamLT/render-farm-tracker` 的注释直写 `wake on magic packet ON, pattern wake OFF (no spurious wakes)` 并点名 `S5WakeOnLan`；`ByKsTv/Everything` 用 `Set-NetAdapterPowerManagement -WakeOnPattern ... -WakeOnMagicPacket ... -DeviceSleepOnDisconnect Disabled -SelectiveSuspend Disabled`。中文社区老经验同样成立：笔记本关机后自动开机先查网卡 WoL 与 BIOS ErP，最后才怀疑电源键。

## 八、三个方案（需管理员，用户未拍板）

- **A（推荐，最小可逆）**：只关 `*WakeOnPattern`（有线 + Wi-Fi），保留 magic packet ⇒ 精确、可逆、保住远程开机。若有效即反向证明是 pattern wake。
- **B（彻底）**：再关 Realtek 的 `S5WakeOnLan` ⇒ 切断 S5 唤醒通道；代价是失去关机状态远程开机（该机有 ToDesk/Sunshine/Parsec，这条可能想要）。
- **C（固件层）**：BIOS 开 `ErP` / `ErP Ready` ⇒ S5 下 +5VSB 全断，网卡收不到包；代价是失去关机充电与全部 S5 唤醒，同方模具 BIOS 隐藏项较多。

命令形态（A）：`Set-NetAdapterAdvancedProperty -InterfaceDescription "<网卡名>" -RegistryKeyword "*WakeOnPattern" -RegistryValue 0`；改后回读 `Get-NetAdapterAdvancedProperty` 校验并保留回滚行。

## 九、三个验证实验

1. **拔网线对照（零成本）**：关机前拔网线 → 不自启则锁定有线 WoL，方案 A 可解；仍自启则转 ErP/USB-HID/电源键。
2. **改后量化验证**：跑 §二 的 109→27 配对探针，判据是**不再出现 ≤120 s 的 off->boot**。
3. **验证 WakeUpType 是否动态**：手动关机→手动按电源键开机→读 `(Get-CimInstance Win32_ComputerSystem).WakeUpType`。变 `7`（Power Switch）⇒ 该字段动态，此前读到的 `6` 即 LAN Remote 的确凿证据；仍 `6` ⇒ 写死，线索作废。

## 十、必须分开的两条独立线索

1. **两次真实 bugcheck**（10-18、10-23 的 Kernel-Power 41）与「关机后自启」是两条线，别合并解释；`0x154` 与存储栈相关（休眠文件/SSD/内存），值得单独查一趟，10-23 那次上一次关机被标记为意外（凌晨自死）。
2. **S0ix 被键盘唤醒**：idle timeout 进 S0ix 后 1 分钟被 `Input Keyboard` 叫醒，属另一个开关（`wake_armed` 里的 HID 设备），与网卡无关。

## 关联

- `2bb56d7b-7c23-4366-8755-e0a3df00fa56`（SSD 耐久诊断）：同机同口径的事件日志分析、Modern Standby 影响口径；`0x154` 排查可接这条线。
- `ad6d091a-eaaf-4b78-8754-117b96d23c74`（C 盘审计）：同一套「用 System.evtx 重建时间线、证伪表面指标」的方法论。
