---
name: installed-skills-round3
description: 第三批安装：Anthropic 官方技能 + Vercel 官方技能 + 三个技能合集索引
type: reference
scope: global
created: 2026-06-01
---
# 第三批安装的 Reasonix 技能

## anthropic-skills
- 来源: anthropics/skills (145K⭐, Apache 2.0, Anthropic 官方)
- 能力: 10 个子技能 — MCP 构建 / Canvas 设计 / Web 测试 / 品牌规范 / 算法艺术 / 前端设计 / 文档协同 / Claude API / 主题工厂 / 内部沟通
- 调用: `run_skill({ name: "anthropic-skills" })`

## vercel-agent-skills
- 来源: vercel-labs/agent-skills (25K⭐, Vercel 官方)
- 能力: 6 个子技能 — React 最佳实践 / Vercel 部署 / 合成模式 / 设计指南 / 视图过渡 / React Native
- 调用: `run_skill({ name: "vercel-agent-skills" })`

## 三个精选合集（不安装，按需提取参考）
- antigravity-awesome-skills (sickn33) — 1200+ 技能分类索引
- awesome-claude-skills (ComposioHQ) — 16.5K⭐，全场景技能索引
- VoltAgent/awesome-agent-skills — 22.1K⭐，企业级技能仓库

安全审查结论：anthropics/skills 和 vercel-labs/agent-skills 均为大厂官方仓库，无恶意代码，已安全转换安装。
