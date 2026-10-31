---
id: mem-e570e85cc6e6a965b8c32cfd3f82f771
revision: 1
created_at: "2026-10-27T19:51:30.400Z"
updated_at: "2026-10-27T19:51:30.400Z"
name: pdflatex-cm-font-pdf-text-extraction
description: "PdfLaTeX 生成的数学讲义（CM 字体 Custom encoding）文本提取方案：pdftotext 不可用，须 pdfminer.six + 自建行聚类"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 问题
Stanford 课程讲义/作业（EE364a、CS 系 PDF）由 PdfLaTeX 生成，CMMI/CMSY/CMEX 等 Computer Modern 字体是 Custom encoding 且 uni=no。`pdftotext -layout` 会把希腊字母与 ⊆/∈/⪰ 全部输出成 `�`（U+FFFD），完全不可用。不要在这类 PDF 上浪费时间试 pdftotext / pymupdf 的 text 层。

## 可用方案（2026-10-28 在 EE364a 15 份 PDF 上实测）
`pdfminer.six`（20251230）逐 `LTChar` 提取 + 自建行聚类：

1. **必须 `laparams=None`**。但此时 `LTChar` 直接挂在 `LTPage` 下，**不产生 `LTTextContainer`**；递归函数必须显式判断 `isinstance(el, LTChar)`，否则提取出 0 字符（这个坑debug过一次）。
2. **默认 laparams 不能用**：它会把同一视觉行拆碎并交错输出。正确做法是把所有 `LTChar` 按 `(page, round(y/ytol))` 聚成行，`ytol≈2.5pt`，再按 `x0` 排序。
3. 上下标识别：比较 char 的 `size` 与行内主流 size，以及 baseline 偏移。
4. `(cid:22)` = ⪰ (U+2AB0)，`(cid:23)` = ⪯ (U+2AAF)，均出自 CMSY10；其余 cid 按字体名建映射表。
5. 希腊字母由字体名（CMMI*）+ 码位决定，不能靠 Unicode 表猜。
6. **视觉核对**：`pdftoppm -f 1 -l 2 -r 150 -png x.pdf out` + `read_image` 逐页对一遍，确认提取准不准。ipython 的 `fitz` 也可，但 pdfminer 的字符流更细。

## 铁律
pdfminer 的字符提取是**准确的**——不要在提取后凭语义「脑补纠正」（例：看到 θ 就想改成 λ）。源文本身可能有笔误（EE364a HW1 确实用 θ、μ 而非 λ），先视觉核对再判定。

## 附带坑（同一批任务里踩到）
- **bash 工具 heredoc 约 7000+ 字符处会截断**（报 `warning: here-document at line 1 delimited by end-of-file`）。写长文件要用 `write` 工具分段落盘再 `cat A > f && printf '\n' >> f && cat B >> f` 合并。
- `write` 工具传 `tmp/...` 会映射到 `C:\tmp` 且不可写（`EPERM: mkdir 'C:\tmp\...'`）；临时文件写到 `C:/Users/27063/AppData/Local/Temp/`。
- Git Bash 下 `grep '\\\['` 报 `Invalid regular expression`，用 python 检查字面反斜杠。
- `extract-formulas.py` / `katex-check.js` 的 JSON 报告在 node 侧有时不落盘（`/tmp` 路径映射差异），以 stdout 的 `files 0` 为准。
