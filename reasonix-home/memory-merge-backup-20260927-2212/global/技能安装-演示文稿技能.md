---
name: installed-ppt-skills
description: 三个由外部仓库转换安装的 Reasonix 演示文稿技能
type: reference
scope: global
created: 2026-06-01
---
# 已安装的演示文稿技能（来自外部仓库转换）

## html-ppt
- **来源**: lewislulu/html-ppt-skill (5K⭐, MIT)
- **能力**: 生成纯静态 HTML 演示文稿，36 主题 + 14 模板 + 31 布局 + 47 动画
- **调用**: `run_skill({ name: "html-ppt" })`
- **特点**: 无需构建，浏览器直接打开，支持演讲者模式

## ppt-master
- **来源**: hugohe3/ppt-master (22K⭐, MIT)
- **能力**: 从任意文档生成原生可编辑 PPTX（真实形状，非图片）
- **调用**: `run_skill({ name: "ppt-master" })`
- **依赖**: Python + python-pptx, Pillow

## paper-slide-deck
- **来源**: luwill/research-skills (647⭐, MIT)
- **能力**: 学术论文→幻灯片，17 种视觉风格，支持 PPTX/PDF 导出
- **调用**: `run_skill({ name: "paper-slide-deck" })`
- **特点**: 适合论文汇报、学术讨论、conference talk

安全审查结论：三个仓库均无恶意代码，MIT 许可证，原始作者可追溯，已安全转换安装。
