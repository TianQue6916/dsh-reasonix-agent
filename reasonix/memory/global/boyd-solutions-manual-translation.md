---
id: mem-68beb3b37b564c4c7cba18ac2e9e3e65
revision: 1
created_at: "2026-10-27T20:43:59.771Z"
updated_at: "2026-10-27T20:43:59.771Z"
name: boyd-solutions-manual-translation
description: "Boyd 凸优化官方解答手册翻译：已交付 p001-040，PDF 文字层符号系统性错映射与已核实原文硬错清单"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 状态（截至 2026-10-28）

- 源：`C:/Users/27063/Documents/源料-教材/Boyd答案手册/`，16 份分册，共 302 页。
- 产出：`C:/Users/27063/Documents/翻译产出/教材/Boyd答案手册/`
  - `Boyd答案手册_p001-020.bilingual.md` 74,561 B / 1,471 行 / 习题 2.1–2.28
  - `Boyd答案手册_p021-040.bilingual.md` 65,827 B / 1,360 行 / 习题 2.29–2.39 + 3.1–3.17（3.17 在 p040 被切断，续 p041）
- KaTeX：合并 2442 公式 0 失败；独占 1327 / 1115 均 0 失败。

## PDF 文字层缺陷（后续所有分册必踩）

`pdftotext -layout`（不带 `-enc UTF-8`）落成 Latin-1 且**数学符号全丢**。必须用：

```
pdftotext -enc UTF-8 -layout in.pdf out.txt
```

即便如此仍有系统性错映射：`\succeq`→`0`、`\preceq`→`b`、`\ne`→`=`、`\notin`→`\in`、`\sum`/`\prod`→孤立 `i` 或空、上下标漂移、`\mathcal{D}`→`D`、`\mathbb{R}^m\times\mathbb{R}^n`→`R^{m×n}`。凡影响含义处必须 pdftoppm 渲染 + read_image 视觉核对，不能凭文本层判断「原文是否错」。

## 已核实原文硬错（视觉核对过，不是抽取错）

1. **2.31(d)** `int K* = {y | y^T x > 0 for all x ∈ K}` 是空集（x=0 恒在 K 中）。应为「一切**非零** x」。修正式对 K=R²₊ 给出 {y≻0}，正确。
2. **2.28** n=3 的三个 1×1 条件印成非对角元 x2,x3（应为 x1,x4,x6）；反例 X=[[1,-0.1,0],[-0.1,1,0],[0,0,1]] 特征值 0.9,1,1 全正而 x2=-0.1<0。
3. **2.28** 三阶行列式化简式写成 −2x₂x₃x₅（应为 +2x₂x₃x₅）。x=(1,1,1,0.5,0.5,0.5) 验算：正确 det=0.5，错式给 0。
4. **2.22** 分离定理两分支条件写反（0∈cl S 才需要收缩+取极限，不能直接严格分离）。
5. **2.1** 两处下标笔误（μ3 写成 μ2；μ1+μ2 应为 μ2+μ3）。
6. 轻的：2.4 末句、3.1(d) 少一撇、2.15(b)(i)、3.4 积分端点、3.14(b) strong max-min 只证半步、2.16 维数、2.36 V_ij 分支、3.11 对称化矩阵未验算。

## 图

全部分册的图都是 PSfrag 残图（只剩 `PSfrag replacements` 字样），刻度/箭头/角度无法复原。按「它演示什么」写 `[Figure N：...]` 并明说非复原。
