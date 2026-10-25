---
id: "c45d2064-e5ea-43a2-871b-cac54b75728c"
title: "D 盘整盘写失败（Access denied）排查：ACL/磁盘标志全部正常、卷级只读嫌疑与修复路径（2026-10-04）"
description: "D 盘（游戏与存档所在卷）在 2026-10-04 15:33 后所有写操作 Access denied 而读正常；NTFS ACL、磁盘/分区只读标志、Win32_LogicalDisk.Access、卷健康、剩余空间、Defender 状态全部正常，指向进程外因素（过滤驱动/sandbox）或卷只读。含实测矩阵、无法自证的部分与「重启 → chkdsk D: /scan → diskpart attributes volume clear readonly」修复顺序，以及存档损坏风险提示。关联 Minecraft 性能取证 d43e5f2d。"
status: "active"
created_at: "2026-10-04T07:52:12.569Z"
updated_at: "2026-10-04T07:52:12.569Z"
content_hash: "a5be8518006417fcbd70daeb9b5b81724dd8bc6f0ff7331b56e2f05627d12264"
source_paths:
  []
session_ids:
  - "8f08fdb4-2bbe-4e13-9421-b923027c3509"
memory_body_ids:
  []
---

# D 盘整盘写失败（Access denied）排查记录（2026-10-04）

## 症状与时间线

- 观测时间：2026-10-04 15:3x–16:xx，Windows，Git Bash + PowerShell 双路验证。
- **D 盘所有写操作被拒**，读操作完全正常；`D:\MINECRAFT\...\saves\` 同样被拒。
- **最后一次成功写入：15:33**（`D:\MINECRAFT\staging\ch.json`、`chs.json` 由此产生）。之后所有写操作失败。
- 注意 Git Bash 侧 `/d/MINECRAFT` 是符号链接 → 真实路径 `D:\50-游戏\MINECRAFT`，两类路径均只读。

## 实测矩阵（全部在本机跑过）

| 检查项 | 结果 |
|---|---|
| `bash touch` / `>` / `>>` / `rm` / `mv` | ❌ Permission denied |
| PowerShell `Set-Content` / `.NET [IO.File]::WriteAllText` | ❌ Access to the path ... is denied |
| `cmd >` 重定向 | ❌ Access is denied |
| `D:\` NTFS ACL（icacls） | `Authenticated Users:(M)` = Modify，**无任何 Deny ACE** ✅ |
| `D:\MINECRAFT\staging` ACL | 正常继承 `(I)`，同样是 Authenticated Users Modify ✅ |
| 磁盘 / 分区 `IsReadOnly`（Get-Disk / Get-Partition） | `False` / `False` ✅ |
| `Win32_LogicalDisk.Access` | `0`（可写）✅ |
| CIM 卷只读标志 / 卷 HealthStatus / OperationalStatus | `0` / Healthy / OK ✅ |
| 卷信息：Size ≈ 701 GB，SizeRemaining ≈ 106–114 GB | 空间充足 ✅ |
| Defender 实时保护 | `RealTimeProtectionEnabled: False`、`AntivirusEnabled: False`、`IsTamperProtected: False` |
| Defender 受控文件夹访问（CFA）查询 | ❌ `Get-MpPreference` 报 `0x800106ba`（组件不可用，无法读取该开关） |
| 第三方杀软枚举 | 只有 `Windows Defender`，productState `393472` |
| `fsutil dirty query D:` | ❌ `Error 5: Access is denied`（无法读 dirty bit） |
| 系统事件日志中的磁盘/文件系统错误 | 空 |
| **C 盘对照写测试**（`C:\Users\27063\Desktop`、`AppData\Local\Temp`、dsh 目录） | ✅ 全部成功 |
| 其他 D 盘子目录（`D:\MCBackup`、`D:\Temp`、`D:\50-游戏`） | ❌ 全部 Access denied |

**结论方向**：NTFS 权限、ACE、磁盘/分区只读标志、卷健康、空间、杀软实时保护**全部正常**，却对整卷（含多个无关子目录）的写操作统一拒绝 —— 说明问题不在 ACL 层。

## 存档损坏风险（已提示用户）

存档、日志、`options.txt` 全在 D 盘。**MC 写盘失败时会反复重试并吞掉异常** ⇒ 轻则本局进度不落盘，重则 `level.dat` 半写坏。**修好之前应只读档游玩，不要存新进度。**

**旁证**：`D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\logs\latest.log`（8.87 MB）最后一条是
`[0410月2026 15:02:17.832] [Render thread/INFO] [net.minecraft.client.Minecraft/]: Stopping!`，
但用户 F3 截图右上角时间为 **16:29:00** ⇒ 那次运行没能写出日志，因为日志文件在 D 盘。

## 唯一无法由 agent 自证的关键区分

CLI 进程与用户桌面会话的权限判定可能不同，因此**无法在进程内区分**两种可能：

1. **只读只作用于该 CLI 进程**（安全软件 / sandbox / 过滤驱动在拦）⇒ 游戏本身没事，重启通常恢复；
2. **整个卷只读**（卷标志 / dirty bit / 挂起中的过滤驱动）⇒ 需按下面顺序修。

**区分手段（需要用户操作）**：在桌面新建 txt，用资源管理器拖到 `D:\` 根目录。
- 能粘贴 ⇒ 情形 1；
- 粘不进去 ⇒ 情形 2。

## 修复顺序（重启优先）

1. **重启电脑** —— 覆盖大多数情况（dirty bit、挂起中的过滤驱动、卷标志残留）。
2. 重启后**管理员 CMD**：
   ```
   chkdsk D: /scan
   diskpart
     list volume
     select volume D
     attributes volume               ← 看是否显示 Read-only
     attributes volume clear readonly  ← 若上面显示 Read-only
   exit
   ```
3. 若 `chkdsk` 报文件系统错误 ⇒ **先把 `D:\MCBackup\` 那份镜像拷到 C 盘或移动硬盘**，再考虑 `chkdsk D: /f`（镜像脚本见 6b3159c7）。

## 未完成 / 未验证

- 根因未确定：排查结束时正等待用户回复「桌面 txt 能否拖进 D 盘」，修复未执行。
- `Get-MpPreference`（0x800106ba）与 `fsutil dirty query`（Error 5）两项因权限/组件问题拿不到值，排查链上留有两个洞。
- 上述状态是 2026-10-04 的快照；重启或时间推移后需重新实测确认（写测试约 1 分钟即可复现）。

## 关联

- d43e5f2d：同一实例的 tick 掉帧取证（F3 `T:` 字段证伪、createharmonics 跨线程粒子洪泛、spark 诊断流程）；本次性能优化计划因 D 盘只读而暂停。
- 6b3159c7：`D:\MCBackup\backup-mc.ps1` 镜像备份脚本，是修复顺序第 3 步的前提。
- 422e3c22：PCL2 导出撑爆 C 盘的诊断（同机 C/D 盘空间账背景）。
