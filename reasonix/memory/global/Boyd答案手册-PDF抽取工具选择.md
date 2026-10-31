---
id: mem-48550b6c7ceb61e34043b44dd7609abc
revision: 1
created_at: "2026-10-28T06:02:43.843Z"
updated_at: "2026-10-28T06:02:43.843Z"
name: Boyd答案手册-PDF抽取工具选择
description: "Boyd《Convex Optimization》Solutions Manual PDF 必须用 PyMuPDF get_text('text')，不能用 pdftotext -layout"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论（2026-10-28 实测，p041-p060 的一块翻译）

`C:/Users/27063/Documents/源料-教材/Boyd答案手册/Boyd答案手册_pXXX-YYY.pdf`（16 份，各 20 页）**不要用 `pdftotext -layout`**。

pdftotext -layout 的错映射（上一轮 worker 报告过，已确认）：
- `⪰`(U+2AAF) → `0`；`≻` → `0`
- `⪯`(U+2AB0) → `b`
- `≠` → `=`
- `∈` / `∉` 不分
- `Σ` / `Π` → 孤立 `i` 或空
- 块矩阵（bmatrix）被压成一行，元素顺序错乱

## 正解

```python
import fitz
d = fitz.open(pdf); t = d[i].get_text('text')
```

fitz 的 `get_text('text')` 保留 `⪰ ≻ ⪯ ≠ ∈ ≤ ∥ Σ Π` 全部原字符；唯一变形是 `≠` 被拆成组合字符 `U+0338 U+003D`（`̸` 在前），`∉` 拆成 `U+0338 + U+2208`。用 fitz 抽取后 3.28 题面的 `dom f ≠ R^n`、3.37 的 `Y ∉ dom f*`、3.36 的 `y ⪰ 0` 全部正确。

## 仍需视觉核对

公式结构（分式层级、块矩阵、上下标归属）fitz 也会丢，含不等式的关键页要 `pdftoppm -png -r 150 -f N -l N` 后 `read_image` 核对。已核 p041/p048/p055 三页，确认 3.27 的 Schur complement 块矩阵在文字层完全塌陷。

## 图

本书插图全是 PSfrag 残图：只剩 `PSfrag replacements` 字样与零散字母，刻度/箭头/曲线无法复原，不要试图重绘。
