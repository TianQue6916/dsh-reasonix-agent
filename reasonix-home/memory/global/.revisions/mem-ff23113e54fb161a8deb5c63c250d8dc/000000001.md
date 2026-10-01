---
id: mem-ff23113e54fb161a8deb5c63c250d8dc
revision: 1
created_at: "2026-08-09T05:24:43.873413284Z"
updated_at: "2026-08-09T05:24:43.873413284Z"
name: reasonix-32-parallel-limit-and-translation-division
title: Reasonix 32 并行上限与翻译分工设计
description: Reasonix 单批最多 32 并行；大规模翻译分工 25×2 + 3 pro 写注 + 2 交叉引用 + 2 终审（取代主代理翻译铁律）
metadata:
  type: feedback
  scope: global
---

# Reasonix 并行上限与大规模分工设计（2026-08-09 用户拍板）

**Why:** 用户确认 Reasonix 单批最多允许 **32 个并行子 agent**（fleet/任务调度上限）。这直接决定大规模翻译技能（bilingual-ocw-translator）的分工设计。

**How to apply:**
- 任何 `fleet`/`task` 并行派发，单批数量必须 ≤ 32；超过 32 分波次执行
- 大规模翻译（>50 页）分工（取代 2026-08-04 的"主代理亲自翻译"铁律，用户 8-09 废止）：
  - 波 1：25 个翻译 worker（每个分 2 页，覆盖 50 页）
  - 波 2：10 审计 + 3 pro 写注 + 2 交叉引用 = 15
  - 波 3：2 个 v4pro/最强模型终审（通读全部翻译+注，输出完整详尽修改意见）
- 终审所有规模必做（小规模 1 个强模型）
- Strang 50 页教训不删除，从"禁止子代理翻译"转为"翻译 worker prompt 避坑清单"
