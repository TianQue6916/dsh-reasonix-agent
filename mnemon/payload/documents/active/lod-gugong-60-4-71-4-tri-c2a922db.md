---
id: "c2a922db-ebdf-4763-82f7-c921674ae78e"
title: "LOD 分级与内景/外景同轮推进：gugong 故宫建模第四轮（60.4 万→71.4 万 tri）"
description: "gugong 故宫建模第四轮：按建筑宽度三档 LOD（width>40/>22 判 subdiv 11/7/4 与斗拱档位）省 12% tri；檐口两环瓦垄 0.36 m；御花园复用角楼 poly_rings 做圆攒尖亭、堆秀山棱柱+御景亭；庑房每 3 m 开门窗摆脱\"一道堤\"；补阙左/阙右门与内金水河五桥；室内龙纹屏风/烛台/落地罩用色块结构暗示做不出的纹样；04 机位 shadow=False+环境光 1.2 修前景发蓝；含 Mesh.box 参数个数踩坑与四项遗留。"
status: "active"
created_at: "2026-11-01T12:20:13.207Z"
updated_at: "2026-11-01T12:20:13.207Z"
content_hash: "2a69d7f3be00643c749291caafb65cab60a38b7b84700e597c19431c43705ee5"
source_paths:
  - "projects/gugong/build_scene.py"
  - "projects/gugong/core/building.py"
  - "projects/gugong/core/interior.py"
  - "projects/gugong/core/roof.py"
  - "projects/gugong/core/mesh.py"
  - "projects/gugong/render/raster.py"
  - "projects/gugong/data/site.py"
  - "projects/gugong/out/01_axis_aerial.png"
  - "projects/gugong/out/04_yangong.png"
session_ids:
  - "6fa844e0-53a1-4bf4-821e-32cfa47d090d"
memory_body_ids:
  []
---

# LOD 分级与内外同轮推进：gugong 第四轮

承接 [真阴影修复 + 室内/铺作/隔扇](documents/active/gugong-2026-11-01-6d64fa2c.md)（39 万 tri）。
本轮做了三件事：用 LOD 把预算从看不见的地方挪走、把御花园从"灰砖+树"补成建筑群、把庑房与午门—太和门之间的空档填上，再往室内加了三件套。
规模：60.4 万 → 71.4 万 tri / 138 万顶点 / 7 个模块约 2250 行 Python / 生成 21.7 s。

## 1. LOD 分级：先砍看不见的，才买得起看得见的

问题：一座 15 m 配房在 2400 px 鸟瞰里只占十几个像素，却和太和殿同样 `subdiv=10`、三跳斗拱+下昂、檐口瓦当、垂脊走兽，还建了室内。

判据按建筑宽度，三档：

```python
lod = 2 if h.w > 40 else (1 if h.w > 22 else 0)
subdiv = (4, 7, 11)[lod]
```

| 构件 | lod=2（大型殿） | lod=1（中型） | lod=0（配房） |
|---|---|---|---|
| 屋顶分段 | 11 | 7 | 4 |
| 斗拱 | 栌斗+三跳+散斗+昂（约 20 box） | 栌斗+一跳（8 box） | 无 |
| 檐口瓦当/垂脊走兽 | ✓ | ✓ | ✗ |
| 室内 | ✓ | ✓ | ✗ |

结果：省下约 12% 三角形，画面看不出差别。**原则：同一份预算，砍掉看不见的，才能加看得见的。**

## 2. 瓦垄几何化（只做檐口两环）

瓦面在着色层早有条纹（`shade_split` 里 `period=0.34`），但是平的。现在檐口第一段坡面每 0.36 m 一道真实凸棱：

```python
def _tile_ridges(m, r0, r1, step=0.36):
    # 从 rings[0] 到 rings[1]，四条边各按 step 分段，逐段 _bar 成一条瓦垄
```

只做前两环——再往上坡面自身遮挡，看不见。

## 3. 御花园：复用角楼的多边形屋顶生成器

**省时间的关键是复用第五轮为角楼（十字形）写的 `poly_rings`**：它本就支持任意星形多边形，圆只是特例。

| 构件 | 做法 |
|---|---|
| 万春亭 / 千秋亭 | 16 边形圆攒尖，复用 `poly_rings` |
| 浮碧亭 / 澄瑞亭 | 小一号的圆攒尖 |
| 堆秀山 | 26 个随机棱柱（`Random(20261101)` 固定种子）+ 山上御景亭（z=4.4） |
| 绛雪轩 | 单檐歇山，3 间 |
| 地面 | 草地（新材质 21）+ 十字甬路（材质 22） |

树：原来是"卡其色单锥体"，阳光下读成灰帐篷。改两处——颜色 `(0.30,0.33,0.28)` → `(0.24,0.34,0.17)`；形状改成两段棱柱叠成球（下半宽、上半收顶），副冠同理。

## 4. 庑房不能是"一道堤"

`wing_house` 原为"一整面红墙 + 压顶 + 双坡顶"，2400 px 鸟瞰里 220 m 长的一排看起来像堤，不像房子。改为每 3 m 一间：

```python
n = max(1, int(L / 3.0))
for i in range(n):
    # 门/窗（退进 0.07）+ 楣上彩画（青绿）+ 两侧壁柱
```

判据：**只要人眼能数出"这是一排房子"就够了，不必真的每间都建完整门窗构件。**

## 5. 午门—太和门之间的空档

- **阙左门 / 阙右门**：x=±58、y=148，各 3 间歇山 + 两侧接宫墙。
- **内金水河五桥**：中轴 1 座（宽 8.4 m）+ 左右各 2 座，桥面 + 两侧汉白玉栏板（`box` + 双层栏板）。

## 6. 室内三件套

| 构件 | 做法 |
|---|---|
| 龙纹屏风 `screen_dragon` | 两层回纹框（内缩 0.10 / 0.35）+ 5 段折线的龙身（头在 0.78 高、尾在 0.10）+ 四角云头 |
| 烛台 `candlestick` | 三足座 → 立杆 → 托盘 → 红烛，宝座两侧各一 |
| 落地罩 `partition` | 横枋 + n 根竖棂条 + 下部雕板，两次间外侧各一道 |

屏风纹样是硬凑的：真屏风是刺绣贴金，几何上做不出来。但用金/深两色小块拼出"框 + 折线 + 云头"，视觉上就能读出"有纹"——远胜一大片素色板。**这是本轮通用手法：几何做不出的纹样，用色块结构暗示。**

## 7. 相机修正：门洞内景关阴影

04 机位原地面发深蓝：光源高度角 26°，前方建筑投下长影，整片前景地面在阴影里，只剩环境光（天蓝色）。用户明确表示不在乎阴影，于是该机位 `shadow=False` + 环境光提到 1.2，地面回灰，门洞里的藻井、宝座、屏风、香亭、烛台全亮出来。

## 8. 踩坑

**`Mesh.box()` 参数个数**：`interior.py` 里 `screen_dragon` 给 `m.box()` 传了 9 个位置参数（尺寸 + 位置 + 材质少了一维），报 `TypeError: Mesh.box() takes 8 positional arguments but 9 were given`。批量加构件时这类签名错误只在整体 build 时才炸。

## 9. 本轮遗留

1. **右下角南三所配房错位**——鸟瞰里是一堆散落黄条，`wing_house` 的 detail 处分不清长宽方向。
2. **端门 + 皇城前区**——护城河以南是空的，需把 `ground()` 范围扩出去。
3. **还缺"站在宝座前"的机位**——04 只到门洞；可用机位 `center`/`radius` 局部化把像素密度提到 0.1 m/px 量级。
4. 给前几轮引用的社区项目补 star 的欠账仍未还。

## 文件

- `projects/gugong/build_scene.py`（`build_city` / `build_garden`，约 614 行）
- `projects/gugong/core/building.py`（`build_hall` / `_interior` / LOD 判定，约 584 行）
- `projects/gugong/core/interior.py`（`screen_dragon` / `candlestick` / `partition`，约 140 行）
- `projects/gugong/core/roof.py`（`_tile_ridges`，约 250 行）
- `projects/gugong/core/mesh.py`（`Mesh.box` 签名、`poly_rings`，约 124 行）
- `projects/gugong/render/raster.py`（shadow 开关、环境光参数，约 335 行）
- `projects/gugong/data/site.py`（约 52 行）
- 产出图：`out/01_axis_aerial.png` 2400×1500（机位抬到 300 m、俯角 28°，全城入画）、`02_santai.png` 2200×1450、`03_taihedian.png` 2000×1350、`04_yangong.png` 1700×1150（门洞内景，关阴影）、`05_corner.png` 1600×1100、`06_yuhuayuan.png` 1700×1150、`out/forbidden_city.obj`
