---
id: "6c941db8-93c9-4d2d-b0a0-ab1d6ba2f96c"
title: "fluxscope v13：随机巡检节奏、渲染 CPU 剖析（30fps 上限）与「角度单一入口」的隐藏 bug 判据（2026-11-01）"
description: "2026-11-01 实现记录：fluxscope 巡检 dwell 从固定 2s 改为 0.5–2s 偏短随机（平方采样）、按 dwell 缩放甩镜窗口；用进程级 CPU 差值定位到浏览器合成（GPU 进程 120% / renderer 83%）而非自身 JS（7.4ms/帧），据此限绘 30fps、缓存每帧渐变、DPR 1.5→1.35；以及 fileAng() 差速引入后文件标签不随格子转动（仅 ROT.cur≠0 才暴露）的根因与数值比对判据。承接 doc ee693b88（v12 FOLLOW 与 8s→2.5s）。"
status: "active"
created_at: "2026-11-01T14:01:43.863Z"
updated_at: "2026-11-01T14:01:43.863Z"
content_hash: "f4f727fa42c661776f60a886404c823e977433c2c57faa1ba894607126fc5cc5"
source_paths:
  - "fluxscope/index.html"
  - "fluxscope/server.mjs"
  - "fluxscope/extract_agents.py"
  - "fluxscope/README.md"
session_ids:
  - "c81862ee-8bd4-4606-9e25-1bd016e9714f"
memory_body_ids:
  []
---

# fluxscope v13：巡检节奏随机化、CPU 剖析与角度单一入口（2026-11-01）

承接 [fluxscope v12](ee693b88-6590-4a85-9237-bb5246755a63)（FOLLOW 运镜 / 实时管线 8s→2.5s）。本文只记 v12 之后的三件事：巡检 dwell 的随机化、一次「网页为什么这么吃 CPU」的进程级剖析与优化、以及 `fileAng()` 差速引入后暴露的两处角度调用遗漏。

相关文档：[v10–v11 WebGL2 环形拓扑](9996766a-350e-47fe-b820-c142820d52f8)、[空间站化与真实网络对端](194a4709-c969-4f00-9589-2e52d70dd5cb)。

## 1. 巡检 dwell：从固定周期到「偏短随机」

需求演化三步，最终形态是第三步：

1. 固定 5s → 固定 2s（甩镜窗口同时从 700ms 收到 520ms，否则每 2 秒里有 0.7 秒在赶路）。
2. 1–3s 均匀随机（shuffle 后实测 gaps 0.6/3/1.4/2.2/1.7/1/2.2/1.4）。
3. **0.5–2s 且偏向短**：`d = 500 + 1500 * Math.random() ** 2`。

均匀分布会花三分之一时间在 1.4s 以上，读起来是「懒」；平方采样让 50% 的间隔落在 1 秒以下。4000 次采样实测：

```
mean 1072 ms   p10 517   p50 998   p90 1785   min 500   max 2000   under1s 50%
```

配套约束：

- **甩镜窗口随 dwell 缩放** `max(220, min(460, dwell * 0.34))` —— 0.5 秒的镜头负担不起 0.5 秒的运镜。`PATROL.dwell` 是唯一入口。
- **落点去重**：新落点与上一次相距 250ms 以内就重抽，否则「节奏本身」变成可预测的模式。
- 若再往 1s 以下压，甩镜占比会超过 50%，画面会一直在赶路 —— 这是这条曲线实际的下限，不是随便调的常数。

## 2. 性能：瓶颈不在自己的 JS，在浏览器合成

### 2.1 测量口径

按 PID 采样 CPU 时间差（不是瞬时百分比），同时读页面自报的 `msPerFrame` 与分层耗时。

```
GPU process   msedge  120%   (累计 6985s)
renderer      msedge   83%   (累计 3178s)
python extract         12% 均，尖峰 100%（每 2.5s 跑一次，每次 0.3–0.6s）
node server            10%
powershell sysprobe     4%
```

页面自身 JS 只占 **7.4 ms/帧**（≈ 单核 13%），且几乎全在 `flinks`：**5.85 / 7.41 ms 是 8000 条贝塞尔曲线在 CPU 上光栅化**，其余各层（stats/gl/tracks/peers/spine/glow/sweep/reticle/rlabels/fdots/flabels/live/panels）都在 0.01–0.16 ms 量级。

结论：服务端 + 页面逻辑加起来约 20%，**浏览器把两层全屏 canvas 合成上屏占了 200%+**。

### 2.2 判据：GPU 进程 120% 是环境信号

正常 GPU 进程合成一个大页面应在 10–20%。跑到 120% 说明这台机器的 Edge 很可能没走硬件合成（驱动回退）或在 CPU 上做光栅化。这是**环境问题，代码无法完全解决**，但它解释了「这么个小网页为什么这么重」。以后遇到类似「小页面大开销」，先按进程拆 CPU 时间，再决定是改代码还是查驱动 —— 不要凭直觉先优化 JS。

### 2.3 实际改动（按代价从低到高）

1. **绘制限到 30 fps**：`if (now - lastDraw < 1000 / FPS_CAP - 1.5) { requestAnimationFrame(frame); return; }`
   - 只跳过**绘制**，定时器与状态推进照常；墙上的大屏不需要 60fps。`?fps=60` / `?fps=24` 可覆盖。实测默认页 `drawRate 30`（不覆盖时 rAF 仍按显示器刷新率跑，分流后 180 draws/s 的旧值消失）。
   - 注意：限帧后 FPS 读数不能再由 rAF 间隔推算（会显示 240，那是循环频率），必须用相邻两次**实际绘制**的间隔。
2. **三处每帧分配**改成模块级复用：
   - vignette 的全屏 radial gradient：按**量化后的中心点**作 key 缓存，不再每帧 `createRadialGradient`；
   - 目标柔光环：同样缓存，用 `save/translate` 复用同一个渐变；
   - 散点分桶：4 个数组装 ~3900 个点，改为模块级数组只 `length = 0` 不重建。
3. **DPR 1.5 → 1.35**（墙面距离看不出来，填充率少 19%）。

仍可做但未做（性价比递减，需显式决定）：DPR→1.0（像素再少 45%，格子边缘与小字发虚）、把 8000 条曲线搬进 WebGL（5.8ms → <0.5ms，但等于重写绘制管线）、关掉一层 canvas（等同前者）。**根上只有一条路：曲线不在 CPU 上光栅化。**

## 3. 角度单一入口：一个只在 `ROT.cur != 0` 时才暴露的 bug

### 3.1 现象与根因

加差速后（`ringAng(ri) = ROT.cur * (1 - ri*0.085)`，文件层 `fileAng() = ROT.cur * -0.55`），空闲自转时文件标签钉在原地、格子从下面转走。

- `drawFileLabels()` 仍用 **裸 `fp0.ang`**；
- `drawGLStage()` 用 `fp0.ang + fileAng()`。

**只要 `ROT.cur == 0`，两者完全相等** —— 所以这个 bug 从加差速那天就存在，测试全过、截图也正常。顺带补上漏掉的槽中心偏移 `(TAU/24)*0.30`，否则标签贴在槽的起始边而不是格子上。

同类第二处：`focusAgent()` 里仍是差速之前的 `p.ang + ROT.cur`，会让「跳到这一格」落在错误位置 —— 必须改走 `ringAng(ri)` 入口。

### 3.2 判据（已写入 README）

**改任何角度公式后，要么把 `ROT.cur` 强制设成非零跑一次，要么直接做数值比对** —— 同一个格子分别在 GL 层与标签层算角度，逐项断言 Δ=0：

```
rot 0.78   index.html Δ0 · build_scene.py Δ0 · building.py Δ0
shoot_final.py Δ0 · server.mjs Δ0 · extract_agents.py Δ0
allInSync: true
```

教训：不是粗心，是**没有对照条件**。差速那次改了 12 处角度调用、漏了 2 处；`ROT.cur == 0` 时结果相同，等于测试被静默跳过。

## 4. 提交与落点

| commit | 内容 |
|---|---|
| `4b92491` | 巡检 2s；管线 8s/20s → 2.5s/2.5s；FOLLOW 带开详情面板（只在目标变化时渲染，不覆盖手动 PICK） |
| `70bc685` | 巡检 1–3s 随机，甩镜时长按 dwell 缩放 |
| `e317dde` | 巡检 0.5–2s 偏短；修三处每帧分配 |
| `86e5e8b` | 绘制限到 30 fps |
| `2551787` | 文件标签不跟着格子转；`focusAgent` 用错角度基准 |
| `898a2a1` | README：记录角度单一入口的两次踩坑与判据 |

改动集中在 `fluxscope/index.html`（绘制与运镜）、`fluxscope/server.mjs`（extract 周期与推流节流）、`fluxscope/extract_agents.py`（抽取耗时）。服务端改动需重启 `node server.mjs` 才生效。
