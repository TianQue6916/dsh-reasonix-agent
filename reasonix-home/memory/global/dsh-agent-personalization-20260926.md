---
id: mem-3a2fc20561a73fe33be365891ad46d2a
revision: 1
created_at: "2026-09-26T15:20:47.634Z"
updated_at: "2026-09-26T15:20:47.634Z"
name: dsh-agent-personalization-20260926
description: "dsh agent 个性化：memory_profile 工具 + 画像加权 + persona 画像锚点，把「实质任务前先调画像」从记忆规则升级为机制"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh agent 个性化：把用户画像机制化（2026-09-26）

## 一、动机
用户明确要求：「我是学生，有很好的个人画像，你可以参照这个着重优化，毕竟我现在是真正在组装属于我自己的 agent」。
此前画像只躺在记忆里，**没有任何机制保证 agent 会去读** —— reasonix 侧的 `use-user-persona-before-tasks` 铁律在 dsh 侧等于没生效。

## 二、已落地（三处，均在 `~/.dsh/profiles/web/cordis.patch.yml` 的 `preset-anchored-standard`）

### 1. `memory_profile` 工具（memory.mjs 新增，共 4 个工具）
一次返回 4 条核心 fact 的正文（约 4.4K 字符）：
- `user-persona-cognitive-system-architect`（完整画像 v2.0）
- `academic-level-and-teaching-style`（学业水平与教学适配，含大二上计划：6.431 概率论 / CS144 网络 / Boyd 凸优化 / Cover 信息论）
- `use-user-persona-before-tasks`（画像调用铁律）
- `输出规范`
按需调用，不常驻注入（沿用 preset 的零常驻哲学）。

### 2. `memory_search` 画像加权
`profileWeight()`：`type: user` +2、`type: feedback` +1、命中 PROFILE_FACTS +3；排序时权重优先于匹配分数。实测查询「学习 数学」时画像类 fact 稳定排前。

### 3. persona prefix 扩展（`complete: true` → 唯一 system prompt）
- 身份句从 `You are a helpful software engineer assistant.` 改为：
  `You are the personal AI assistant of a Chinese undergraduate (Intelligent Science and Technology) who builds his own knowledge system and tooling. Treat him as a builder-researcher...`
- 第 6 条锚点：声明用户身份 + 要求「实质任务前先调 `memory_profile` 校准讲法与深度」+ 教学约束（本质→公式→跨学科连接；不甩未学概念 群论/环论/拓扑/非标准分析；不掩盖核心思想、不只给公式、不空洞赞美）

## 三、关键约束（画像核心，别丢）
- 身份：宁夏大学智能科学与技术，大一暑假 → 大二上
- 构建主义研究式学习者：第一性原理、追问式、系统化「问题→方案→验证」、跨学科连接
- 反感：死记硬背、几何直觉式教学、空洞赞美、只给公式不给直觉
- 禁止甩未学概念：群论 / 环论 / 拓扑学 / 非标准分析

## 四、顺带确认
dsh web 前端内置 **KaTeX**（`dsh-web-frontend/dist/assets/*.css|js` 命中 4 个文件），数学公式可渲染 → 数学教学场景可直接输出 LaTeX。

## 五、生效与回滚
- 当前会话不受影响，**新会话生效**
- 备份：`cordis.patch.yml.bak-20260926-pre-persona-lang`（语言契约前）、`.bak-20260926-pre-memory-reasonix`
