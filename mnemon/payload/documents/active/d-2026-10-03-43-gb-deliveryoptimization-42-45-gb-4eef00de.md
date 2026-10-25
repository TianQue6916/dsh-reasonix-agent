---
id: "4eef00de-23d0-46ac-a807-e6e34cecc71d"
title: "D 盘清理 2026-10-03（净回收 43 GB）：DeliveryOptimization 陷阱、逻辑大小≠物理占用判据、原神 42.45 GB 外置资源账本机制"
description: "2026-10-03 D 盘清理调查与执行记录：52.88 GB DOSVC 缓存只换回 22 GB 的 preallocated 机制与取证链、Delete-DeliveryOptimizationCache 返回 OK 却跳过的陷阱、junction 扫描重复计算、原神 VideoAssets Boy/Girl 双份 42.45 GB 与完整性账本（手删会触发重下）。"
status: "active"
created_at: "2026-10-02T16:41:28.357Z"
updated_at: "2026-10-02T16:41:28.357Z"
content_hash: "ea2a12d0076c240d73e96c1f85b14c973fe657f5e6a9199c75c2bdc6213896df"
source_paths:
  []
session_ids:
  - "419d65ec-2c00-4508-baf9-03c1a25436dc"
memory_body_ids:
  []
---

# D 盘清理 2026-10-03：机制、陷阱与可复用判据

## 结果（物理口径）

| | 总 | 已用 | 可用 | 占用率 |
|---|---|---|---|---|
| 起始 | 653 G | 595 G | 59 G | 92% |
| 结束 | 653 G | 551 G | 102 G | 85% |

净回收 **43 GB**（`Get-PSDrive D` → `Used=551.11 GB  Free=101.76 GB`）。

| 清理项 | 动作 | 逻辑量 | 实际回收 |
|---|---|---|---|
| `D:\80-系统\DeliveryOptimization\Cache` | `Stop-Service dosvc` → 删 106 个 GUID 条目 → `Start-Service dosvc` | 52.71 GB | ~22 GB |
| `D:\80-系统\miniconda\pkgs` | `conda clean -a -y`（161 tarball + 83 unused package） | 7.13 GB | 7.13 GB |
| `D:\70-下载\qycache\temp_cache` | 清空 | 6.00 GB | 6.00 GB |
| `D:\80-系统\edg` 顶层 installer | 删 34 个（33 `.exe` + 1 `.vsix`） | 5.00 GB | 5.00 GB |
| `D:\代码缓存` | 清空 | 3.04 GB | 3.04 GB |
| `D:\AppStoreDownload` | 清空 18 个 `.exe` | 2.49 GB | 2.49 GB |

## 陷阱 1：`Delete-DeliveryOptimizationCache` 的 "OK" 不可信

提权后该 cmdlet 返回 **OK**，实际只删掉 4 个文件（`52.88 GB → 52.71 GB`）；`Get-DeliveryOptimizationStatus` 仍报 `count=106 / 52.72 GB`。
原因：**cmdlet 跳过 DOSVC 服务当前持有的条目**，而该服务几乎从不认为自身未持有。
可用 fallback（已验证）：`Stop-Service dosvc` → 直接删 `DeliveryOptimization\Cache` 下的 GUID 条目（`removed 106 entries / 52.71 GB / 0 fail`）→ `Start-Service dosvc`；服务重启后 Cache 目录自动重建为空。
→ 通用教训：Windows 自带清理 cmdlet 返回成功时，必须用物理口径复测，不能采信返回值。

## 陷阱 2：文件「大小」≠ 磁盘占用（本次最重要判据）

52.88 GB 的名义大小只换回 22 GB 物理空间，证据链：

1. 删除前 D 盘顶层文件**逻辑和 = 622.75 GB**，而 `df` 报物理已用 574 GB ⇒ 物理比逻辑**少 48.75 GB**。
2. `compact /q D:\` 输出 `New files added to this directory will not be compressed.`，目录属性无 `Compressed` ⇒ 排除 NTFS 压缩。
3. `$RECYCLE.BIN` 仅 0.00 GB ⇒ 排除回收站。
4. 删除后物理(551.11) ≥ 逻辑(546.38)，即「逻辑远大于物理」的差值随那批文件一同消失。

⇒ DOSVC 缓存文件是 **preallocated**：下载前按完整大小预分配，`ValidDataLength < FileSize`，未写入区间不占物理簇；52.88 GB 中约 30 GB 是名义大小。

**可复用结论：清理收益必须看 `df` / `Get-PSDrive` 的物理口径，不能用文件大小当 KPI。**

## 陷阱 3：扫描 D 盘必须过滤 reparse point

D 盘根目录有 **96 个 junction**（`.ollama`、`b站视频`、`buzz`、`MINECRAFT`、`米哈游` …）指回 `40-媒体` / `50-游戏` / `80-系统` 等分类目录（用户自建的归类映射）。不过滤 `FILE_ATTRIBUTE_REPARSE_POINT` 会重复计算 —— 首次统计得出 1053 GB，实际 546 GB。

## 原神外置资源：42.45 GB 且**不能手删**

`...\Genshin Impact Game\YuanShen_Data\StreamingAssets\VideoAssets\` = 42.45 GB / 277 files，其中 `StandaloneWindows64\` 为 275 个 `.usm`（平均 158 MB，15 MB–511 MB）。

- `*_Boy.usm` 17.39 GB / 112 files 与 `*_Girl.usm` 17.39 GB / 112 files **严格对称**：同段剧情、同音频，仅旅行者模型不同（如 `Cs_102205_AfterBattle_Boy.usm` / `_Girl.usm`）。
- 无性别后缀 7.67 GB / 51 files。
- 设计取舍是 **space-for-simplicity**：按玩家性别个性化下发会切碎 CDN 边缘缓存命中率、使 `StreamingAssets\hdiff\` 的二进制增量更新基线分裂、并要求服务端记录每个玩家的下载状态；用 2× 磁盘换掉整套按状态分发逻辑。

**手删是徒劳的（关键证据）**：`video_versions_streaming`（45972 bytes JSON）含 275 条 `{"remoteName", "md5", "hash", "fileSize"}` 记录，与目录中 275 个 `.usm` **一一对应、一个不缺**：

- 本地处于全量状态（官方清理入口从未被使用）；
- 游戏持有完整性账本，手删任一 `.usm` 会被校验发现，启动器「资源修复」将全部重新下载（42 GB 下载代价远高于省下的空间）。
- `26236578.blk`（魔数 `42 6c 62 03` = `Blb\x03`，米哈游块容器）内嵌 `videoversions.asb` 与明文条目名，是同一个账本的第二份副本（外层加密）。

**安全做法**：只能走游戏内/启动器的官方清理入口（由游戏自己同步改账本）。验证实验链：先备份两个账本 → 执行一次官方清理 → 比对 `.usm` 文件数、清单中 `remoteName` 条数、目录大小；若文件数减少**且**清单条数同步减少 ⇒ 清单驱动、安全；若文件数减少而清单条数不变 ⇒ 会触发重下，不要动。本次**未核实**国服当前版本的确切菜单文字。

**同类项**：`AudioAssets` 37.05 GB，其中仅 `Chinese` 13.13 GB 是中文语音，日/英/韩语音包约 24 GB（同样是启动器官方清理入口）。过场动画 42.45 GB + 非中文语音 ~24 GB ≈ 66 GB 属同一类外置资源。
原神整体 **137.5 GB**，占 D 盘（551 GB 已用）约 25%。取舍前提：若一个月都开不到一次，整体卸载/迁移优于抠 42 GB；且删掉的动画在剧情推进时会按需重新下载（把常驻空间压力变为按需）。

## 归档与备份

`D:\90-归档\D盘清理-2026-10-03\`（同一份 `D-cleanup-plan.md` 也留在 `C:\Users\27063\dsh-tmp\`）：

- `D-cleanup-plan.md` — 完整清单 + 全部执行记录 + 上述结论
- `edg-installers-removed-2026-10-03.txt` — 被删 34 个 installer 的文件名/字节数/mtime（可按版本号重装找回）
- `deliveryoptimization-cache-before-2026-10-03.txt` — 被删 106 个 GUID 缓存条目清单

## 未执行项（用户当时表示「就这几个」）

- 已学完的 B 站课程视频（线代 45.41 G + 6.006 算法 37.98 G = 83.4 G），可 `ffmpeg -c:v libx265 -crf 28` 再压约一半
- 原神过场动画 42.45 G / 非中文语音包 ~24 G（见上，需官方入口）
- MC `backups\manual-20260913` 15.72 G、网易版 MC 9.12 G、buzz 8.58 G、Driver 6.88 G、Unlimited-OCR 6.31 G（仅权重无程序）
- 建议在「设置 → Windows 更新 → 高级选项 → 传递优化 → 高级选项」把缓存上限调到 5–10 GB（本次清出 52.88 GB 说明它从未被限制）
