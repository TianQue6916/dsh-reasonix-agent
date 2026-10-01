---
name: xparse-parser
description: PDF/图片转Markdown — TextIn API驱动，保留表格结构、生成目录树、字符级坐标
---

# XParse Parser — PDF/图片转Markdown

基于 TextIn API 的 PDF/图片智能解析服务。

## 核心能力

- **PDF/图片转 Markdown**：保留标题层级、列表、代码块
- **表格结构保留**：解析为 Markdown 表格，含合并单元格
- **目录树生成**：自动提取文档结构生成 TOC
- **字符级坐标**：每个字符的位置信息（bbox）
- **公式识别**：LaTeX 公式提取
- **免费额度**：每日 1000 页

## 操作

| 操作 | 描述 |
|------|------|
| `parse_to_md` | PDF/图片 → Markdown |
| `parse_with_toc` | 解析并生成目录树 |
| `parse_table` | 精确提取表格 |
| `parse_formula` | 提取公式（LaTeX） |
| `batch_parse` | 批量解析 |

## 配置

需要 TextIn API Key（环境变量 `TEXTIN_API_KEY`）:
```bash
set TEXTIN_API_KEY=your_key_here
```

## 依赖

```bash
pip install requests
```
