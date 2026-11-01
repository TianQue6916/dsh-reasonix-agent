---
id: "f651fb17-4464-4764-9a19-a38066b95e01"
title: "fluxscope：canvas 弧带舞台实现要点（命中反解、指针锚点缩放、实时流光）(2026-10-29)"
description: "2026-10-29 fluxscope 实现 handoff：极坐标 arc-band 舞台的 O(1) 命中反解、world/device 两空间与指针锚点缩放公式、拖拽 5px 阈值、SSE 事件流光方向语义、三档交互（hover/click/filter）与已知边界（高倍缩放露白）。"
status: "active"
created_at: "2026-10-29T06:09:52.693Z"
updated_at: "2026-10-29T06:09:52.693Z"
content_hash: "170d4a09a7d3e3f44b33b684de0d110d75cb2c5ea291a8b7b76b9a3cef9185e4"
source_paths:
  - "fluxscope"
session_ids:
  - "7792154d-1369-49ba-8b15-63d0dd40d5cf"
memory_body_ids:
  []
---

# fluxscope：canvas 弧带舞台实现要点（2026-10-29）

自建的 DSH 工具调用实时可视化（替代插件路线，背景见文档 `a44c16cf-dec0-4d92-8fba-0ff6ca626273` 的 OTLP 调研结论）。服务本地跑在 `3921`，页面截图在 `fluxscope/`（h2.png / l1.png / z1~z3.png）。提交：`340f352`（arc-band stage + prominences + live flow + hover/click/filter）、`27de6a7`（wheel zoom + drag pan + dblclick reset）。

## 交互分层（按 Shneiderman mantra）

`overview first, zoom and filter, then details-on-demand`：

| 操作 | 效果 |
|---|---|
| hover 格子 | 烧亮描边 + tooltip（任务文本 / calls / depth / 最近 3 次调用参数摘要） |
| click 格子 | 右侧滑出 CALL SEQUENCE，该 agent 全量调用序列倒序；`Esc` 关闭 |
| 点 CLASS FLUX 某行 | 按类别过滤弧带，其余格子/日珥压到 2% 亮度 |
| 实时事件 | 格子边缘闪 → 光点沿贝塞尔飞向 hub → hub 冲击波 |

设计依据：FUI 的常见失败是用户「不敢点」（边缘锐度/辉光频率与眼动冲突，被潜意识判定不可交互），所以 hover 必须给出立即证据；canvas 无 DOM 事件，命中必须自算。

## 命中测试：极坐标闭式反解，O(1)

378 个格子不遍历、不建索引树：

```
dx = x − cx,  dy = y − cy
r  = √(dx²+dy²),  θ = atan2(dy, dx)
i  = ⌊(θ − A0) / dA⌋,  j = ⌊(r − R_IN) / dR⌋
```

换成正交网格或 SVG 都会退化为遍历或需要索引结构；极坐标格子有闭式反解是选型关键。

## 视图变换：几何不动，只加一层

此前几何直接绑定画布尺寸（每次按 `W`/`Hgt` 重算圆心半径），因此没有 zoom/pan。补法是让几何保持在世界坐标，只在绘制前设置变换：

```js
const VIEW = { z: 1, ox: 0, oy: 0 };
g.setTransform(1, 0, 0, 1, 0, 0); g.fillRect(0, 0, W, Hgt);   // 清屏在设备空间
g.setTransform(VIEW.z, 0, 0, VIEW.z, VIEW.ox, VIEW.oy);       // 绘制在世界空间
```

**指针锚点缩放**（让鼠标下的点不动，k = z'/z）：

```
ox' = mx − (mx − ox)·k
oy' = my − (my − oy)·k
```

推导：世界点 p 映射 s = p·z + o，要求 p·z' + o' = s 且 p 不变 →
p = (mx − ox)/z，o' = mx − p·z' = mx − (mx − ox)·z'/z。不做锚点修正的话缩放永远对左上角，是最常见的实现缺陷。

**命中测试必须反变换**：`wx = (px − ox)/z, wy = (py − oy)/z`，否则放大后 hover 偏移量 = (z−1)·o，倍数越大越离谱。

**拖拽与点击区分**：`mousedown` 累计位移超过 5px 判为 pan，`mouseup` 不再触发选中（5px 为鼠标抖动容差）。zoom 范围 0.35×–8×，双击重置视角并取消选中，header 显示 `ZOOM 1.14×`。

## 实时流：ingest 与脉冲

SSE 每来一个 tool call，`ingest(e, paint)` 做两件事：累计统计（`S.total`、每类别 `S.cat/catBytes/catDecay`、session 记录、dur 窗口、topTools），以及 `paint !== false` 时压入一条 flow 记录：

```js
S.flows.push({ sid, ci, t0: S.time,
  dur: Math.min(1.8, 0.5 + Math.log10(1+dur) * 0.3),
  w: Math.min(1, 0.3 + Math.log10(1+bytes)/5),
  err, kind: ci === 3 ? 1 : (isWrite(name) ? 2 : 0), seed: hash32(e.callId||name) });
```

时长/宽度都用 log 压缩，避免长调用把流线拉爆；`seed` 保证同 callId 的形状稳定。事件与 flow 都限长（events 400 / flows 200 / subNodes 150）防内存增长。

**方向语义不能反**：工具调用从 agent 流向 runtime，所以流光从弧带射向中心 hub。反过来画等于宣称「runtime 在给 agent 派活」，与实际因果相反。

## 已知边界（未处理）

放大到 3× 以上时，弧带外空白会露出——世界坐标里原本就没画东西（背景 mesh 与散点只覆盖 0~92% 画面）。两种改法：给背景加随视图铺开的世界网格，或把 pan 限制在画面边界内；当时留作待选。

其他待办：时间窗滑杆（当前弧带只反映最近活动排序，无时间维度，无法回放某一天）、弧带密度上调（54×7 → 80×9，日珥现在还能数出根数）。
