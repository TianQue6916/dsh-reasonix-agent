---
name: latex-writing
description: LaTeX 学术写作 — 论文/报告/学位论文的 LaTeX 编写规范，标签/交叉引用/文献引用/数学公式/图表排版最佳实践
---

# LaTeX Academic Writing Skill

编写高质量的 LaTeX 学术文档。本技能提供 LaTeX 写作约定、格式标准、术语规则和引用风格的完整参考。

## Core Principles

Every document must be:
- **Structurally sound**: Proper nesting, consistent sectioning, logical flow
- **Typographically correct**: Following established LaTeX conventions
- **Citation-rigorous**: Every claim backed by a properly formatted reference
- **Compilation-clean**: Zero warnings, zero errors

## Workflow

1. **Analyze** — 理解用户需要的文档类型（论文/报告/学位论文/简历）和目标会议/期刊格式
2. **Plan** — 确定需要修改或创建的 .tex 文件、包依赖、引用管理方式
3. **Execute** — 按照 below 的规范编写 LaTeX 内容
4. **Verify** — 提供 `latexmk` 或 `pdflatex` 编译命令供用户在本地验证
5. **Report** — 总结做了什么、文件结构、关键用法说明

## Quick Reference: Label Prefixes

| Prefix | Element | Example |
|--------|---------|----------|
| `sec:` | Section | `\label{sec:introduction}` |
| `fig:` | Figure | `\label{fig:architecture}` |
| `tab:` | Table | `\label{tab:performance}` |
| `eq:` | Equation | `\label{eq:loss}` |
| `thm:` | Theorem | `\label{thm:convergence}` |
| `lem:` | Lemma | `\label{lem:bound}` |
| `def:` | Definition | `\label{def:metric}` |
| `alg:` | Algorithm | `\label{alg:training}` |
| `ch:` | Chapter | `\label{ch:background}` |

## Cross-Reference Rules

- Always use non-breaking space: `Figure~\ref{fig:arch}`, `Section~\ref{sec:method}`
- Use `\eqref{eq:loss}` for equations (auto-adds parentheses)
- Capitalize Figure/Table/Section/Theorem/Equation when referencing
- Never hard-code numbers — always use `\ref{}`

## Citation Rules

- Every factual claim needs a citation
- Use `\citet{key}` when author is narrative: "Smith et al. [1] proposed..."
- Use `\citep{key}` for parenthetical support: "widely adopted [1, 2]"
- Never write "In [1], the authors..." — use `\citet` instead
- BibTeX key format: `firstauthorYEARkeyword` (e.g., `smith2024method`)
- Always use `~\cite{key}` (non-breaking space)

## Essential Packages

Always ensure these are loaded for academic papers:

```latex
\usepackage{amsmath,amssymb,amsthm}   % Math
\usepackage{graphicx}                  % Figures
\usepackage{booktabs}                  % Professional tables
\usepackage{hyperref}                  % Clickable links (load last)
\usepackage{cleveref}                  % Smart references (after hyperref)
```

## Detailed Reference Files

For in-depth conventions, read these files as needed:
- **references/writing-style.md** — Paragraph rules, emphasis, formatting, terminology
- **references/math-conventions.md** — Equations, operators, theorem environments
- **references/figures-tables.md** — Figure/table placement, subfigures, booktabs
- **references/citation-guide.md** — natbib/biblatex usage, .bib entry format
- **references/templates.md** — Full document templates (article, IEEE, thesis)
