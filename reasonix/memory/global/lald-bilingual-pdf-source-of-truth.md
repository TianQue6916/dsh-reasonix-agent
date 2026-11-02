---
id: mem-9fac3d165f7947010088ec00fe3fdb49
revision: 1
created_at: "2026-11-01T17:34:23.639Z"
updated_at: "2026-11-01T17:34:23.639Z"
name: lald-bilingual-pdf-source-of-truth
description: "LaLFD 双语教材：原书扫描 pdf 在 split_pages，项目目录下的同名 pdf 是译注版不能当原文依据"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 适用
修 `D:/gh-publish/Linear-Algebra-and-Learning-from-Data/01-教材双语翻译/` 下的 Strang《Linear Algebra and Learning from Data》双语 md（part001-005、PartIV/V/VI/VII）。

## 判据（2026-11-02 实测）
- **原书扫描件（唯一可当"原书是什么"的依据）**：`D:/80-系统/edg/split_pages/Strang_LaLFD_part001_p001-050.pdf` … `part009_p401-434.pdf`，共 9 份。纯图像、无文本层（pdftotext 输出 50 字节），必须用 PyMuPDF 渲染成 png 再 read_image 看。
- **`01-教材双语翻译/` 里的同名 pdf 是译注生成版**：有文本层（`Adobe-GB1` 报错），内容与 md 一致 —— 也就是说 md 里的错它一样有（例如 `Figure 1.5` 本应是 `Figure I.5`）。**不能拿它核对原文。**
- 页码映射（part006）：pdf 页 = 书页 − 248（书页 291 = pdf p43）。
- 写入：`D:/gh-publish/` 下 python `open(w)` 会 PermissionError（Low IL no-write-up），只能 `cp -f` 覆盖。
- KaTeX 门：`node C:/Users/27063/_wb/lald/katexcheck/check.js <md...>`，判据 failed=0 且 issue=0；issue 的常见来源是 `\\[2pt]` 行距（cases/align 里），去掉参数即归零。
- 已知体例：全书图号是罗马数字章号 + 点 + 序号（Figure I.5 / I.6 / I.7），小节标题用阿拉伯（§1.5 / §1.6），OCR/翻译最容易把 `I.` 读成 `1.`。
