---
name: docx
description: Word精确排版控制 — 创建/编辑DOCX文档、表格、样式、修订模式、批注
---

# DOCX 精确排版控制 Skill

使用 `python-docx` 进行精确的 Word 文档排版。

## 操作模式

当用户提出 Word 文档相关需求时，调用 `scripts/docx_skill.py`：

```python
python scripts/docx_skill.py <操作> <参数JSON文件>
```

参数通过 JSON 文件传递（避免命令行注入），结果通过 stdout 返回 JSON。

## 支持的操作

| 操作 | 描述 | 关键参数 |
|------|------|---------|
| `create` | 创建新文档 | title, content_sections |
| `open_edit` | 打开并编辑现有文档 | path, edits[] |
| `find_replace` | 查找替换文本（保留格式） | path, find, replace |
| `add_table` | 添加/编辑表格 | path, rows, cols, data |
| `merge_docs` | 合并多个文档 | paths[], output_path |
| `add_toc` | 生成目录 | path |
| `add_header_footer` | 设置页眉页脚 | path, header_text, footer_text |
| `add_comment` | 添加批注 | path, text, comment |
| `set_style` | 应用样式模板 | path, template_path |
| `track_changes` | 启用/接受修订 | path, action |

## 输出格式

```json
{
  "success": true,
  "output_path": "文档保存路径",
  "message": "操作结果描述",
  "pages": 5,
  "tables": 3,
  "images": 2
}
```

## 依赖

```bash
pip install python-docx
```

## 注意事项
- 所有路径使用绝对路径
- 编码统一 UTF-8
- 编辑操作自动备份原文件（`.bak`）

## 附：跨 Run 精确替换（2026-08-16 合并自 detailed-docx）

Word 文档中逐 Run 查找替换，原封不动保留格式：
- 遍历段落 → 行内 run 序列，按 `(run.text 拼接) == 目标串` 匹配
- 命中后只改目标 run 的 text，不重建段落 → 格式（字体/加粗/颜色）零变化
- 处理跨 run 的搜索串：先合并判断命中，再按 run 边界拆分写入
- 适合"改一个词但不动排版"的精确编辑场景
