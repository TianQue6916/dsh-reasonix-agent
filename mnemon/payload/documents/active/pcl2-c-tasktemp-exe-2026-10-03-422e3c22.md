---
id: "422e3c22-e6e8-4238-890a-e99d12534c5c"
title: "PCL2 整合包导出撑爆 C 盘：TaskTemp 双份峰值机制、exe 字符串证据与四层修复（2026-10-03）"
description: "诊断记录：PCL2（Plain Craft Launcher 2）导出 modpack 时把 C:\\...\\AppData\\Local\\Temp\\PCL\\TaskTemp\\<id>\\ 撑到 27.7 GB 导致 C 盘写满、Explorer 卡死。含 Path.GetTempPath 解析链、overrides+mrpack 两阶段 2× 峰值、导出源 75 GB 体量构成（mods 仅 0.19 GB）、junction/setx/robocopy/DISM 修复方案与「预留 2× 体积」纪律。"
status: "active"
created_at: "2026-10-03T15:34:26.961Z"
updated_at: "2026-10-03T15:34:26.961Z"
content_hash: "468555fb885f84e4f963e0290f8e95af9f13751f39097f9c2142f2b3164638af"
source_paths:
  []
session_ids:
  - "685264fd-ced8-44c3-8551-13b629273b97"
memory_body_ids:
  []
---

# PCL2 整合包导出撑爆 C 盘 —— TaskTemp 双份峰值链与修复（2026-10-03）

## 症状
导出 Minecraft 整合包（NeoForge 1.21.1 实例）过程中 C 盘被写满：截图键（Prtscn）无反应、Explorer 卡死。
截图失效是**症状不是故障**：磁盘写满 + 100% 占用时 Prtscn 落盘失败。

## 根因（证据链）
真凶文件（当时存在，事后已随 PCL 自动清理消失，数据留档）：
```
C:\Users\27063\AppData\Local\Temp\PCL\TaskTemp\1349-580162\modpack.mrpack = 27,617.4 MB (27.6 GB)
```
当时 `%TEMP%` 总量 27.7 GB —— 这**一个文件占 99.6%**。
同目录 `...\1349-580162\modpack\overrides\` 下并存 `java21\`、`saves\`、`journeymap\`、`resourcepacks\`、`schematics\`、`config\`。

**关键误解（用户先入为主）**：以为存档"导出到"哪就只占哪。实际上**中间工作目录是硬编码在 C 盘的**，与最终输出路径无关。

### PCL2 的路径规则（直接从 exe 提取 UTF-16/ASCII 字符串得到）
对象：`D:\MINECRAFT\Plain Craft Launcher 2.exe`，大小 5,750,272 B。
```
{0}TaskTemp\{1}-{2}\        {0}ProgramData\PCL\TaskTemp\{1}-{2}\
TryClearTaskTemp   开始清理任务缓存文件夹   已清理任务缓存文件夹   清理任务缓存文件夹失败
... $VB$Local_TempPath.GetTempPath ...
```
- `{1}-{2}` 即运行时的 `1349-580162`。
- `{0}` 来自 `Path.GetTempPath()` —— 即 Win32 `GetTempPathW`，按 `TMP → TEMP → USERPROFILE` 顺序解析环境变量。
- 两个候选模板（`TaskTemp\` 与 `ProgramData\PCL\TaskTemp\`）**全在 C 盘**。

### 两阶段流程 ⇒ 2× 空间峰值（解释了为何占用比内容本身大一倍）
1. 把实例内容**完整复制**进 `TaskTemp\<id>\modpack\overrides\`（第一份副本）
2. 压缩成 `TaskTemp\<id>\modpack.mrpack`（第二份）
3. 才把 mrpack 移到用户选的输出路径

## 导出源体量账本
`D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236`（共 75.11 GB）：

| 子项 | 大小 |
|---|---|
| `saves`（其中 `机械动力` 单存档 27,702.2 MB） | 27.09 GB |
| `backups` | 16.53 GB |
| `机械动力（8.28备份）.zip` | 13.64 GB |
| `journeymap` | 10.32 GB |
| `机械动力尝试（7，31备份）.zip` | 6.26 GB |
| **`mods`（71 个文件）** | **0.19 GB（168.3 MB）** |

⇒ **整合包本体不到 300 MB，99.6% 是存档、地图缓存和旧备份 zip。**
算术：overrides 副本 27 GB + mrpack 27.6 GB ≈ **55 GB 峰值**，全砸在 `C:\Users\27063\AppData\Local\Temp`；当时 C 盘余量不到 30 GB。

`.minecraft` 总量 76.95 GB，几乎全在 `versions\`（77.2 GB）—— PCL 开了**版本隔离**，每个实例的数据在自己目录下。
`versions\` 明细：`1.21.1-NeoForge_21.1.236` 75.11 GB；`1.21.1` 0.12；`26.2` 0.04；`26.2-Forge_65.0.3` 0.04；`1.21.1-Forge_52.1.15` 0.03；`1.21.10` 0.03。
`journeymap` = 10,567.3 MB；`mods` = 71 files / 168.3 MB。

## 排查过程中的坑
- 早期读数自相矛盾：一处报 `%TEMP%` 仅 0.12 GB / 283 files，另一处列出 3.2 GB 单文件。**根因是看错列单位**——那 3.2 是 **MB** 不是 GB（`bili-proxy-18787.log` 3.2 MB）。教训：单位列先核对再下结论。
- `Get-CimInstance Win32_LogicalDisk -Filter "DeviceID=@(\`"C:...` 引号转义错误 ⇒ `HRESULT 0x80041017`（无效查询）。该 cmdlet 仍打印出了盘符余量，但过滤器本身失败。
- `Get-ChildItem "D:\" -Filter "*.mrpack" -Recurse -Depth 3` 报 `System.ComponentModel.Win32Exception`（根目录递归被拒）。改用 `D:\MINECRAFT` 顶层直接列举即可。
- PCL 进程定位：`Get-Process` 对 PCL 无输出；磁盘上 exe 在 `D:\MINECRAFT\Plain Craft Launcher 2.exe`（非 C 盘）。HKCU 下 PCL 配置可读，关键项 `CacheDownloadFolder = D:\MINECRAFT\PCL\MyDownload\`、`ToolDownloadThread = 63`。

## 现状快照
- C: 300 GB → 剩 **70.76 GB**；D: 652.9 GB → 剩 **103.83 GB**
- C 与 D 是**同一块** `KINGSTON OM8TAP41024K1-A00` NVMe（954 GB，MediaType SSD，BusType NVMe）的两个分区 —— 这一点是「TEMP 迁 D 盘无性能损失」的前提
- `%TEMP%` 现 122 MB（干净），PCL 进程未运行
- `hiberfil.sys` 12.69 GB；`pagefile.sys` 0；`Windows.old` 不存在

C 盘顶层：`Users` 118.43 GB、`Windows` 42.86、`Program Files` 21.64、`Program Files (x86)` 15.25、`ProgramData` 13.63、`raylib` 1.05、`mingw64` 0.88、`Git` 0.39。
`C:\Users\27063` 明细：`AppData` 79.7 GB、`Desktop` 6.61、`.git.disabled-rxfix-20260921-203000` 5.51、`Downloads` 3.25、`.reasonix` 3.11、`.vscode` 3.09、`.elan` 3.0、`.zcode` 2.59、`.local` 1.87、`.dsh` 1.34、`source` 1.3、`.cache` 0.8，另有两个 `.reasonix-backup-desktop-*`（0.56 / 0.45 GB）。
`AppData\Local` 48.59 GB（`Programs` 13.27、`Microsoft` 4.02、`pip` 3.5、`Buzz` 2.89、`uv` 2.49、`JianyingPro` 2.39、`reasonix` 2.11、`npm-cache` 1.89）；`Roaming` 30.91 GB（`reasonix` 7.1、`TRAE SOLO CN` 4.33、`kingsoft` 3.98、`Code` 2.59、`Tencent` 1.87、`MinecraftPE_Netease` 1.61、`npm` 1.18、`miHoYo` 1.16）；`LocalLow` 0.20 GB。

## 修复方案（按优先级）
### ① 立刻：导出时排除大件（零副作用，首选）
整合包给别人用不需要存档与地图。勾掉 `saves` / `journeymap` / `backups` / `*.zip`，剩 ~300 MB，秒级完成。
另外那 16.53 GB `backups` + 两个旧备份 zip 本身就是冗余，应迁到 D 盘或移动硬盘。

### ② 治本：把 PCL 的 TaskTemp 挪到 D 盘
因为走 `GetTempPath()`，令用户级 `TEMP`/`TMP` 指向 D 盘即可生效。**同一块 NVMe 上跨分区 IO 无损失**，这是可行前提。
- 精准版：`C:\Users\27063\AppData\Local\Temp\PCL` 做成 junction → `D:\PCLTemp`（需管理员）。
  ⚠️ PCL 有 `TryClearTaskTemp`，会**递归清理**该目录；junction 下递归删除可能穿透到目标，所以目标必须是专用垃圾目录，别指向有数据的地方。
- 全局版：`setx TEMP D:\TempCache` + `setx TMP D:\TempCache`，重开进程生效（影响所有走 `%TEMP%` 的程序）。

验证方式（改完不重启就能验）：跑任一 PCL 下载任务，看新建的 `TaskTemp\<id>` 落在 C 还是 D。

### ③ 更好的备份方式：不用「导出整合包」
```
robocopy "D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\saves\机械动力" "D:\MCBackup\机械动力" /MIR /R:1 /W:1 /MT:16
```
峰值 = 1× 存档大小，无 overrides 副本、无打包。

### ④ 顺手回收 C 盘
- `hiberfil.sys` 12.69 GB —— 不用休眠就 `powercfg /h off`（管理员）
- `C:\Users\27063\.git.disabled-rxfix-20260921-203000` 5.51 GB（已禁用的旧 git 目录）
- `.reasonix-backup-desktop-20260731-190719` 0.56 GB + `-190138` 0.45 GB
- `AppData\Local` 内：`Programs` 13.27 / `pip` 3.5 / `uv` 2.49 / `npm-cache` 1.89 GB（package cache 可清）
- `WinSxS` 19.53 GB —— `DISM /Online /Cleanup-Image /StartComponentCleanup`

### ⑤ 硬纪律
凡「会翻倍」的操作（导出 / 解压 / 编译 / 打包），先确认目标盘可用空间 ≥ **2× 预计体积**。本次是 55 GB 需求对 ~30 GB 余量。

## 未决 / 待办
- 方案 ①②③④ 均**尚未执行**，等待用户确认。可代做的：迁 `backups` + 两个 zip 到 D 盘并核验；生成 junction / powercfg / DISM 的可回滚脚本（管理员部分需用户确认后执行）；清理项逐条 `--dry-run` 先看再删。
- `C:\Users\27063\AppData\Local\Temp\PCL` 当下不存在（PCL 自清理后），junction 需在下次导出前重建。

## 相关文档
- `4eef00de-23d0-46ac-a807-e6e34cecc71d` —— D 盘清理 2026-10-03（净回收 43 GB）：DeliveryOptimization 陷阱、逻辑大小≠物理占用判据、原神外置资源账本机制。同属 2026-10-03 磁盘空间治理，判据与陷阱可互相参照。
