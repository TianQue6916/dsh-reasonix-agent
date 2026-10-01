---
id: mem-4c775313f4e3cae8f05a6e1f929ae226
revision: 1
created_at: "2026-07-31T04:09:27.690107899Z"
updated_at: "2026-07-31T04:09:27.690107899Z"
name: discussion-reply-in-marktext-md
title: 讨论回复：md 文件 + MarkText 打开（格式遵循双语规范）
description: 讨论问题（尤其数学符号）时：在 /home/tianque/桌面/输出文件/ 写自由命名 md 文件并用 marktext 打开，格式遵循双语技能规范
metadata:
  type: user
  scope: global
---

## 讨论回复模式：输出目录写 md 文件 + marktext 打开

**规则（用户 2026-07-31 明确要求）：** 以后与用户讨论问题（尤其是数学符号、LaTeX 公式、特殊字符在 Reasonix 对话窗口渲染不佳的场景）时，**不要在对话窗口直接输出长回复**。正确流程：

1. 在默认输出目录 `/home/tianque/桌面/输出文件/` 创建一个**自由命名**的 `.md` 文件
2. 在文件内撰写完整回复（格式遵循 bilingual-translator / bilingual-ocw-translator 技能规范：中文主体 + `English term（中文翻译）` 行内双语、蓝色功能标签 `#2471a3`、配色方案、blockquote 虚化、LaTeX `$...$` / ` ```math ` fenced block）
3. 自动用 `marktext <文件路径>` 打开该文件（marktext 已安装在 `/usr/bin/marktext`，后台运行即可）

**Why:** 对话窗口无法良好渲染数学符号等字符，MarkText 可完整渲染 LaTeX 与配色排版，阅读体验更好。
**How to apply:** 涉及数学/公式/复杂排版内容的讨论回复一律走此流程；简短文字回复仍可直接在对话中输出。沙箱限制时先在 `.reasonix/attachments/` 写文件再 `cp` 到桌面输出目录。
