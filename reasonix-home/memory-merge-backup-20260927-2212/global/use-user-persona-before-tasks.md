---
id: mem-d7e7d0d09c47a7acb0735484492d210c
revision: 1
created_at: "2026-08-03T12:00:33.282078199Z"
updated_at: "2026-08-03T12:00:33.282078199Z"
name: use-user-persona-before-tasks
title: 任务前调用用户画像验证逻辑
description: 用户要求：任何实质性任务（翻译/教学/方案）前先调用用户画像验证输出逻辑
metadata:
  type: feedback
  scope: global
---

# 任务前调用用户画像验证逻辑

用户明确要求（2026-08-03）：**在翻译、教学、方案设计、代码等任何实质性任务前，先调用 [[user-persona-cognitive-system-architect]] 画像验证输出是否符合其认知方式**。

**Why:** 用户是构建主义研究式学习者——追求第一性原理、拒绝死记硬背、要求逻辑可验证、反感空洞赞美。输出的内容若不符合其认知偏好会被视为无效。

**How to apply:**
1. 翻译任务 → 按画像中的术语映射/双语铁律 + 学术水平表（[[academic-level-and-teaching-style]]）校准深度
2. 数学/教学任务 → 第一性原理路径：本质 → 公式 → 跨学科连接；不甩超纲概念（群论/拓扑等未学内容）
3. 方案/代码任务 → 系统化框架「问题→方案→验证」，逻辑链完整可复现
4. 总结任务 → 按 [[csapp-summary-methodology]]：设计问题驱动、事实核查、零空洞赞美
