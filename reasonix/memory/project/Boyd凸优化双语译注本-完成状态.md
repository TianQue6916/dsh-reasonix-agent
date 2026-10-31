---
id: mem-5a262dd05061a7af0ca7e390b4025449
revision: 1
created_at: "2026-10-28T08:14:45.928Z"
updated_at: "2026-10-28T08:14:45.928Z"
name: Boyd凸优化双语译注本-完成状态
description: "Boyd《Convex Optimization》全书 36 块双语译注本已完成，含统计与两套页码标记体系的事实"
metadata:
  type: user
  fact_type: project
  scope: project
---

## 完成状态（截至 2026-10-28）
目录 `C:/Users/27063/Documents/翻译产出/教材/Boyd凸优化/`，36 个 `Boyd凸优化_pXXX-YYY.bilingual.md`，覆盖 PDF p001–p714 / 书页 p1–p700（书页 = PDF − 14）。最后一块 `Boyd凸优化_p701-714.bilingual.md`（书页 687–700）。

## 统计
- 总 2,311,251 bytes / 34,434 行 / 274,725 汉字（均 7,631 汉字/块）
- 公式 26,115 条（`extract-formulas.py`），KaTeX `katex-check.js` 0 失败、`files_with_errors = 0`
- `**[译注]**` 232 条（均 6.4 条/块）；原文错 `†` 80 条（均 2.2 条/块）

## 末块内容（p687-700，无 Index）
- 书页 687–696：References 剩余字母 B–Z，214 条 `[XXnn]`，纯文本逐条（非表格）
- 书页 697–699：**Notation 记号表**（7 组：specific sets / vectors-matrices / norms-distances / generalized inequalities / topology-convex analysis / probability / functions-derivatives）
- 书页 700：空白页（PDF 14 文字层 0 字符、0 图）⇒ **原书没有主题索引 Index**

## ⚠ 全书唯一系统性缺陷：`<!-- ===== pN ===== -->` 有两套体系
- **PDF 页码制**（块头灰块自证「书页 = PDF − 14」）：p041-060、p061-080、p121-140 … p461-480 共 19 份。例：`Boyd凸优化_p041-060.bilingual.md` 首条 PDF 页眉是书页 27，但标记写 `p041`。
- **书页制**：p001-020 … p041-060 中的早期块、p081-100（67–86）、p101-120（87–106）、p481-500 起至 p701-714（687–700）。
- 后果：跨块按页号检索会碰撞 —— 标记 67–80 同时出现在 p061-080（PDF 制）与 p081-100（书页制），467–480 同理；这是假重叠，不是内容重复。修复方式：对 PDF 制的 19 份文件把标记统一 −14。
