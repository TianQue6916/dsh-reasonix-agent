---
id: "da9d1dda-628e-42bb-8163-99e921d30a3f"
title: "ENXV Aeronautics .excraft（plot print v8）格式完整逆向：sublevels/plot/chunks 结构与 section block_states 打包公式（2026-10-23）"
description: "Create 的 .nbt 蓝图与 Aeronautics 的 .excraft 是两套不互通格式：前者进 schematics/ 交 Schematicannon，后者进 envx_aeronautics_structures/ 存物理 sub-level。本文记录 .excraft 的 gzip+NBT 全字段布局（format=enxv_aeronautics_plot_print_v8、sublevels[]、plot.chunks、sections[].block_states）、已用真实文件验证通过的 bitsPerBlock/valuesPerLong/longs 长度公式，以及「physical schematic produced no placement targets」的诊断结论与 .nbt 侧 sub_levels 自建 writer 的进展。"
status: "active"
created_at: "2026-10-23T14:25:12.884Z"
updated_at: "2026-10-23T14:25:12.884Z"
content_hash: "3862b44ac976714ee345ea3d3e4eb2c17fc98264ddad54bf7daaa4a542825b61"
source_paths:
  - "mcopt/nbtgen/nbtwrite.py"
  - "mcopt/nbtgen/make_sublevel.py"
session_ids:
  - "6a42ce2c-12e6-468b-80a3-4484eeacab4b"
memory_body_ids:
  []
---

# .excraft vs .nbt：两套互不通用的蓝图格式

## 结论先行

| 格式 | 归属 | 目录 | 用途 |
|---|---|---|---|
| `.nbt` | Create blueprint | `schematicss/`（实例内实际拼写） | Schematicannon 打印**静态**建筑 |
| `.excraft` | ENXV Aeronautics plot print | `D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\envx_aeronautics_structures\` | 存**物理 sub-level**（能浮/能动/带约束） |

Create 的 printer 稳定认 `.nbt`；54 个 `.excraft` 它一个都不认。把自制 `.nbt` 塞进 `schematics/` 后出现
`Create physical schematic produced no placement targets`——原因是 Create 按 physical schematic 解析了这个文件但找不到可放置方块，**不是文件损坏**。同名 `AAA_segtest.nbt` / `ZZZ_reftest.nbt` 在列表里可见（`schematics/` 链路本身是通的），`AAA_phys_test.nbt` 可见但落地为空。

`.excraft` 的本质区别：它不是"方块清单 + 重建指令"，而是**直接端上一整块区域的原生 MC 世界数据**（chunk/section/block_entities/heightmaps），物理引擎接手 sub-level 时看到的就是真实存储结构，因此不存在 "placement targets" 这个中间概念。

## `.excraft` 容器

gzip（magic `1f 8b 08 00 00 00 00 00`）→ NBT，**root 无节点名**。顶层 key：

```
format                    STRING  'enxv_aeronautics_plot_print_v8'
name                      STRING  'meitandaodan'
root_sublevel             INT[]   4×int32（UUID 二进制形式）
root_orientation          COMPOUND {w,x,y,z} : DOUBLE   单位四元数
root_rotation_offset      COMPOUND {x,y,z}   : DOUBLE   世界坐标（示例 20487176.8, 20483078.2, 124.3）
toolgun_constraints       LIST<END> x0                  ← 工具枪焊接约束，空
source_min_build_height   INT     -64
AST_MaterialSummary       COMPOUND {blocks, items, total_blocks=LONG,
                                    unique_block_types, unique_item_types, total_items}
sublevels                 LIST<COMPOUND>
```

`AST_MaterialSummary` 是纯统计（示例 total_blocks=330 / unique_block_types=31 / total_items=661），不参与几何还原。

## `sublevels[i]`

```
sublevel_id               INT[]    4×int32
original_sublevel_id      INT[]    4×int32
local_anchor_space        STRING   'saved_plot_local_v1'
local_anchor              COMPOUND {x,y,z}
relative_position         COMPOUND {x,y,z}
relative_orientation      COMPOUND {w,x,y,z}
relative_rotation_offset  COMPOUND {x,y,z}
runtime_contraptions      LIST<COMPOUND>
plot                      COMPOUND  ← 真正的内容
```

## `plot` → `chunks` → `sections`

```
plot
├── plot_x=1, plot_z=3, log_size=7, data_version=1
├── biome = 'minecraft:cold_ocean'
├── isLightOn BYTE 1
├── AST_SimulatedHoneyGlue  LIST<COMPOUND>
└── chunks  COMPOUND
     └── key "274877907008"
```

**chunk key 是打包坐标**：`274877907008 = 0x4000000040` → 高 32 位/chunkX=64、低 32 位/chunkZ=64（十进制键写成 `chunkX * 2^32 + chunkZ` 的形式）。

每个 chunk（原版 1.21.1 结构）：

```
sections          COMPOUND { "11": …, "12": … }     ← section Y 索引作字符串 key
block_entities    LIST<COMPOUND>                     （该样本 121 条）
heightmaps        {WORLD_SURFACE, OCEAN_FLOOR, MOTION_BLOCKING, MOTION_BLOCKING_NO_LEAVES}
block_ticks       LIST<END> 0
fluid_ticks       LIST<END> 0
```

每个 section：

```
BlockLight   BYTE[]  2048    (4096 方块 × 4 bit)
SkyLight     BYTE[]  2048
block_states COMPOUND { palette: LIST<COMPOUND>, data: LONG[] }
```

## section `block_states` 打包公式（已用真实文件验证）

`bits = max(4, ceil(log2(paletteSize)))`，`valuesPerLong = 64 / bits`（整除向下），`longs = ceil(4096 / valuesPerLong)`。

样本中 palette=57 → bits=6、vpl=10、longs=410，与文件里 `data` 的 410 个 LONG **完全吻合**。

| palette 大小 | bits | valuesPerLong | longs |
|---|---|---|---|
| 1–16 | 4 | 16 | 256 |
| 17–32 | 5 | 12 | 342 |
| 33–64 | 6 | 10 | 410 |
| 65–128 | 7 | 9 | 456 |
| 129–256 | 8 | 8 | 512 |

palette[0] 通常为 `minecraft:air`。这条公式是自造 `.excraft` 的可行基础；`BlockLight`/`SkyLight` 可先全填亮，`heightmaps` 可先近似。

## `.nbt` 侧 sub_levels 结构（对照，另一条线）

对比 `飞艇.nbt`：顶层 `blocks/palette/entities` 为空，内容全下潜到 `sub_levels`：

```
ROOT  DataVersion INT | size LIST<INT>×3
      blocks LIST<END>×0 | palette LIST<END>×0 | entities LIST<END>×0
      sub_levels LIST<COMPOUND>×1
sub_levels[0]
  DataVersion INT (3955)
  size LIST<INT>×3                      该 sub-level 自己的尺寸（样本 [17,19,46]）
  position COMPOUND {x,y,z} DOUBLE      相对顶层浮点偏移（需 double 精度）
  orientation COMPOUND {w,x,y,z} DOUBLE  单位四元数，非欧拉角
  uuid INT[] 4×int32
  palette LIST<COMPOUND>
  blocks LIST<COMPOUND> {pos:[x,y,z], state:n}
  entities LIST<COMPOUND>
```

`飞艇.nbt` palette 中含 `aeronautics:pearlescent_levitite`（升力方块），是飞艇浮起来的机制来源。

## 自建 writer 的踩坑（`mcopt/nbtgen/`）

- `nbtwrite.py`：通用 NBT 编码器。三个坑：①COMPOUND 嵌套时 tuple 解包爆炸；②过度激进的 tag 类型覆盖导致 `struct.error: required argument is not an integer`；③`LIST<END>` 需 tag=0 且长度 0。
- `make_sublevel.py`：sub-level 蓝图生成器，产出 `AAA_phys_test.nbt`（320 B，3×3×3 levitite）等，用同一 parser 读回验证与 `飞艇.nbt` 同构（但该文件被 Create 判为无 placement targets，见上表）。

## 下一步验证路线（尚未走完）

1. section 编码器（palette + data 按上式打包）
2. BlockLight / SkyLight 全亮填充
3. heightmaps 近似
4. 顶层骨架（format / plot_x,z / log_size=7 / biome / sublevel_id / root_orientation）
5. **先用现成 `.excraft` 做 unpack→repack 字节级往返验证**，再做 3×3×3 levitite 飞行石，进游戏看是否浮起。往返不过则生成文件会静默失败。

## 相关文档

- `f63f9505-9471-4383-8877-9b4e0c9ac3bc`：Sable 2.0.6 + Aeronautics 1.3.2 的 sub_levels 判据与蓝图渠道实测
- `4a5cedc7-4f1b-416f-bf6d-e08a3c814154`：Create 工具枪原生 `.nbt` 蓝图与 endless 限高取证
- `71420e57-86ef-4da8-bd77-7097009d0ff2`：schemtool 三格式转换工具链（nbt/litematic/schem）
