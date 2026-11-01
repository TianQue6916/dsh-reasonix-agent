---
id: "fbde9b19-42d2-49c4-bc80-e4b31ec218b7"
title: "gugong 自产 OBJ → Minecraft 体素化：结构实测、材质映射与分步策略（2026-11-02）"
description: "gugong 项目自产 forbidden_city.obj（203 MB / 172.4 万 tri）转 Minecraft 蓝图的可行性实测：OBJ 行类型统计（每面带 usemtl、20 种材质）、1 单位 = 1 m 与 Z-up 的坐标标定、离群 bbox 判据、材质 id 与 Z 范围互证、材质→MC 方块映射表、体素化规模/耗时估算，以及「先切太和殿一段再全量」的分步策略。承接 dc5438d0 的 mesh2nbt 链路与 a9c01787 的故宫体素化可行性账。"
status: "active"
created_at: "2026-11-01T16:37:49.535Z"
updated_at: "2026-11-01T16:37:49.535Z"
content_hash: "920a240d89eedf5eed3e8e470c7e6d7567dadf14a579763e20662a5de53320f4"
source_paths:
  - "projects/gugong/out/forbidden_city.obj"
  - "projects/gugong/core/mesh.py"
  - "projects/gugong/core/building.py"
  - "projects/gugong/data/site.py"
  - "projects/gugong/README.md"
session_ids:
  - "5a6511a8-6326-4ff2-bc63-9689ac452421"
memory_body_ids:
  []
---

# gugong 自产 OBJ → Minecraft 体素化（2026-11-02）

## 结论

`projects/gugong/out/forbidden_city.obj` **可以转**成 MC 蓝图，关键前提已满足：**每个三角面都带 `usemtl`**，且 **1 单位 = 1 m、Z-up**，与 MC「1 方块 = 1 m」直接对齐，**不需要缩放**。

这是与 [a9c01787](documents/active/minecraft-2026-10-31-a9c01787.md) 中「靠外部模型源」阶段不同的局面：模型已自产，材质语义完全可控，并且有源码级映射依据。

## 1. OBJ 结构实测（流式全量扫描，非估算）

```
lines        8,620,141
v            5,172,084
f            1,724,028
usemtl       1,724,028     ← 每面一条
vn                   0     ← 无法线
o / g                0     ← 无分组
mtllib               0     ← 无 .mtl 文件
#                    1
```

- 材质种类 **20 种**（mat0…mat22，编号不连续）。面数分布极不均匀：`mat6` 361,284 / `mat13` 332,974 / `mat3` 293,712 / `mat2` 291,400 / `mat0` 205,986，尾部 `mat21` 仅 2 面、`mat22` 4 面。
- **无 `vn` 不是问题**：表面体素化只依赖三角形的位置，不依赖法线。
- **无 `o`/`g` 不阻碍分块**：按坐标切片（而不是按 group）即可切出单体建筑。
- **无 `.mtl` 不阻碍**：材质 id → 名字的映射在源码里，不在文件里，必须从 `core/mesh.py` 的 `MATERIALS` 表反查（见 §4）。

写 OBJ 的唯一位置是 `core/mesh.py:153`：`fh.write(f"usemtl mat{m}\n")`，即材质 id 直接拼进 `usemtl` 名，**这就是 id 可恢复的保证**。

## 2. 坐标系与单位标定

`data/site.py` 头部声明：

```python
坐标：+x 东，+y 北，z 上，单位 m。原点 = 午门城台中心。
AXIS_LEN  = 961.0   # [M] 南北
EAST_WEST = 753.0   # [M] 东西
```

OBJ 头部 `v -376.5000 0.0000 0.0000` 印证：`-753/2 = -376.5`，正卡在宫城西墙。

**成长教训（易误判）**：整体扫描得到的 bbox `X ±1168.5 / Y -792..1753 / Z -4.1..40.98` 是**离群顶点**（护城河外侧、背景地面 decal 之类），主体在 `±376.5` 内。直接拿全量 bbox 算缩放系数会得到 X/753 = 3.10 这种荒谬比值。**标定必须用分位数或按材质分桶，不能用 min/max。**

正确做法：按材质统计 Z 范围（见 §3）即可自证坐标轴含义，比全量 bbox 可靠。

## 3. 材质 id 与 Z 范围互证（材质没串）

按材质扫 80 万面的 Z 分布：

| mat | 面数 | zmin | zmax | 语义 |
|---|---|---|---|---|
| mat2 | 281,032 | 0.00 | 12.20 | 汉白玉台基、栏板 |
| mat13 | 155,510 | 11.12 | 32.31 | 瓦面暗部、下檐 |
| mat6 | 136,006 | 3.00 | 33.03 | 檐下、椽望 |
| mat3 | 125,200 | 5.11 | 27.55 | 青绿彩画（斗拱/椽/檐下）|
| **mat0** | 64,630 | 10.98 | **37.59** | 黄琉璃瓦（最高，符合语义）|
| mat16 | 8,836 | 3.02 | 18.90 | 藻井、宝顶、金饰 |
| mat1 | 6,208 | 3.00 | 26.11 | 宫墙红 |
| mat15 | 6,162 | 3.28 | 19.15 | 室内柱梁（红）|
| mat14 | 6,158 | 3.00 | 12.47 | 室内金砖地面 |
| mat19 | 6,110 | 4.02 | 18.80 | 天花彩画 |
| mat4 | 2,220 | 3.00 | 25.70 | 门、槛窗 |
| mat10 | 1,616 | -0.02 | 9.90 | 庭院灰砖 |
| mat7 | 80 | 0.00 | 12.00 | 宫城城墙 |
| mat8 | 8 | **-4.10** | -4.10 | 护城河（最低）|

**台基 0–12 m、黄瓦 11–37.6 m、护城河 −4.1 m**：每个材质的垂直位置与语义一致，说明 id 未串，可直接用作配色依据。

## 4. 材质 → MC 方块映射

`core/mesh.py` 的 `MATERIALS: dict[int, tuple[albedo_rgb, kind]]` 是唯一真源；`core/building.py:14-17` 另有具名常量（`MAT_TILE=0, MAT_WALL=1, MAT_STONE=2, MAT_PAINT=3, MAT_DOOR=4, MAT_GROUND=5, MAT_SOFFIT=6, MAT_CITYWALL=7, MAT_WATER=8, MAT_GOLD=9, MAT_BRICK=10, MAT_TREE=11`）。

| id | 语义 | MC 方块（初稿）|
|---|---|---|
| 0 | 黄琉璃瓦 | `minecraft:yellow_terracotta` |
| 13 | 瓦面暗部 | `minecraft:yellow_concrete` |
| 1 | 宫墙红 | `minecraft:red_terracotta` |
| 7 | 宫城城墙 | `minecraft:red_nether_bricks` |
| 2 | 汉白玉 | `minecraft:quartz_block` |
| 5 | 广场砖 | `minecraft:smooth_stone` |
| 10 | 庭院灰砖 | `minecraft:stone` |
| 22 | 甬路石板 | `minecraft:andesite` |
| 6 | 檐下椽望 | `minecraft:dark_oak_planks` |
| 3 | 青绿彩画 | `minecraft:warped_planks` |
| 19 | 天花彩画 | `minecraft:cyan_terracotta` |
| 4 | 门窗 | `minecraft:dark_oak_planks` |
| 9 / 16 / 20 | 鎏金宝顶 / 藻井金饰 / 屏风匾额 | `minecraft:gold_block` |
| 8 | 护城河 | `minecraft:water` |
| 11 | 树木 | `minecraft:oak_leaves` |
| 21 | 草地 | `minecraft:grass_block` |
| 14 | 室内金砖 | `minecraft:polished_blackstone` |
| 15 | 室内柱梁 | `minecraft:red_terracotta` |
| 17 | 紫檀家具 | `minecraft:dark_oak_planks` |
| 18 | 青花瓷 | `minecraft:blue_terracotta` |
| 12 | 假阴影 decal | **丢弃** —— 转成方块会变成脏斑 |

注意 `mat12` 是渲染用的投影贴片，**必须在体素化前过滤**，否则地面会出现黑色污块。

## 5. 规模与耗时

```
平面    961 × 753 格
高度    0 → 37.6 格
表面积  172.4 万 tri → 表面体素化后约 100–200 万方块
蓝图    约 5–8 MB
```

| 环节 | 估计 |
|---|---|
| 解析 203 MB / 862 万行（流式）| 40–60 s |
| Z-up → Y-up 旋转 | < 1 s |
| 表面体素化 172.4 万 tri | 2–5 min（按材质分桶可压到 ~1 min）|
| 写 .nbt | 10–20 s |
| Litematica 粘贴 | 约 15–25 s，内存 ~80 MB |

「能粘贴，不卡死」的结论依赖 [dc5438d0](documents/active/minecraft-nbt-dc5438d0.md) 里已跑通的 `mesh2nbt` 链路。

## 6. 分步策略（推荐）

不要一口气转全量。**先切 y=280..330 只转太和殿**（太和殿中心 y=305，面阔 60、进深 33），1–2 分钟出结果，验三件事：

1. **材质配色**：黄瓦 / 红墙 / 白玉台基是否读得对；
2. **尺寸标定**：转出来应约 60 × 33 格；
3. **体素化漏洞**：屋顶薄面会不会漏成筛子。

三项通过后再跑全量；否则 203 MB 走一遍就是几分钟白费。

## 7. 未验证 / 风险

- **薄面漏筛**：屋顶与斗拱是薄壳三角面，表面体素化可能出现孔洞，需在太和殿试点上确认，必要时加厚度或做 voxel dilation。
- **台阶状锯齿**：1 m 体素对细部（斗拱、棂花、望柱）分辨不足，属分辨率上限而非 bug。
- **体素化实现尚未落地**：本轮只完成结构与映射盘点，转换器代码未写；`mesh2nbt` 是否直接可用需实测。
- 文件为 203 MB 单 obj，**解析必须流式**，一次性读入会吃满内存。

## 相关文档

- [dc5438d0](documents/active/minecraft-nbt-dc5438d0.md) —— 模型→体素→.nbt 三套转换器与参数（`--scale` / `--slice` / `--height`）
- [a9c01787](documents/active/minecraft-2026-10-31-a9c01787.md) —— 故宫尺寸硬数据与体素量可行性账
- [b66ae6a4](documents/active/gugong-71-4-tri-2026-11-01-b66ae6a4.md) —— gugong 渲染后期链与色调映射
