---
name: academic-research-skills
description: ARS 技能包（Claude Code）安装与核心功能备忘
type: reference
scope: global
created: 2026-06-23
---
# academic-research-skills (ARS) 备忘

## 获取方式
- 非公开 GitHub 仓库，需要配合 **Claude Code** 使用
- 通过两行命令安装（可在 Claude Code 官方文档或配置界面找到具体命令）

## 核心功能
1. **4 个环环相扣的 Skill**：研究 → 写作 → 审稿 → 定稿，串联完整科研流程
2. **引用真实性**：调用 API 核验每条引用的真实性
3. **写作风格学习**：能学习个人写作风格
4. **完整性闸门**：基于 Nature 研究的机制，防止 AI 生成"看起来对但实际错"的内容
5. **输出格式**：支持 LaTeX → APA 7.0 / IEEE 标准格式 PDF

## PDF 美观方案
- 目前没有单一的 Skill 专做 PDF 美化
- 核心是使用**设计精良的 LaTeX 模板**
- ARS 的 Academic Paper 技能本身输出 LaTeX → APA 7.0 或 IEEE 格式，已保证学术规范性
- GitHub 搜索关键词：`latex template academic beautiful` / `latex academic style template`

## 与 Reasonix 的关联
- ARS 是为 Claude Code 设计的，但 Skill 的设计思路（串联式流程、完整性闸门、引用校验）可借鉴
- 本地 PDF 生成最优路线：好的 HTML → 浏览器打印到 PDF，或 LaTeX 编译
