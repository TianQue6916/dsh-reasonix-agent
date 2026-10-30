---
id: "c6ce35f6-1c63-45a0-9de0-9ecd91ded84f"
title: "本机 eDP 面板鉴定（X1 Carbon 7th / LGD LP140QH2-SPD1 IPS LCD）：无 OLED burn-in 风险 + 取证路径"
description: "2026-10-30 实测 Linux 主力机 eDP 面板：ThinkPad X1 Carbon 7th (20R10004CD) 内屏为 LGD LP140QH2-SPD1 IPS LCD（WLED 背光），故无 OLED burn-in 风险，只有均匀背光光衰。含「i915 走 VBT 导致 /sys/class/drm/*/edid 为 0 字节、需 root+modetest/i915_display_info 取真实 EDID」的取证坑，以及 intel_backlight 节点作为 LCD 判据、burn-in vs image retention vs 背光光衰的失效模式区分。可复用于任何「这块屏会不会烧屏/是什么面板」的判定。"
status: "active"
created_at: "2026-10-30T12:16:39.257Z"
updated_at: "2026-10-30T12:16:39.257Z"
content_hash: "c1735e947e61ee096e0d89e806147834fbb600f5e8d68e96f7965d53e7631298"
source_paths:
  []
session_ids:
  - "2c5c73bc-351a-44f8-bb7d-6e445dd9f6ae"
memory_body_ids:
  []
---

# 本机 eDP 面板鉴定：ThinkPad X1 Carbon 7th = IPS LCD，无 burn-in 风险

时间：2026-10-30。起因：用户问「我这台电脑硬件会烧屏吗」，引发对 Linux 主力机内屏面板类型的实测取证，同时暴露了记忆里设备身份的混淆（「机械革命」vs「X1 Carbon」）。

## 结论

- 跑 dsh 的这台 Linux 机 = **ThinkPad X1 Carbon 7th（20R10004CD）**，Intel Comet Lake-U + UHD 核显（`lspci` 00:02.0）。
- eDP 内屏 = **LGD05EE / LP140QH2-SPD1**，2560×1440 @ 59.998Hz，309×174mm，8bpc，gamma 2.2。
- 面板规格（panelook 交叉验证）：a-Si TFT-LCD、IPS Normally Black **Transmissive**、300 cd/m²、700:1、76% NTSC、**WLED 背光 15K 小时**。
- 因此 **不存在 burn-in 风险**；该机的老化路径只有 **背光光衰**（均匀、无空间结构），不是 OLED 的 differential aging。

## 取证路径（可复现，含一个关键坑）

1. **坑**：`/sys/class/drm/card1-eDP-1/edid` 读出来是 **0 字节**。i915 走 VBT 而非从面板 EDID 取时序，所以 sysfs 不暴露 EDID。外接口（DP-1/DP-2/HDMI-A-1）同样 0 字节，因为都处于 disconnected。
2. 绕法：root 下从 `/sys/kernel/debug/dri/0/`（`i915_display_info` / 直接读 EDID）或 `modetest -c` 拿真实字节，落盘后用 `edid-decode` 解。
3. EDID 解码出三层互证：
   - 原始字节 `30 e4` → PNP ID **LGD**（LG Display）；product code `0x05EE` = 1518。
   - 字符串描述符 `00 fe 00 4c 50 31 34 30 51 48 32 2d 53 50 44 31` → **LP140QH2-SPD1**。
   - DTD1 2560×1440 @ 59.998Hz，与 X1C7 的 WQHD 选项吻合。
4. **辅助判据（很好用）**：`/sys/class/backlight/intel_backlight`（type=raw，max_brightness=24242）存在 ⇒ 有外部背光 ⇒ LCD。OLED 自发光，亮度走像素电流 / ABL，不会挂 backlight 节点。
5. `edid-decode` 在 `/usr/bin/edid-decode`，本机已装。

## 概念区分（用于回答同类问题）

- **burn-in（OLED）= differential aging**：`D(x,y) = ∫ dt / t_95(L(x,y,t))`，`t_95 ∝ L^-n`，n≈1.5–2。失效在空间上**非均匀**，图样 = 静态 UI 掩膜经扩散核低通。
- **image retention（LCD）**：PI 层离子迁移 / 残余 DC 造成的局部预倾角偏移，分钟到小时自行消失，不是损伤。
- **背光光衰（LCD）**：`D(t) = ∫ dt / t_70(L̄(t))`，空间上**均匀**，整屏乘一个标量，平滑可预期。

## 遗留待确认

- Windows 侧「天阙九泉」机器的型号仍未核实（记忆登记为机械革命）。机械革命 2025 年起有 OLED 机型（星耀 14/15、无界 14 Max Carbon、耀世 16 Pro/15 Air/16 Ultra），若属这些型号则确有 burn-in 风险；判据是用 `Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID` 取 ManufacturerName + UserFriendlyName，再去 panelook 查。拿到型号后应一并修正记忆里的设备条目。

## 关联文档

- `51a8e7e4-4a8c-4da8-9ec7-f874e7160e20`：同机型（X1C7 20R1）的电池充电阈值取证。
- `84cfe2b6-3f3c-4679-b7d7-774bb08e2508`：EDID 单模式锁死判定（平板扩展屏），与本文同属 EDID 取证方法论。
- `f9b34e15-13bb-426a-9c73-043676ee57cd`：机械革命内屏 BOE NE160QDM-NZL（同样是 LCD）的 HDR 校准。
