---
id: "d3928ecf-83d7-41a1-81bc-0fb8b52b0101"
title: "Minecraft 磁盘写入主因定位：journeymap.log 单次会话 25.36 GiB（JourneyMap 6.0.9 × Create 的 DEBUG 刷屏，2026-10-10）"
description: "2026-10-10 实测定案「MC 一开就猛写盘」的元凶：D:\\50-游戏\\MINECRAFT\\.minecraft\\versions\\1.21.1-NeoForge_21.1.236\\journeymap\\journeymap.log 单次启动 101 分钟长到 27,232,109,562 B（25.36 GiB），稳定 ~5 MB/s。机制为 JourneyMap 6.0.9 给方块采色时对 Create 自定义模型逐方块吐 DEBUG，且 core.config 的 logLevel=INFO 管不住 JM-task-* logger（mod 自身缺陷）。含四段速率交叉验证、NAND 写入对账（推翻「DistantHorizons.sqlite 是当前流量主因」）、止血/治本/后手三级修复方案与「必须先退 MC」前提。延续 11b67783 / 863dee8c / 63c87fcc，关联 c45d2064、753fc018。"
status: "active"
created_at: "2026-10-10T12:17:16.342Z"
updated_at: "2026-10-10T12:17:16.342Z"
content_hash: "7ac6edf22a827a3895915f3378eed42fb376008ff112c0db367586c0c39f525f"
source_paths:
  []
session_ids:
  - "db8138a1-c76d-4fc3-904c-51d9f3020583"
memory_body_ids:
  []
---

# Minecraft 磁盘写入主因定位：journeymap.log 单会话 25.36 GiB（2026-10-10）

## 结论（本次定案）

用户「MC 一打开磁盘就持续猛写」的元凶不是 Minecraft 本体、也不是 DistantHorizons：

`D:\50-游戏\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\journeymap\journeymap.log`

一次游戏会话（101 分钟）写出 **27,232,109,562 B = 25.36 GiB**，稳定速率 **~5 MB/s**。

## 核心证据（三工具一致 + 文件内时间戳）

| 项 | 值 |
|---|---|
| Length | `27,232,109,562 B` = 25.36 GiB（`ls -la` / `stat` / PowerShell `Get-Item` 三路一致） |
| CreationTime | `2026-10-10 18:27:06` = 本次启动时刻 ⇒ **日志每次开局重建，不是历史累积** |
| LastWrite | `2026-10-10 20:08:29` |
| 占用 | `FileShare.None` 打开失败：`The process cannot access the file ... because it is being used by another process` ⇒ **排查时 MC 仍在运行** |
| D 盘余量 | Total 652.9 GB / Free 218.9 GB（`SizeGB` / `FreeGB`） |

**写入速率四段交叉验证**（把文件 offset 与日志内嵌时间戳对齐，绕开采样）：

| 区间 | 字节跨度 | 耗时 | 速率 |
|---|---|---|---|
| 18:28:03 → 18:44:08 | 0.1 → 5 GB | 965 s | 5.08 MB/s |
| 18:44:08 → 19:16:11 | 5 → 15 GB | 1923 s | 5.20 MB/s |
| 19:16:11 → 19:48:25 | 15 → 25 GB | 1934 s | 5.17 MB/s |
| 19:48:25 → 20:08:29 | 25 → 27.23 GB | 1204 s | 1.85 MB/s（收尾变慢） |

⇒ 这就是此前多轮实测里「6.22 / 3.47 / 2.99 MB/s 持续写入」的真身。

## 机制：JourneyMap × Create 的 DEBUG 风暴

日志内容**是同一模板行的无限重复**：

```
[18:28:03] [JM-task-2/DEBUG] [VanillaBlockSpriteProxy] Success during
[RenderType[solid:CompositeState[[texture[Optional[minecraft:textures/atlas/blocks.png](blur=false, mipmap=true)], ...]]]
class com.simibubi.create.content.fluids.PipeAttachmentModel.getQuads(
  Block{create:fluid_pipe}[down=false,east=true,north=false,south=true,up=false,waterlogged=true,west=true], null, 0)
```

- 采样 offset 100,000,000 / 5,000,000,000 / 15,000,000,000 / 25,000,000,000 处内容同类，只有时间戳与方块/模型类名变化（`PipeAttachmentModel` / `CTModel` / `FluidTankModel` / `ShaftModel`…）。
- JourneyMap 6.0.9（`mods/[旅行地图] journeymap-neoforge-1.21.1-6.0.9.jar`，neoforge `0.116.7+1.21.1`，运行于 neoforge `21.1.244`）在给可见方块采色（`VanillaBlockSpriteProxy`）时，每遇到一个 Create（机械动力）自定义模型就吐一行 ~700–1000 B DEBUG；每个可见方块每帧采色 ⇒ 每秒数万行。
- **`logLevel` 配置失效（mod 缺陷，不是配置错）**：启动日志自打印 `CoreProperties{... file=journeymap.core.config, logLevel=INFO ...}` 证明它读到 INFO，但 `[JM-task-2/DEBUG]` 照写不误 ⇒ JourneyMap 6.0.9 的 `logLevel` 管不住 `JM-task-*` 线程的 logger。

相关配置文件（同目录）：`journeymap.core.config`（`logLevel`）、`journeymap.rendering.config`、`journeymap.webmap.config`（`enabled=false`, `port=8080`）、`journeymap.minimap.config` / `minimap2.config` / `fullmap.config`。

## 与既有判定的对账（修正）

- 10-10 全天 NAND 写入 159.72 GB；当天 MC 约开 5 小时 ⇒ 光这一项 ≈ 25.36 × 5/1.69 ≈ **75 GB host write**，乘 WAF 1.074 ≈ **80 GB NAND**。
- 余下约 80 GB = DH sqlite 的 WAL churn + `region`/`entities`/`poi` 的 `.mca` + JourneyMap 的 76,977 个 PNG（5.5 GB）+ `versions/1.21.1-NeoForge_21.1.236/logs/`（396 MB，单文件最大 `2026-07-18-1.log.gz` 36 KB）。
- **修正旧结论**：`DistantHorizons.sqlite` 那 11 GB 属**历史存量**，不是当前流量主因；流量主因是 `journeymap.log`。此前 `handle64 on DistantHorizons.sqlite` 报 `Access denied`（拿不到 handle）也不应再当作主线索。
- 图片/文件盘点（辅助口径）：D 盘该目录树 `79925` 文件 / `10,585.1 MB`，其中 png `76977` 个 / `5,544.3 MB`；png mtime 峰值 `2026-09-26`（33,348 个 / 1,380.3 MB）。

## 修复方案（**前提：先退出 MC**）

MC 正锁着该文件，且 JourneyMap **会在退出时把 config 写回**，所以必须退 MC 再动手。

- **A. 立刻止血**：删除这 25.36 GiB 日志（内容全是重复 DEBUG，无保留价值，会自动重建）。无害。
- **B. 治本尝试**：`journeymap.core.config` 的 `"logLevel": "INFO"` → `"ERROR"`。便宜，但按上述缺陷 **不保证有效**；改前备份该 config，可回滚。
- **C. B 无效时的后手**：
  - C1 把 `journeymap.log` 设为只读文件、或建同名目录，让 JourneyMap 打不开（可逆）。
  - C2 计划任务每次开机自动删除它。
  - C3 关掉部分映射功能（`alwaysMapCaves` / `mapTopography` / `dataCachingEnabled`）减少触发面。
- 建议 **A + B 一起做**，然后玩一局观察日志是否继续增长。

## 排查教训

- Git Bash 环境**没有 `bc`**（`bc: command not found`）⇒ 速率计算不要依赖它，直接用 offset/时间戳手工换算或用 PowerShell/awk。
- PowerShell 格式化串写错会刷一堆 `Error formatting a string: Index (zero based)...`（`'{12,10:N1} MB {0} {1}' -f` 参数不足），排错时注意别把这类噪声当结论。
- 拿不到文件句柄（`handle64` Access denied）不等于文件未被占用：换 `FileShare.None` 打开测试即可判定，报错文本就是活体证据。

## 关联文档

- `11b67783-08f5-4675-be69-b383a4f60291` — 主力机写入量第三轮排查（2026-10-10）：单窗口口径纠错、dsh 自指偏差排除
- `c45d2064-e5ea-43a2-871b-cac54b75728c` — D 盘整盘写失败（Access denied）排查：ACL/磁盘标志与卷级只读
- `753fc018-2fd4-4fad-851d-d61e682e45c9` — 1.21.1 LegacyRandomSource 崩溃取证（DH/journeymap/sable 嫌疑排序）
