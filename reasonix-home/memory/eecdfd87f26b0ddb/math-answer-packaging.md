---
name: math-answer-packaging
description: 数学教程类长回答自动写入独立.md文件，方便一键复制
type: feedback
scope: project
created: 2026-06-21
priority: high
---
# 数学回答打包规则

**规则**：当产出 100 行以上的数学教程/总结/推导时，直接写入独立 `.md` 文件，不要只在聊天中输出。

**Why**：用户需要"一键复制"的内容，聊天区的长文本复制体验差，且 Markdown 文件保留了完整的格式（LaTeX 公式、表格、层级标题）。

**How to apply**：
1. 产出长教程时 → `write_file` 到工作目录，文件名用中文描述主题
2. 聊天中给一句话摘要 + 文件路径，不重复全文
3. 短问答（<100行）正常在聊天中回答即可
