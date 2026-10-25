---
id: "0f1a7c40-e9c9-411a-8856-c634800c3e9b"
title: "Minecraft 1.21.1 高度扩展取证：lithium 硬编码 24 sections 与 endless 冲突崩溃、endless 边界常量与高度上限实践（2026-10-23）"
description: "endless 把 buildHeight 从 -64/320 扩到 -1024/1024 后「进世界 tick 崩」的定位与处置：真凶是 lithium 的 LithiumEntityCollisions 硬编码 24 sections（ArrayIndexOutOfBounds Index 24 out of bounds for length 24），Sable 只是 collide redirect 的受害者；含 endless 反编译常量（±8,000,000 逻辑界 / dense ±2032 / MAX_SECTIONS 254）、clamp() 全部合法性与回退逻辑、首次分类 11m39s vs 之后 3.6s 的 marker 机制、robocopy 备份 bytes/files 双校验的 BOM 坑、spark 在 Server thread 卡死时无效而 dump-server-thread.ps1 有效。延续 21122040（endless 卡死取证）。"
status: "active"
created_at: "2026-10-23T02:36:18.603Z"
updated_at: "2026-10-23T02:36:18.603Z"
content_hash: "f58cb8007bb40ca8b65b2d02f0ee4c0ef3a169192b184a0da37640932e1b8496"
source_paths:
  - "config/endless.json"
  - "mods/endless-neoforge-1.21.1-0.10.1.jar"
  - "mods-disabled/lithium-neoforge-0.15.4+mc1.21.1.jar.disabled"
  - "saves/机械动力/data/endless_build_heights.dat"
  - "logs/latest.log"
  - "mcopt/dump-server-thread.ps1"
  - "mcopt/backup-saves.ps1"
  - "mcopt/set-endless-height.ps1"
session_ids:
  - "e15d852a-f4b6-4dcc-a438-9a06ad240287"
memory_body_ids:
  []
---

# endless 高度扩展 + lithium 冲突取证（2026-10-23）

环境：Minecraft 1.21.1 + NeoForge 21.1.236 客户端整合包（`D:/MINECRAFT/.minecraft/versions/1.21.1-NeoForge_21.1.236/`），存档 `saves/机械动力`（约 27.5 GB / 15.7k 文件）。延续 [21122040](doc:21122040-83b3-4232-835d-94cdef88d5ba)（endless 0.10.1 进世界卡死：`serverAboutToStart` 全量扫 region）。

## 1. 决定性根因：lithium 硬编码 vanilla 的 24 个 section

把 `config/endless.json` 的 `buildHeight` 从 `-64/320` 改成 `-1024/1024` 后，进入世界几秒即崩：

```
java.lang.ArrayIndexOutOfBoundsException: Index 24 out of bounds for length 24
  at lithium ... LithiumEntityCollisions.getCollisionShapeBelowEntityFallback(LithiumEntityCollisions.java:235)
  at lithium ... LithiumEntityCollisions.getSupportingCollisionForEntity(LithiumEntityCollisions.java:222)
  at Entity.lithium$CollideMovement → Entity.collide
  at Entity.redirect$dbm000$sable$collideRedirect   ← Sable 只是把 collide 重定向，受害者
  at Entity.move → LivingEntity.travel → ServerPlayer.tick
```

`24 = (320 − (−64)) / 16`，即 vanilla 的 section 数。endless 把范围扩到 `-1024..1024` ⇒ 128 sections ⇒ lithium 用旧长度数组索引越界。崩溃报告里的 *"Please make sure this issue is not caused by Sable"* 属于误导性提示。

**处置**：`mods/lithium-neoforge-0.15.4+mc1.21.1.jar` → `mods-disabled/…jar.disabled`（mods 54 → 52）。代价：纯性能优化（实体分组遍历、碰撞查询、BlockState 缓存）失去；用 `/spark tps` 可量化。

**教训（可复用）**：扩高不是只动一个数字 —— 任何假设 vanilla `384/320/−64` 或 `24 sections` 的 mod 都会踩空。Sable sub-level 物理、DH LOD 网格、Create contraption 边界、lithium 碰撞查询都在嫌疑列。出现"莫名崩溃"先怀疑同类的硬编码高度常量。

## 2. endless 的真实边界（反编译 `EndlessConfig` 常量 + `BuildHeightConfig.clamp()`）

```java
MIN_BUILD_HEIGHT_MIN = -8000000;  MAX_BUILD_HEIGHT_MAX = +8000000;   // 逻辑界
DENSE_MIN_BUILD_HEIGHT = -2032;   DENSE_MAX_BUILD_HEIGHT = +2032;
MAX_DENSE_SECTIONS = 254;         MAX_SECTIONS = 254;               // 254*16 = 4064
```

`clamp()` 实际逻辑：`min = max(min, -8000000)`、`max = min(max, 8000000)`，各自对齐到 16 的倍数；**唯一的非法判定是 `min >= max`**，此时打印 `System.err` 并把整份配置重置回 vanilla `-64/320`。没有 320 上限。

- ⇒ `-64 / 5000` 对 `clamp()` 完全合法（max 向上对齐成 5007）。仅当撞到 `MAX_SECTIONS` 才可能被别的路径挡住 —— 该常量疑为"连续 dense 段"上限，超出部分按 README 走 sparse（`VerticalPageDiskStorage`，每 chunk 每 page 一个文件）。**此点未实跑验证。**
- 验证/回退判据：进世界后高度若又变回 320 ⇒ 撞限，看 `latest.log` 里 `clamp()` 的 `System.err` 行；退一档用 `-64/3999`（≈254 sections）。

## 3. 首次分类 vs 之后的进世界耗时（marker 机制）

- 扩到 `-1024/1024` 后的**首次**世界分类：**11 分 39 秒**（`09:55:36.330` → `10:07:15.204`）。
- 之后每次进世界：**3.6 秒**（`Loaded 3323 recipes` → `Starting integrated minecraft server` → `Time elapsed`）。走 `loadPersistedRange` 的 `mergeRange(saved, cfg)` 分支，纯 min/max 比较，毫秒级。
- marker 文件：`saves/机械动力/data/endless_build_heights.dat`（80 B gzip NBT，内容 `{data:{MinBuildHeight:-64,MaxBuildHeight:320,DataVersion:3955}}`）。
- ⇒ 再改高度只需改两个数字 + 重启，**不会重扫世界**。

## 4. 备份与校验（robocopy bytes/files 双校验的坑）

- 校验脚本 `C:\Users\27063\mcopt\backup-saves.ps1`：比较 src/dst 的字节数与文件数，`MATCH=True` 才算成功。
- 脚本自身曾因 **BOM 被写入两次**（文件首 6 字节 `efbbbf235265`，size 1694）而出问题，修好后 `BOM count ok: True`。
- **备份必须在游戏退出后做**：游戏运行时世界文件仍在写，会出现 src 15759 / dst 15758、`MATCH=False`（本次 `saves-机械动力-20261023-pre5000` 即不可用回滚点；干净点是当次改动前 `saves-机械动力-20261023`，29,581,614,720 B / 15744 files，MATCH=True）。
- 干净备份实测规模：约 27.6 GB；robocopy 退出码 16 表示"未复制任何文件/参数或源错误"，需查明而非当成功（0–7 才是成功）。

## 5. 卡死取证工具：spark 会死锁，脚本才有效

`C:\Users\27063\mcopt\dump-server-thread.ps1`：卡住时直接抓 Server thread 栈（本次定位 endless 全靠它）。
**关键事实**：Server thread 卡住时 `spark` 必然失败（它要读的统计量就在那条被卡住的线程上），只会返回 `Timed out waiting for world statistics`。以后"进世界卡住"直接跑脚本，别等 spark。

其它同目录工具：`set-endless-height.ps1`（带备份 + JSON 校验 + 失败自动回滚的 config 改法模板）、`rollback-gc.ps1`（10-17 ZGC 改动回滚，参数已被 PCL 剔除，属无害噪音）。

## 6. 当前环境状态（截至 2026-10-23，全部可逆）

| 项 | 状态 |
|---|---|
| `config/endless.json` | `min=-64, max=5000`（备份 `endless.json.bak-20261023-103509`；上一版 `-1024/1024` 备份 `.bak-20261023-102121`） |
| `mods/*.jar` | 52 个；缺 lithium |
| `mods-disabled/` | lithium、InventoryProfilesNext（02:04 起 2/2 必崩：`Features.ENABLE_PROFILES$delegate` 为空的 Kotlin 类初始化环）、BadOptimizations、immersive_portals ×2、unsafe-world-random-access-detector 旧副本（`mods/` 里那份才在生效） |
| 已完成验证 | 高度 `-1024/1024` 下 y=1023 可放方块（用户实测） |
| 待验证 | `maxBuildHeight=5000` 重启后是否生效、y≈4000 处在 sparse 区放/拆方块的手感与帧率 |
