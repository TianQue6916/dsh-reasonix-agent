---
id: "750772c2-c433-440c-b9a4-79183b73429f"
title: "故宫 OBJ → Litematica .nbt 全量产出：S=5 / S=6 分块成果、坐标口径与四个实现陷阱（2026-11-02）"
description: "gugong forbidden_city.obj 体素化跑通全量交付：S=5（4596 万 blocks）与 S=6（6620 万 blocks）各切 2×2 tile 的 .nbt、world grid 与耗时；分块拼接 offset 口径与坐标映射公式；四个必踩 bug（mat11 背景 billboard 幕布、palette index 0 必须 air、uint8&bool 退化整数索引、pos 的 TAG_List 头写错）；渲染 depth 排序与 litematica /fill tick 预算社区经验。承接 1df86ecc 的 scale 预算与 min-area 实测。"
status: "active"
created_at: "2026-11-01T17:39:36.487Z"
updated_at: "2026-11-01T17:39:36.487Z"
content_hash: "cccd2a78dc179711599aae0a9d4a0113cfd5d53fd28d2202c8414ffcca5861ee"
source_paths:
  - "mcopt/obj2vox3.py"
  - "mcopt/render_npz.py"
  - "mcopt/fg/out/README.md"
session_ids:
  - "7ccd49c4-7b13-4d0e-b2f5-ea19f6d00187"
memory_body_ids:
  []
---

# 故宫 OBJ → Litematica .nbt：全量产出与实现陷阱

承接 [故宫 OBJ → Minecraft：scale/方块数预算、min-area 过滤实测与体素化超时根因](documents/active/obj-minecraft-scale-min-area-2026-11-02-1df86ecc.md)（预算与超时根因）与 [gugong 自产 OBJ → Minecraft 体素化](documents/active/gugong-obj-minecraft-2026-11-02-fbde9b19.md)（材质表与轴向）。本文记录 scale 5 / 6 两档**真正跑通并交付**的结果，以及途中修掉的四个 bug。

## 交付成果（scale 5 / 6）

源 mesh：148995 tris kept，proj area 2.413 M m²（面积过滤后）。

| 档 | 文件 | 每 tile blocks | 合计 | 通高 | world grid | 单 tile 文件 | 耗时 |
|---|---|---|---|---|---|---|---|
| **S=5** | `gugong_s5_{00,01,10,11}.nbt` | 1139 / 1168 / 1100 / 1189 万 | **4596 万** | 221 格 | 4366×221×5406 | 33–36 MB | 117 s |
| **S=6** | `gugong_s6_{00,01,10,11}.nbt` | 1634 / 1686 / 1580 / 1719 万 | **6620 万** | 265 格 | 5239×265×6487 | 46–50 MB | 171 s |

产物目录 `mcopt/fg/out/`。S=8 预估每 tile ~2940 万 blocks、通高 353 格、每 tile grid 4 GB、串行约 5 分钟。

**关键缩放特性**：blocks 数与 S 大致成 S² 关系（5→6 时 4596 万→6620 万 ≈ ×1.44 ≈ 36/25），因为故宫以水平屋面为主，通高增长远慢于平面增长。

## 分块拼接口径

每 tile 的 `size` 固定为 tile 尺寸、**内部不 trim**，所以平移即无缝拼接：

```
        j=0(北)                 j=1(南)
i=0   _00  (0, 0, 0)         _01  (0, 0, 3243)      # S=6 的 ZHalf
i=1   _10  (2619, 0, 0)      _11  (2619, 0, 3243)   # S=6 的 XHalf
```
S=5 的 XHalf / ZHalf 为 2183 / 2703。机器可读 offset 在 `gugong_s6.json` 的 `tiles[*].offset`，含 `scale` / `world` 三围 / `origin_obj`。

坐标映射：`mc_x=(X-minX)*S`、`mc_y=(Z-minZ)*S`、`mc_z=(maxY-Y)*S`。OBJ 是 +X 东 / +Y 北 / +Z 上，原点在午门城台中心 —— 因此蓝图里 **+Z 是南**，午门在 z 大的一端。（MC 的 y 是高度，OBJ 的 Z 才是高度，这一步的轴重排是最容易错的地方。）

## 四个实现陷阱（都复现在这一轮）

1. **背景幕布**：mat 11 里有 8 个三角、合计 4.875 M m² —— 占模型表面积 **66%**，顶点 z≈0..7.9、x/y 跨度 2337×2545。是立在场景里的远景 billboard，不剔除就会把整块平面填满成实体方块。判据：极少 tri 数 + 极大投影面积，必须单独 min-area 或按材质剔除。
2. **palette 的 index 0 必须是 `air`**：grid 存的是 `MID = 在 KEYS 里的位置 + 1`，palette 缺 air 会让所有 state 整体偏移 1 —— 症状是上一版图里所有汉白玉被读成青色木板（材质错位，而不是报错）。
3. **`uint8 & bool` 陷阱**：`keep = (area>=x) & VALID[M]` 得到的是 uint8 而非 bool，`area[keep]` 会退化成整数索引，导致面积统计虚报 106 倍。写法必须是 `VALID[M] > 0`。
4. **`pos` 的 TAG_List 头**：写成 `0x01`(TAG_Byte) 而不是 `0x09`(TAG_List)，导致整个 block compound 解析错位 —— 文件能写出来、大小也合理，但读进去全乱。校验值：`gugong_s5_00` DataVersion 3955、decompressed 410,164,468 B；`gugong_s5_11` decompressed 428,123,896 B。

## 渲染验证

`render_npz.py` 按 `depth = (x·SA + z·CA) + y*1.4` 排序（相机在上方俯视，高处必须后画），6620 万 blocks 渲染 115 s，无背面透出的亮块。这是从上次空间站渲染继承的经验 —— 少这步就会出现低处方块盖住高处屋脊。

## 社区经验

- **litematica paste 走 `/fill` 批量**（[Discussion #817](https://github.com/maruohon/litematica/discussions/817)）：paste 由 tick 预算驱动，每 tick 超过约 50 ms 就暂停该 tick 的后续任务 —— 所以大 schematic 不是失败，而是**变慢**。这解释了为什么单块 1600 万 blocks 仍然可贴，只是要等。
- **[ObjToSchematic](https://github.com/LucasDower/ObjToSchematic)** 是这条 OBJ→schematic 路线的现成实现，但它按贴图取色匹配方块；本项目按 `usemtl` 语义映射材质，可控性更高 —— 自建转换器（`obj2vox3.py`）是正确的选择。
