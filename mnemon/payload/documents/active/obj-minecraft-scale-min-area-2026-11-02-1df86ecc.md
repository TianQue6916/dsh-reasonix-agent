---
id: "1df86ecc-bc46-4f8e-8798-4527a571275b"
title: "故宫 OBJ → Minecraft：scale/方块数预算、min-area 过滤实测与体素化超时根因（2026-11-02 交接版）"
description: "gugong forbidden_city.obj（2.5 s 解析 / 172.4 万 tri / 7.41 M m²）转 MC 蓝图的量化预算：scale 1–5 的高度·平面·方块数·.nbt 大小·Litematica 内存表，min-area 过滤实测（0.5 m² → 14.9 万 tri 保留 98.5% 面积），体素化速度 24470 tri/s，全量超时根因判定（大三角 meshgrid 内存爆，非解析/非算法），以及 A/B/C 方案与用户拍板 C（scale=3）。补充 fbde9b19 的可行性文档。"
status: "active"
created_at: "2026-11-01T16:58:40.720Z"
updated_at: "2026-11-01T16:58:40.720Z"
content_hash: "b1856f61feded4a5aba87feb337420f4d8c5a16f79b21e22cebc5285875e758b"
source_paths:
  - "projects/gugong/out/forbidden_city.obj"
  - "projects/gugong/core/mesh.py"
  - "projects/gugong/data/site.py"
  - "mcopt/obj2vox.py"
  - "mcopt/nbt2png_mat.py"
  - "mcopt/taidian.py"
session_ids:
  - "aef42fa7-dc1a-4a8d-b5f2-f007c9e09b72"
memory_body_ids:
  []
---

# 故宫 OBJ → Minecraft 蓝图：规模预算与全量转换卡点（交接版）

承接 [gugong 自产 OBJ → Minecraft 体素化](documents/active/gugong-obj-minecraft-2026-11-02-fbde9b19.md)（那份记录的是可行性/材质映射/分步策略）。本篇只记**量化预算、实测速度、超时根因与拍板决策**。

## 目标（可判定）

`projects/gugong/out/forbidden_city.obj` → `gugong_s3.nbt`：scale=3、方块数 ≤ 1000 万、输出可被 Litematica 载入粘贴。

## 核心矛盾：高度与平面必须同倍缩放

模型 `1 单位 = 1 m`，故宫真实通高约 40 m。**高度放大 N 倍，平面也必须放大 N 倍**（否则变形），于是表面积按 scale² 增长、方块数近似按 scale² 增长：

| scale | 高度 | 平面 (X × Z) | 表面方块数 | .nbt 大小估算 | Litematica 内存 |
|---|---|---|---|---|---|
| 1× | 40 | 961 × 753 | 7.4 M | 28 MB | ~300 MB |
| 2× | 80 | 1922 × 1506 | 29.7 M | 113 MB | ~1.2 GB |
| **3×（C 档）** | **120** | **2883 × 2259** | **66.7 M → 过滤后 ~9 M** | **~36 MB** | **~1.4 GB** |
| 4× | 160 | 3844 × 3012 | 118.6 M | 452 MB | ~4.8 GB |
| 5× | 200 | 4805 × 3765 | 185.3 M | 707 MB | ~7.4 GB |

用户原始要求「高度 150–200」在**单文件**上不可能：那等于 scale 4–5，1.19–1.85 亿方块，Litematica 无法载入、WorldEdit 会 OOM；且 4805×3765 格 = 300×235 区块，远超 MC 视距（12–32 区块），站在里面看不到整体。若要 200 格只能按 961×753 切 9 片、分次粘贴对齐（未采用）。

**已拍板**：用户选 **C 档（scale=3，高 120 格）**，全量一次出，不做分片。

## 表面积偏高的原因与削减

总表面积 **7.41 M m²**，但故宫建筑面积仅约 15 万 m²，差 50 倍——因为 `core/building.py` 把斗拱（~0.3 m）、椽、瓦垄（~0.2 m）、棂花都做成了实体几何。这些碎面在 1 方块 = 1 m 时全落进同一格，属于白算。

按三角形面积过滤实测（全量 1,724,028 tri / 7.41 M m²）：

| min-area | 保留 tri | 占比 | 保留面积 |
|---|---|---|---|
| 0.1 | 462,859 | 26.8% | 7.37 M m² |
| **0.5（采用）** | **149,003** | **8.6%** | **7.30 M m²（98.5%）** |
| 1.0 | 79,213 | 4.6% | 7.25 M m² |
| 2.0 | 45,989 | 2.7% | 7.21 M m² |

`min-area 0.5` 是纯收益档：丢 91.4% 的面但面积只掉 1.5%。

## 实测性能

| 环节 | 实测 |
|---|---|
| 解析 203 MB / 862 万行（bytes 级 split + 向量化） | **2.5 s**（read 0.1 s / split 0.4 s / filter 1.0 s / V 1.9 s / T+M 2.5 s） |
| 体素化 | **24,470 tri/s**（5 万面 → 71,721 voxel，2.0 s） |
| 全量 172 万 tri 外推 | ~70 s |
| 3D grid @ scale=3 | 2883 × 120 × 2259 = 7.8 亿格，uint8 = **780 MB**（未验证是否真正可行） |

结论：**解析不慢、算法不慢**，瓶颈不在吞吐。

## 全量超时的根因（已定位）

`obj2vox.py`（5245 B）全量跑超时，根因是**大三角的 `np.meshgrid` 内存爆炸**：地面/水面单个三角的 AABB 在 scale=3 下是 2883 × 1 × 2259 ≈ 650 万点，一次性 `meshgrid` 展开成 int64 约 156 MB；多个此类三角叠加即 OOM/换页。

修复方向（交接给下个 session）：
1. 按主轴投影做 2D 栅格化（对近水平面尤其有效），避免 3D meshgrid；
2. 或沿最长轴每 64 格切片栅格化；
3. 先跑太和殿小块验管线（`--bbox -80 80 280 330`），再全量；
4. 若 780 MB grid 撑不住，按 X 每 128 格分块栅格化后拼接。

## 坐标变换（已确认）

`data/site.py` 明写「+x 东，+y 北，z 上，单位 m，原点 = 午门城台中心」。OBJ 头部 `v -376.5000 0.0000 0.0000` = −753/2，正好卡西墙。此前统计的 bbox `X ±1168.5 / Y −792..1753` 含离群顶点（护城河外/背景地面），主体在 ±376.5 内。

到 MC：`mc_x = (X − minX) * S`、`mc_y = (Z − minZ) * S`、`mc_z = (maxY − Y) * S`。

材质 id 与 Z 高度的对应已交叉验证（mat2 汉白玉 0–12.2 m、mat0 黄琉璃瓦 10.98–37.59 m、mat8 护城河 −4.1 m），说明材质 id 未串。

## 交接产物清单

- `mcopt/obj2vox.py`（5245 B）—— 待修的就是它
- `mcopt/nbt2png_mat.py`（5069 B）—— 渲染器可用
- `mcopt/taidian.py`（8916 B）—— 太和殿程序化生成器（33,243 方块 / 9 材质，`PLAT`/`EAVE`/`ROOF_L`/`ROOF_U`/`PALETTE` 可调）
- `mcopt/obj2nbt.py`（7702 B）—— 早期逐行解析版，**弃用**（改读 .npy）
- `mcopt/fg/work/{V,T,M}.npy`（124.1 MB / 20.7 MB / 6.9 MB）—— 已解析几何，`np.load` 直接用，不必再解析 obj
- 已交付样本：`taihedian.nbt`（97,749 B）
- 会话交接 plan：`C:\Users\27063\.dsh\plans\session-9cf09938-2bd8-43d5-aa59-79513d3f17d4.md`（4936 B，plan-anchor 只注入前 30 行，第 31 行起需自行 read）
