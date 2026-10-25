---
id: "475df3d4-5335-4ed1-8600-6624528c30c4"
title: "endless 高度分页代价实测：512 格/页的 VerticalPageLayout 常量、y≈300 高建筑卡顿归因、5008→1000 回落测算与优化 mod 上限（2026-10-23）"
description: "在 4a5cedc7（1024→5000 限高推进）之后的反向回落记录：endless-neoforge 1.21.1-0.10.1 的 VerticalPageLayout 字节码常量 16/32/512 与「local block Y must be in [0,512)」、page 数随 maxBuildHeight 增长的性能含义、用户「高于 300 的建筑靠近就卡」的三层归因、改到 1000 能省 317→67 sections 但渲染侧不受影响、7 个优化 mod 已到上限（再加 lithium 类会与 endless 的 SectionStorageMixin 冲突）、以及需求从「塔」转向「空间站」的待决选项。涉及 .excraft 格式与 clamp 判据时见 da9d1dda / 4a5cedc7。"
status: "active"
created_at: "2026-10-23T15:23:35.147Z"
updated_at: "2026-10-23T15:23:35.147Z"
content_hash: "e3026b8b261aaa239fea2358858f05384a9c11139eea652a3442d5a9214355ca"
source_paths:
  - "config/endless.json"
  - "mods/endless-neoforge-1.21.1-0.10.1.jar"
  - "mods/sodium-neoforge-0.8.12+mc1.21.1.jar"
  - "mods/modernfix-neoforge-5.27.24+mc1.21.1.jar"
  - "mods/ferritecore-7.0.3-neoforge.jar"
  - "schematics"
session_ids:
  - "25977799-f5c5-460a-9b2e-a0a7c0f38b8b"
memory_body_ids:
  []
---

# endless 分页机制与「高建筑靠近就卡」的归因（2026-10-23）

承接 4a5cedc7（endless 限高 1024→5000 的 clamp 判据）与 0f1a7c40（lithium 硬编码 24 sections 冲突）。本篇记录把 `maxBuildHeight` 从 5008 **反向回落**时做的实测归因。

## 关键前提：endless 把世界切成 512 格一页

从 `mods/endless-neoforge-1.21.1-0.10.1.jar` 的 `com/nstut/endless/vertical/VerticalPageLayout.class` 反编译常量确认：

```
SECTION_HEIGHT     = 16    （MC 标准 section 高）
SECTIONS_PER_PAGE  = 32
BLOCKS_PER_PAGE    = 512
抛错文案: "local section Y must be in [0, 32)"
          "local block Y must be in [0, 512)"
```

配套类（同包）：`VerticalPage` / `VerticalPagePos` / `VerticalPageCodec` / `VerticalPageLayout` / `VerticalPageDiskStorage` / `VerticalPagePersistence` / `VerticalPageSnapshot` / `ColumnRleStorage` / `PageWindowScan` / `BlockEntityPageRefreshScanner`。
Mixin 侧：`SectionStorageMixin`、`LevelLightEngineMixin`、`LevelHeightAccessorMixin`、`RenderSectionCompiledMixin`、`ViewAreaMixin`、`ServerLevelMixin`、`ChunkHolderMixin`、`PoiManagerMixin`、`ServerGamePacketListenerMixin`、`ClientHandshakePacketListenerMixin`。

**含义：高度上限不是一个连续区间，而是按页离散增长的存储单元。** 抬高 `maxBuildHeight` 不是「多开几格空间」，而是**按页增加数据页**（每页 32 sections + 一份列式 RLE 存储 + 一次窗口扫描）。

## 配置现状与历史

`config/endless.json` 当前值（相对 10-23 10:35 备份已被抬高过）：

```json
{ "buildHeight": { "minBuildHeight": -64, "maxBuildHeight": 5008 }, "debug": false }
```

备份 `config/endless.json.bak-20261023-103509` 是 `-1024 .. 1024`。

| 配置 | 总格数 | section 数 | page 数 |
|---|---|---|---|
| `-64 .. 5008`（现状） | 5072 | **317** | **10** |
| `-64 .. 1000`（建议回落） | 1064 | **67** | **2.09** |
| `-1024 .. 1024`（旧备份） | 2048 | 128 | 4 |

抬高到 5008 相当于把页数从 4 提到 10，约 2.5 倍。

## 「高于 300 的建筑靠近就卡」的三层归因

用户报告的现象：y≈300 的建筑一靠近就卡。注意 **y=300 落在 page 0（`-64..447`）内部，并未跨页**，所以卡顿不是跨页边界造成的，而是三项叠加：

1. **`PageWindowScan`** —— 靠近建筑时反复扫描页面窗口，判断窗口内页面能否合并；建筑越密集扫描越频繁。
2. **`BlockEntityPageRefreshScanner`** —— 逐方块实体扫页并刷新。塔身是纯石砖、实体极少，但 section 光照仍要刷新。
3. **渲染侧 `RenderSectionCompiledMixin`** —— 垂直 ~23 sections（-64→300 = 364 格）× 视距 12 区块的 25×25 列 ≈ **14,375 个 section 候选**参与视锥剔除与网格构建。

**关键结论：第 3 项与 `maxBuildHeight` 无关**（由视距和视锥决定，不由总高度决定）。所以回落高度能砍掉第 1、2 项和内存压力，**但不会让卡顿消失**——实测预期是「减轻一半以上」。

## 回落方案的代价（必须先确认再改）

- **降低 `maxBuildHeight` 会让超出部分的方块直接消失**，不是「停止生成」而是不再存在。回落前须确认 y>1000 没有测试方块/脚手架。
- 若塔目标 1023 高，`maxBuildHeight: 1000` 差 1 格到顶，需改 1040。
- `minBuildHeight` 从 -64 提到 -32 收益极小，不值得动。
- 改动前先备份 `config/endless.json`（已有 `mcopt/set-endless-height.ps1` 与 `mcopt/backup-saves.ps1` 可复用）。
- 验证流程：改完必须**存档退出再进世界**，站在同一位置用 F3 看 `C: x/y` 与帧率，或 `/spark tps` 对比。

## 优化 mod 已到上限，不要再加

`mods/` 现有 52 个 mod，其中优化类 7 个：

| mod | 版本 | 作用 |
|---|---|---|
| sodium-neoforge | 0.8.12+mc1.21.1 | 区块渲染重写 |
| iris-neoforge | 1.8.14+mc1.21.1 | 光影 |
| modernfix-neoforge | 5.27.24+mc1.21.1 | 启动/内存 |
| ferritecore | 7.0.3-neoforge | 方块状态内存 |
| entityculling-neoforge | 1.11.2-mc1.21.1 | 实体视锥剔除 |
| ImmediatelyFast | 1.6.14+1.21.1 | 即时渲染批处理 |
| createadvancedoptimization | 1.5 | Create 专用 |

**缺的关键项（lithium / canary / radium / c2me）恰好不能再加**：它们都重写 section storage 与光照引擎，而 endless 已经用 `SectionStorageMixin` + `LevelLightEngineMixin` + `LevelHeightAccessorMixin` 接管同一批接口，混用冲突——0f1a7c40 里「24 sections」崩溃就是这类冲突的实例。**这套环境的上限就是缩短高度区间。**

## 相关但已分篇的结论

- `.nbt`（Create blueprint，进 `schematics/`）与 `.excraft`（ENXV Aeronautics plot print，进 `envx_aeronautics_structures/`）是两套互不通用格式；section `block_states` 打包公式（palette→bits→longs：1–16→4bit→256，17–32→5bit→342，33–64→6bit→410，65–128→7bit→456，129–256→8bit→512）已实测验证 → 见 da9d1dda。
- `Create physical schematic produced no placement targets` 是 Create printer 处理不了 Aeronautics 写进去的 `sub_levels` 字段；纯 vanilla 方块的自建 `.nbt` 不触发该错误。
- 十段塔 `seg_01..seg_10`（49×49 收收到 17×17，每段 100 高 ×10 = 1000 高）全部只含 4 种原生方块（air / chiseled_stone_bricks / stone_bricks / sea_lantern，仅 seg_10 顶端有海晶灯），entities 全空，因此不会因缺方块打印失败；Schematicannon 每份火药 400 方块（`schematicannonDelay = 10`，配置里无尺寸上限）。

## 需求转向：从「塔」到「空间站」（待用户拍板）

用户明确否定了塔体形式（"你的建筑很丑"）并给出真实目标：**要一个空间站**。塔是垂直收缩体量，空间站是水平展开 + 模块拼接，生成器需要重设计。

用户尚未回答两个决定性问题，这是当前阻塞点：

1. **放哪里** —— A) 高空轨道 y≈1000（须先把 `maxBuildHeight` 降到 1040）；B) 悬浮 sub-level（Aeronautics 物理结构，只能走 `.excraft`，需写完 section 编码器，巨型结构物理开销大）；C) 低空悬停 y≈200 且取消高度扩展（最稳）。
2. **风格** —— 写实 NASA（白/灰/功能暴露）／科幻游戏风（暗色 + `sea_lantern`/`shroomlight` 发光条）／极简几何。

建议的站体骨架与尺寸（MC 方块尺度）：核心舱直径 15 × 长 40（圆筒/八棱柱）、桁架 spine 长 60 截面 3×3 带交叉支撑、太阳能板 40×60 平板两翼、对接环直径 9 圆环 2~4 个、可选居住环直径 60（离心重力）。
材质方向：主体 `iron_block` + `light_gray_concrete` + `white_concrete`，细节 `create:brass_casing` / `create:copper_casing`，玻璃 `glass` / `tinted_glass`，太阳能板 `blue_concrete` + `light_blue_concrete` 网格，桁架 `iron_bars` / `create:metal_girder`。

工作方法：先出 **1:1 小样（约 60×30×30 的核心舱 + 一根桁架）** 给用户看效果，认可后再放大到整站——避免方向错导致巨型蓝图全废。
