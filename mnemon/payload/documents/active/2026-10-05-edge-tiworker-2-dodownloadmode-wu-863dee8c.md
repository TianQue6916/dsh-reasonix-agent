---
id: "863dee8c-69fa-4da7-87ef-8555e7b60011"
title: "写入放大归因第二轮（2026-10-05）：Edge 逻辑写是假值、TiWorker 装累积更新只占日写入 ~2%、DODownloadMode 与 WU 治理事实核查"
description: "2026-10-05 实测复查主力机 ~62 GB/天 磁盘写入：60s 窗口 45× vs 300s 窗口 2.8× 的采样假象、msedge renderer 的 Mojo IPC 逻辑写不落盘、SoftwareDistribution\\Download 2.78 GB/21 万文件 = TiWorker/DISM/TrustedInstaller 正在装累积更新（WU 摊到每天仅 1–1.5 GB，约占 2%）、DODownloadMode 正确语义（0=HTTP only，100 已弃用）、WaaSMedicSvc 先于 DoSvc、以及「直接写 registry policy 会被剪掉」在无真 GPO 的 workgroup 机器上不成立的实测反例。关联 2bb56d7b（SSD 耐久曲线）与 c97a2a01（InstallPending 根因）。"
status: "active"
created_at: "2026-10-05T04:11:36.947Z"
updated_at: "2026-10-05T04:11:36.947Z"
content_hash: "3760e1081952ad31037ebb0d8c51782c223affc3c7255eb2b63722a33ecfa2a9"
source_paths:
  []
session_ids:
  - "8679e54c-90b7-4507-afac-e139c7814dd2"
memory_body_ids:
  []
---

# 写入放大归因第二轮（2026-10-05，主力机）

承接 [Kingston OM8TAP41024K1-A00 SSD 耐久性诊断](doc:2bb56d7b-7c23-4366-8755-e0a3df00fa56) 的「写入源排名」，
以及 [2026-10-05 InstallPending 根因定案](doc:c97a2a01-a6de-4ed5-951c-52cb0d00cd2b) 的累积更新线索。
本轮目标：把用户追问的「谁在写 ~62 GB/天」逐项排除，并纠正两处自己的错误判断。

## 1. 采样窗口本身就会造假（方法论结论，可复用）

同一台机器、同一天，两次 `io-diff.ps1` 窗口给出完全相反的结论：

| 窗口 | 物理盘写入 | 折算 | 逻辑总写入 | 放大 |
|---|---|---|---|---|
| 60 秒（约 11:22） | 23.78 MB | ~0.4 MB/s → 33 GB/天 | 1,074 MB | 45× |
| 300 秒（11:30–11:35） | 2,282.87 MB | ~7.8 MB/s → 641 GB/天 | 6,417 MB | 2.8× |

两者相差 **19 倍**，说明写入是**爆发型**而非稳态。
**教训：用短窗口的放大比（45×）去推日写入量，会得到虚假的高 WAF；至少 5 分钟窗口才具备定性资格。**
脚本与产物：`C:\Users\27063\AppData\Local\dsh-diag\io-diff.ps1`、`io-diff-5min.txt`。

## 2. `msedge#5` 的逻辑写是假值（排除 Edge）

- 进程身份钉死：`msedge#5` 的 PID = `msedge.exe --type=renderer --pdf-upsell-enabled`；
  同组 `msedge#2` = `--type=gpu-process`。
- 特征对照：renderer 逻辑写 ≈ 8.8 MB/s，GPU 读 ≈ 8.8 MB/s —— 量级相等、方向相反，
  这是 **renderer → GPU 的 Mojo IPC 数据流**在计数，物理上不碰磁盘。
- 曾观察到 `msedge#5` 逻辑写 8702.8 KB/s / 987 WrOps/s（每笔约 8.8 KB，形似 WAL），
  而同期物理盘仅 211.7 KB/s（41×）—— 该「41×」是 IPC 噪声，不是 WAL，不是真实落盘。
- 第一轮 300s 窗口里逻辑写 2,590 MB 与物理盘 2,283 MB「吻合 88%」，属**巧合**：
  一个窗口抓在 cache 未满时，另一个窗口正好撞上系统真实落盘。

**结论：Edge 不是写入源；`--type=renderer` 的逻辑 IO 计数不能当作磁盘写入证据。**

## 3. 真正的现场：Windows 累积更新正在展开安装

同时在场并互相印证：

```
C:\Windows\SoftwareDistribution\Download   309,983 files   2,783.9 MB   newest 2026/10/5 11:50:56
C:\Windows\SoftwareDistribution\DataStore       19 files      60.5 MB   newest 2026/10/5 11:51:07
进程: Dism.exe / DismHost.exe / TrustedInstaller.exe / TiWorker.exe
BITS Running/Auto,  wuauserv Running/Manual (PID 24056)
实时物理写入三采样: 11:52:43 6,294 KB/s → 11:52:47 6,810 KB/s → 11:52:51 6,001 KB/s
```

按写入日期分组 `Download` 目录：**210,175 个文件是 2026-10-05 当天**（次日仅 18 个；
另有 98,936 个时间戳 2024-09-06，来自第三方镜像自带时间）。
⇒ **21 万文件的爆发属于当天，不是长期稳态。**

## 4. 但 Windows Update 只占约 2%（关键量化）

更新历史：KB5126052(9/10) → KB5124009(9/23) → KB5124010(9/25) → KB5121794(10/2) → 10/5，**约每周一次**。
单次累积更新在 `Download` 落 2.78 GB / 21 万文件，计入 MFT、目录 entry、`$LogFile`、VSS 快照、
TiWorker 解压重写后，物理写入估计 5–10 GB / 次 ⇒ 摊到每天约 **1–1.5 GB**。
相对实测 ~62 GB/天，**占比约 2%**。

**因此「今天 2.28 GB/5min」是采样撞车，不是主因。** 若只交出这一条结论，会诱导用户去关 Windows Update，
然后发现写入量纹丝不动。
**没有定案前不要动手** —— 30 天按目录的写入扫描（`recent-writes.ps1`，D: 约 130 万文件，`Get-ChildItem` 慢）才是定案依据。

同时被排除的其它假说：`D:\DeliveryOptimization` 是 **junction**（`Attributes: Directory, ReparsePoint`），
其数字在缩小（43 files/4.7 GB → 42 files/4721.7 MB），说明 DoSvc 写的不是它；
`D:\80-系统\{WUDownloadCache, msdownld.tmp, WindowsApps}` 均为 **0 files / 0.0 MB**（空目录，不是写入源）。
「不是 AI 使用造成的」：AI 会话的落盘只有 session 日志，量级 MB/天，与 62 GB/天 差四个数量级。

## 5. Windows Update 治理的事实核查（纠正两处配置理解）

| 事项 | 结论 | 依据 |
|---|---|---|
| `DODownloadMode` | **`0` = HTTP only（不 peer caching），是正确且想要的取值**；昨天设的 0 不该改。`100` = Bypass **在 Windows 11 已弃用**，会让部分内容以 `0x80d03002` 失败 | 社区 baseline（jasonulbright/MECM CI-CB 的 `New-DODownloadModeBaseline.ps1`） |
| `DoSvc` 在 `Manual` 下仍 `Running` | `WaaSMedicSvc`（Update Medic）会把被改动的 UOS 相关服务**恢复原状**；禁用顺序必须先 `WaaSMedicSvc` 再 `DoSvc`，否则 DoSvc 会爬回来 | 社区笔记（kase1111-hash/Bat-Toolbox 的 kill-dosvc README） |
| 「直接写 registry policy 不生效」 | **对本机不成立**。原始出处（balanced7/akashic-aurora `windows-update-control.md`）说的是「真 GPO refresh 会剪掉无主的 `HKLM\SOFTWARE\Policies\…` 值」；本机是 workgroup，本地策略库 `C:\Windows\System32\GroupPolicy\Machine\Registry.pol` 仅 **184 bytes、mtime 2026/8/1**，不存在真 GPO。实测直写的 `DODownloadMode=0`、`AllowTelemetry=0`、`Edge\BackgroundModeEnabled=0`、`Edge\StartupBoostEnabled=0` **全部存活**（跨 02:36 重启 + `gpupdate`）。`gpsvc` 是 Running/Automatic，但那不构成剪除条件 | 本机实测，`HKLM:\SOFTWARE\Policies\…` |

**可复用判据：判断「直写 Policies 键是否会被剪」，先看 `Registry.pol` 大小/mtime 与是否域/装过 LGPO；184 B 的本地策略库 = 不会剪。**

## 6. 社区方案的分级（按本机实际情况）

**A 级（机制清楚、有确定收益）**
1. **别把盘塞满** —— D: 仅剩 16.2%、C: 剩 23.1%，这是唯一直接推高 WAF 的杠杆（QLC 低可用空间下 GC 效率断崖下降）；清到 30%+ 收益最高。
2. **scratch / TEMP 移出这块盘**；大文件反复读写（游戏更新、视频转码、模型权重）放别的介质。
3. **定期清 `C:\Windows\SoftwareDistribution\Download`**（现 2.78 GB / 21 万文件，且 C 盘紧张）。

**B 级（有效但只覆盖 ~2%）**
4. Windows Update 治理：Windows Update Blocker 处理三件套 `wuauserv` / `WaaSMedicSvc` / `UsoSvc`（不是手动 `sc config`）+ LGPO 策略键钉版本。
   owner's manual 记录的策略集：`AU\NoAutoUpdate=1`、`AU\NoAutoRebootWithLoggedOnUsers=1`、`AU\ExcludeWUDriversInQualityUpdate=1`、
   `DoNotConnectToWindowsUpdateInternetLocations=1`、`TargetReleaseVersionInfo="25H2"`、`DeferQualityUpdatesPeriodInDays=30`、`DataCollection\AllowTelemetry=0`。
   清待装更新流程：停 `wuauserv, bits, UsoSvc` → 删 `Download\*` → 删 `RebootRequired` 标志 → `dism /online /cleanup-image /revertpendingactions` → 重启。
   **取舍：会失去自动安全补丁，对大学生主力机建议先不做。**

**C 级（社区在传但收益为负或零，别做）**
5. 禁 `SysMain`、禁 `WSearch`、禁 TRIM、各类「优化大师」—— 前两者是读为主的重活，禁用收益为负。
6. 社区共识：SSD 寿命焦虑被系统性夸大（写到 PB 级才写坏），**为省 20% 写入牺牲系统功能 ROI 很差**。

## 7. 小电脑对照（待补 SMART）

机型已探到：**INTEL SSDPEKKF010T8L**（1 TB，Ubuntu 24.04.5，双系统，`nvme0n1p3` 为 803 G NTFS 挂 `/media/OS`）；
Tailscale 已直连（`direct 192.168.0.106:41641`，ping 5 ms）。
`smartctl` 位于 `/usr/sbin/smartctl`，读 NVMe SMART 需要 root，`sudo -n` 被拒（提示需要密码）—— 需用户在小电脑终端手工执行：
`sudo smartctl -a /dev/nvme0n1`，读 `Data Units Written × 512000 ÷ 1024³` = 主机写入 GiB，`Percentage Used` = 已消耗寿命百分比。
**该盘是企业向 TLC，额度理论上比主力机 Kingston QLC 宽 —— 适合做对照。**
