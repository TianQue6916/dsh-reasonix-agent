---
name: academic-writing
description: 学术论文全流程手册（2026-08-16 由 5 个技能合并）——战略规划 → 大纲 → 研究 → 写作 → LaTeX 排版 → 审稿回复。写论文/报告/学位论文/技术文档、LaTeX 排版、文献综述、审稿回复时触发。
version: 1.0.0
---

# academic-writing — 学术论文全流程手册

> 合并自：academic-paper-strategist（战略）、academic-paper-composer（写作框架）、academic-research-skills（研究全流程）、latex-writing（LaTeX 规范）、technical-writing（技术文档）。原技能完整版在 `~/.reasonix/skills-backup-20260816/`。

## 一、战略与定位（strategist 阶段）

1. **选题**：先定目标平台（PhilArchive/arXiv/期刊），平台决定篇幅与风格
2. **研究缺口**：文献综述定位 3 类缺口（未解决/方法不适配/结论过时）
3. **大纲先行**：从大纲（不是从摘要）开始；大纲 = 论点链，每节一个可验证主张
4. **结构化标题**：`[动词] [对象]：方法-结果-意义`

## 二、写作框架（composer 阶段）

1. **质量门**：大纲 → 初稿 → 自审 → 终稿，每阶段一个检查清单
2. **每节一句主旨**（topic sentence 驱动），段落不超 200 字
3. **证据密度**：每主张 ≥1 个数据/引用；空泛句（"具有重要意义"）零容忍
4. **提交前检查**：格式（期刊模板）、引用完整性、图表编号、伦理声明

## 三、研究全流程（research 阶段）

1. **文献综述**：检索（关键词矩阵）→ 筛选（PICO/主题）→ 归类（主题-方法-结论表）
2. **写作**：IMRaD 或问题驱动结构
3. **审稿回复**：逐条回复表（审稿意见 | 处理 | 修改位置），先致谢再回应，能改就改、不能改给理由

## 四、LaTeX 规范（latex 阶段）

1. **标签**：`\label{sec:intro}` / `\label{eq:energy}` 前缀化；引用用 `\ref`/`\cref`，不手写编号
2. **文献**：BibTeX/BibLaTeX，`\cite{key}`；未引用条目不入参考文献表
3. **数学**：公式环境统一 `\[...\]`/`align`；符号表 `\DeclareMathOperator`
4. **图表**：`figure`/`table` 浮动体 + `\caption` + `\label`；表格用 `booktabs` 三线表
5. **编译**：`latexmk -pdf` 或 `xelatex`（中文用 ctex）

## 五、技术写作（technical 阶段）

1. **API 文档**：OpenAPI 3.x 注解即文档；示例先行
2. **ADR**（架构决策记录）：上下文 → 决策 → 后果
3. **运行手册**：面向操作的步骤式，含故障排查表
4. **Mermaid**：流程图/时序图/状态图；复杂图拆分

## 六、用户方舟适配

- 用户当前无论文任务，此技能为学期论文/科研目标预备（PhD 路线）
- 与 `降AIGC` 流程衔接：论文终稿走 aigc-master 确定性替换
- 输出目录默认 `/home/tianque/桌面/输出文件/`
