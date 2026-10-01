---
name: detailed-docx
description: 跨Run精确文本替换 — Word文档中逐Run查找替换，原封不动保留格式
---

# Detailed DOCX — 跨Run精确文本替换

在 Word 文档中逐 Run（最小格式单元）查找替换文本，确保格式完全保留。

## 核心特性

- **逐 Run 匹配**：不合并 Run，分步朝每个 Run 中替换匹配文本
- **格式保留**：加粗、斜体、颜色、字体等格式不丢失
- **跨 Run 匹配**：当文本跨 Run 分布时，先合并再匹配替换，最后按原格式切分
- **支持通配符**：使用 `?`（单字符）和 `*`（多字符）
- **支持表格**：表格单元格中的文本同样精确处理

## 操作

| 操作 | 描述 |
|------|------|
| `find_replace` | 精确文本替换（保留格式） |
| `find_replace_regex` | 正则表达式替换 |
| `batch_replace` | 批量替换（JSON配置） |
| `find_all` | 查找所有匹配位置 |

## 使用

```bash
python scripts/detailed_docx.py <操作> <参数JSON>
```

## 依赖

```bash
pip install python-docx
```
