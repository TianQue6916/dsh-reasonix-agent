---
id: "4a5cedc7-4f1b-416f-bf6d-e08a3c814154"
title: "Minecraft 1.21.1 endless 限高从 1024 试推到 5000：clamp() 字节码判据、备份一致性教训、Create 工具枪蓝图格式与无外网约束（2026-10-23）"
description: "在 0f1a7c40（endless/lithium 24 sections 取证）之后的高度推进记录：BuildHeightConfig.clamp() 的真实合法判据只有「±8,000,000 内 + min<max」，无 320 上限；endless.json 已改 -64/5000（待启动验证，失败回退 -64/3999）；游戏运行中做的 saves 备份 MATCH=False 不可作回滚点；工具枪蓝图 = 原生 .nbt 放 schematics/；本机 DevSidecar 起不来导致无外网、千格高楼社区不存在。"
status: "active"
created_at: "2026-10-23T02:44:08.137Z"
updated_at: "2026-10-23T02:44:08.137Z"
content_hash: "4ab41af01e221fecbc3fb073504e7942aa3be13cb9eb999e81242a9fe27973ac"
source_paths:
  - "config/endless.json"
  - "config/endless.json.bak-20261023-103509"
  - "mods/endless-neoforge-1.21.1-0.10.1.jar"
  - "logs/latest.log"
  - "schematicss/飞艇.nbt"
  - "mcopt/backup-saves.ps1"
  - "mcopt/set-endless-height.ps1"
session_ids:
  - "d47af623-e235-4489-9caf-b5a9ea2478e2"
memory_body_ids:
  []
---

# endless 限高 1024 → 5000 推进 + 蓝图/网络约束（2026-10-23 晚）

前置取证见 `0f1a7c40-e9c9-411a-8856-c634800c3e9b`（lithium 硬编码 24 sections 崩溃、endless 边界常量）与 `21122040-83b3-4232-835d-94cdef88d5ba`（LegacyRegionScanner 卡死）。本篇只记增量。

## 1. `BuildHeightConfig.clamp()` 的真实判据（反编译字节码结论）

`com.nstut.endless.config.EndlessConfig$BuildHeightConfig.clamp()` 的全部逻辑：

```java
min = Math.max(minBuildHeight, -8000000L);
max = Math.min(maxBuildHeight,  8000000L);
// 各向下/向上对齐到 16 的倍数
minBuildHeight = (int) Math.max(min, -8000000L);
maxBuildHeight = (int) Math.min(max,  8000000L);
if (minBuildHeight >= maxBuildHeight) {   // 唯一的「非法」分支
    System.err.println("...");
    minBuildHeight = -64;                 // 整体回落 vanilla
    maxBuildHeight = 320;
}
```

相关常量（`EndlessConfig`）：

```java
MIN_BUILD_HEIGHT_MIN = -8000000;  MAX_BUILD_HEIGHT_MAX = +8000000;
DENSE_MIN_BUILD_HEIGHT = -2032;   DENSE_MAX_BUILD_HEIGHT = +2032;
MAX_DENSE_SECTIONS = 254;         MAX_SECTIONS = 254;
```

**结论：`clamp()` 里没有任何 320 上限。「合法」= ① 在 ±8,000,000 内 ② `min < max`。**
⇒ `-64/5000` 对 `clamp()` 是合法配置；`max` 会向上对齐 16 ⇒ 实际 5007。

`MAX_SECTIONS = 254`（254 × 16 = 4064）与 `DENSE ±2032`（跨 4064）数值吻合，**推断**它限制的是连续 dense 段而非逻辑高度（README 说 dense 核心 + 其上是 sparse `VerticalPageDiskStorage`，每 chunk 每 page 一文件）。此推断**未经实跑验证**，是本次唯一的模糊点。

## 2. 本次改动与失败判据

- `config/endless.json` → `{"buildHeight":{"minBuildHeight":-64,"maxBuildHeight":5000},"debug":false}`
- 配置备份：`config/endless.json.bak-20261023-103509`
- 改动时游戏仍在运行（java 4.4 GB），**下次启动才生效**
- **失败信号很好认**：进世界若高度变回 320，即撞上未识别的硬限，同时 `logs/latest.log` 会出现 `clamp()` 的 `System.err` 打印
- **回退档**：`-64/3999`（4063 格 ≈ 254 sections）—— 只改一个数字重启，不必重扫世界

## 3. 备份一致性教训（重要）

`mcopt/backup-saves.ps1` 在**游戏运行中**跑，会得到 `MATCH=False`：

```
src bytes=29589274716 files=15759
dst bytes=29587910757 files=15758
```

即世界文件正在被写，备份与源不等 ⇒ **这份不能当回滚点**。改高度前的干净回滚点是更早那份 `MATCH=True` 的备份（`saves-机械动力-20261023`，10:20）。**规则：任何"改前备份"必须先退游戏，或至少校验 MATCH=True 才声明可用。**

## 4. Create 工具枪蓝图格式与目录

工具枪 jar（`com.envx.aeronauticsstructuretool`，631 entries）的蓝图链路类：

```
blueprint/codec/NativeBlueprintFormat, NativeBlueprintReader, NbtTagValidator,
             NbtTransformCodec, BlueprintArchiveCodec
blueprint/capture/NativeBlueprintCaptureService, ConnectedSubLevelCollector
BlueprintSourceType, RuntimeContraptionBlueprint, PreviewBlueprintData
```

**格式 = 原生 `.nbt`，放 `schematics/` 即被读到**（同目录现有一整套自产蓝图，含 37 KB 的 `飞艇.nbt`）。
Create 侧相关：`SchematicExport.saveSchematic(...)`、`SchematicAndQuillItem`、`ServerSchematicLoader`、`SchematicPrinter`。

## 5. 环境约束：无外网、千格高楼社区不存在

- 系统代理指向 `127.0.0.1:31180/31181`，但 **netstat 零监听、dev-sidecar.exe 进程不存在**；`D:\20-工具\devsidecar\dev-sidecar\dev-sidecar.exe` 普通启动与提权启动均起不来（Electron 托盘应用，需手动交互）。
- ⇒ 实测 `github.com` / `modrinth.com` / `planetminecraft.com` 全部 000。**需要外网时必须先让用户手动打开 DevSidecar 并点「启动服务」。**
- `web_search` provider 只有 GitHub 代码搜索 + 离线 MediaWiki，碰不到 Discord / PMC / Reddit / YouTube，拿不到社区蓝图附件。
- **逻辑层面**：「970+ 格高的现成楼 + 蓝图」在纯 vanilla 限高（320）的社区里不存在供给，只能自造或从带高度 mod 的服务器存档扒；真要程序化产出超大结构，现实路径是 Axiom（生成）+ Litematica（投影放置）。

## 6. 后续待定

重启后需实测两点：① 上限是否 ≈5000（非 320）；② y>2032 的 sparse 区放/拆方块的手感与卡顿。若卡顿严重或撞限 → 退 `-64/3999`。另注意除 lithium 外的 mod（Sable sub-level 物理、DH LOD 网格、Create contraption 边界）在 y=4000 都走未测代码路径，出现莫名崩溃先怀疑「又一个硬编码 24/320」。
