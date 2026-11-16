---
name: pdf
description: PDF精确理解与识别 — 提取文本/表格、合并/拆分、表单填写、添加水印、密码保护
---

# PDF 精确理解与识别 Skill

基于 `pypdf`、`pdfplumber`、`reportlab` 实现 PDF 处理。

## 操作

| 操作 | 描述 |
|------|------|
| `extract_text` | 提取 PDF 文本内容 |
| `extract_tables` | 提取 PDF 中的表格（含结构） |
| `extract_metadata` | 提取元数据（标题、作者、页数等） |
| `merge` | 合并多个 PDF |
| `split` | 拆分 PDF 为单页或多组 |
| `add_watermark` | 添加文字/图片水印 |
| `fill_form` | 填写 PDF 表单 |
| `set_password` | 设置密码保护 |
| `remove_password` | 移除密码 |
| `images_to_pdf` | 图片转 PDF |
| `add_page_numbers` | 添加页码 |
| `rotate` | 旋转页面 |

## 依赖

```bash
pip install pypdf pdfplumber reportlab
```

## 使用

```bash
python scripts/pdf_skill.py <操作> <参数JSON>
```

## 附：TextIn API 双路径（2026-08-16 合并自 xparse-parser）

PDF → Markdown 双路径：
- **本地路径**：`pypdf`/`pdfplumber`（上方主表，免费、离线）
- **TextIn API 路径**：版面分析 + OCR → Markdown（复杂扫描件/公式多时用；需 API key，配置见记忆/环境变量）

选路原则：文本型 PDF 走本地；扫描件/复杂版面走 TextIn。
