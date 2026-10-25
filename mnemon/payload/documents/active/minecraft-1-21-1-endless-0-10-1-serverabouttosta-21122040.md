---
id: "21122040-83b3-4232-835d-94cdef88d5ba"
title: "Minecraft 1.21.1「进入世界卡死」取证：endless 0.10.1 在 serverAboutToStart 主线程全量扫描 region（2026-10-22）"
description: "1.21.1-NeoForge 进入存档后整机无响应、latest.log 完全静止的定位记录：两次 jcmd 线程 dump 同帧锁定 com.nstut.endless 的 LegacyRegionScanner 在 ServerAboutToStartEvent 上同步扫 region 文件；含 endless.json 无跳过开关、README/反编译证据、27.55 GB 世界规模与 A/B 方案取舍。"
status: "active"
created_at: "2026-10-22T18:01:02.452Z"
updated_at: "2026-10-22T18:01:02.452Z"
content_hash: "64d2afdb8c437403df9a70b2aa78a58f2f0d95b3fc682c694cc0a9a68bd5cd59"
source_paths:
  - "mods/endless-neoforge-1.21.1-0.10.1.jar"
  - "config/endless.json"
  - "logs/latest.log"
  - "saves/机械动力"
session_ids:
  - "c6c658e8-af54-4ae1-a420-4d08e5911fc1"
memory_body_ids:
  []
---

# endless 0.10.1 导致「进入世界卡死」取证（2026-10-22）

## 现象

- 启动正常，**进入存档后整机无响应**（不是启动卡死）。
- `latest.log` 在 spark 两行之后彻底静止，**连一行日志都不再输出**。
- spark 报 `Timed out waiting for world statistics`（世界统计量读在 Server thread 上，而 Server thread 已被占满）。

## 决定性证据：两次线程 dump 停在同一帧

复现后间隔 7 秒抓两次 `jcmd <pid> Thread.print`（23:26:25 / 23:26:32），`Server thread` 栈帧一字不差：

```
"Server thread"
  at sun.nio.ch.IOUtil.read
  at net.minecraft.world.level.chunk.storage.RegionFile.getChunkDataInputStream(RegionFile.java:191)
      - locked <0x...> (a net.minecraft.world.level.chunk.storage.RegionFile)
  at com.nstut.endless.heights.LegacyRegionScanner.scanWorldAgainstCandidate(LegacyRegionScanner.java:95)
  at com.nstut.endless.heights.EndlessHeights.classifyUnpersistedWorld(EndlessHeights.java:197)
  at com.nstut.endless.heights.EndlessHeights.loadPersistedRange(EndlessHeights.java:144)
  at com.nstut.endless.neoforge.EndlessNeoForge.serverAboutToStart(EndlessNeoForge.java:64)
  at net.neoforged.bus.EventBus.post(EventBus.java:360)
  at net.neoforged.neoforge.server.ServerLifecycleHooks.handleServerAboutToStart(ServerLifecycleHooks.java:98)
  at net.minecraft.client.server.IntegratedServer.initServer(IntegratedServer.java:76)
  at net.minecraft.server.MinecraftServer.runServer(MinecraftServer.java:670)
```

**判读**：栈恒定 ⇒ 不是死锁，而是一个 **O(n) 全量扫描在 Server thread 上同步跑**；n 是整个世界（约 27.55 GB / 15742 个 region 文件，其中约 2951 个是 Sable 的 sub-level region 文件）。这同时解释了日志静默与 spark 超时。

## 排除项（A/B 验过）

- **与 [一键背包整理Next] InventoryProfilesNext（IPN）无关**：临时移到 `mods-disabled/` 重启后卡点原样复现，随后已复原（`mods/*.jar` 回到 54，`mods-disabled/` 回到 4）。
- **不是「加载时间随存档逐渐变差」**：此前观察到的 `36 s` 加载与 endless 无关，endless 当时尚未安装。
- **endless 在历史日志中零命中**，只在 2026-10-22 会话出现 `Initializing Endless mod`；jar 落盘时间 **2026-10-22 22:21**，属全新引入。

## 机制（README + 反编译交叉验证）

- README（[UpperMoon0/Endless](https://github.com/UpperMoon0/Endless)，`nstut-endless`）：提供 **sparse, practically unbounded vertical building space**，`without allocating a dense chunk column for the entire height`。
- **因为要把 dense chunk column 换成稀疏分页结构，首次进入旧存档必须先读一遍旧结构** —— 这是设计，不是 bug。
- `javap` 确认的 API：
  - `com.nstut.endless.heights.EndlessHeights`: `loadPersistedRange(MinecraftServer)`、`classifyUnpersistedWorld`、`denseRangeForLogical`、`mergeRange`，以及 `applied` / `effectiveMin|Max|DenseMin|DenseMax` 的 volatile 状态。
  - `com.nstut.endless.vertical.VerticalPageDiskStorage implements VerticalPagePersistence<LevelChunkSection>`: `load/save/delete/exists/pageYs(chunkX, chunkZ)`、`chunkDirectory(int,int)` ⇒ **确实有落盘持久化，每个 chunk 一个子目录**。
  - `com.nstut.endless.neoforge.EndlessNeoForge` 注册的事件：`serverAboutToStart`（卡点）、`serverStarted`、`serverTick(Post)`、`chunkUnload`、`serverStopping`。
- **`config/endless.json` 只有 97 字节，没有任何「跳过扫描 / 延后扫描 / 限制范围」开关**：
  ```json
  { "buildHeight": { "minBuildHeight": -64, "maxBuildHeight": 320 }, "debug": false }
  ```
- 存档里 endless 自己的数据文件**零命中** ⇒ 两次尝试（用户 23:05、复现 23:24）都是**从零重扫**，从未跑完过。

## 备选方案与取舍

| 方案 | 代价 / 风险 |
|---|---|
| **A. 把 jar 挪进 `mods-disabled/`（当时推荐）** | 一步可逆，立刻恢复可进世界。因为它是当天新装、尚无所建之物 |
| **B. 让它跑完一次** | 理论上跑完即落盘、之后正常；但耗时未知（估十几分钟到半小时），期间无响应属正常，中途强杀则归零；未确认 `LegacyRegionScanner` 是「边扫边写」还是「扫完一次写」 |
| **C. 先用 `debug: true` 测速再决定** | 改前备份 config，每 30 s 采 `RegionFile.getChunkDataInputStream` 路径推算每分钟 region 处理量；只读 + 一个 config 字段，不碰存档。需事后改回 |

## 通用教训

- 「进世界卡死」优先抓**两次间隔数秒的线程 dump**：栈帧完全一致 = 长任务阻塞主线程；栈位置就能直接点名 mod 与代码行。
- 主线程 `ServerAboutToStartEvent` 上的同步全量 I/O，在数十 GB 存档上等效于无限期无响应；这是**任何**「首次迁移/升级存档结构」类 mod 的通病模式。
- 排查时**先看 jar 落盘时间与历史日志命中数**判断「新引入 vs 老问题」，能省掉大量弯路。
