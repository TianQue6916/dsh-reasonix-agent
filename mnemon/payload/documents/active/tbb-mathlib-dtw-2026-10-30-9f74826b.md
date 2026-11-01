---
id: "9f74826b-ef7c-4784-8723-bce5de6cb4bf"
title: "「度量只依赖三公理」专题：TBB 引用核实、mathlib 层级证据与 DTW 反向承重（2026-10-30 收尾）"
description: "100b 实分析「度量三公理」专题的收尾证据档：旧稿 TBB §2.9–2.10 引用确认错误并以真 pdf 目录改为 Ch.13/§1.10/§11.2；mathlib Pseudo/Defs.lean 与 Defs.lean 行号证明 M1–M3 即 typeclass 字段、非负性可导出；DTW 缺 M3 被迫自造 LB_Keogh 下界的反向承重（两处 A 级文献 + DOI），以及为何仍保留一格 [未定位]。前序 0ad9820e。"
status: "active"
created_at: "2026-10-30T07:01:06.336Z"
updated_at: "2026-10-30T07:01:06.336Z"
content_hash: "a3a9b009b89224dfdd27df6bb4e0bd094322b1ef6d6bdceb3b665ccb4704a81f"
source_paths:
  - "Desktop/课程文件/100b实分析/度量三公理-只依赖-疑问与解答.md"
  - "Desktop/课程文件/100b实分析/_废弃-度量三公理-疑问与解答-v0九问版.md"
session_ids:
  - "80230af6-0e9f-41af-86b6-403b8492f60c"
memory_body_ids:
  []
---

# 「度量只依赖三公理」专题：证据收尾（2026-10-30）

承接 `0ad9820e-1e70-4292-9b63-439a21fb3e5c`（100b 实分析笔记工程，含四问锚点、`[未定位]` 纪律、KaTeX 交付校验流水）。本文只记该专题**待核项被核掉之后**落定的事实坐标与判定理由，流程与写作约定见前序文档。

## 1. TBB 引用：旧稿确定错误，真值在 Ch.13

- 旧稿开头写「度量空间的公理化表述见 TBB §2.9–2.10」——**错**。真 pdf 目录显示 `§2.9 = Monotone Convergence Criterion`、`§2.10 = Examples of Limits`，都在第 2 章 Sequences，与度量空间无关。
- 用户 Windows 上的 `TBB-AllChapters-Portrait.pdf` 已损坏（2.3 MB，linearized 声称 683 页但 `Cannot find Root object`，pypdf / fitz 均不可读）。可用副本在 Linux：`/home/tianque/.zoro/library/papers/2026-tbb-allchapters-portrait-398eafea/paper.pdf`（配 `pdftotext` 取目录）。
- 核实后的引用锚点：
  - `Ch.13 METRIC SPACES` p.537；`§13.2 Metric Spaces—Specific Examples` p.539；`§13.3.2 Function Spaces` p.545；`§13.4 Convergence` p.548；`§13.5 Sets in a Metric Space` p.552；`§13.8 Complete Spaces` p.575；`§13.12.4 Total Boundedness`；`§13.15 Challenging Problems`。
  - 若本意是「ℝ 的度量结构雏形」，该引 `§1.10 The Metric Structure of R`；ℝⁿ 版是 `§11.2 The Metric Structure of Rn`。

## 2. mathlib：三公理 = typeclass 字段（硬证据）

`curl raw.githubusercontent.com` 实取 `mathlib4@master`：

- `Mathlib/Topology/MetricSpace/Pseudo/Defs.lean:140` `class PseudoMetricSpace (α : Type u) : Type u extends Dist α`，三条字段紧随：`dist_self`(:141)、`dist_comm`(:142)、`dist_triangle`(:143)。
- `Mathlib/Topology/MetricSpace/Defs.lean:70` `class MetricSpace (α : Type u) : Type u extends PseudoMetricSpace α where`，比伪度量**只多** `eq_of_dist_eq_zero`。

两条推论，均写进了正文：

1. **「删掉 M1 的定性半」在工程上不是教学玩具，而是类型层级**——pseudometric 是 `C(X,Y)`、半范数空间、商构造的中间层。
2. `Pseudo/Defs.lean:113-118` 用 `0 = dist x x ≤ dist x y + dist y x = 2 * dist x y` 把**非负性**从其余三条导出 ⇒ 印证账本第 1 行「M1 里被真正消费的是定性半，非负性可并进背景」；据此改了两处措辞：坏世界段明写「删的只是 $d=0\Rightarrow x=y$ 这一半，伪度量仍非负」；Dijkstra 段区分「边权非负（图的属性）vs 度量非负（公理推论）」。

## 3. 承重 4：DTW —— 反向承重（缺 M3 就得付构造费）

比前三条更强：前三条讲「有 M1–M3 所以能复用」，这条讲「缺 M3 时工程上必须自造下界」，把「三角不等式是承重项」从断言变成账单。

- 组件 + 功能：时间序列相似度检索中 DTW 的候选剪枝；DTW 朴素计算 $O(n^2)$，检索成败全在剪枝层。
- 事实（两处独立、A 级）：
  - Keogh & Ratanamahatana, *Exact indexing of dynamic time warping*, KAIS **7**(3) 2005, doi `10.1007/s10115-004-0154-9`：DTW 不满足三角不等式，故不能像欧氏距离那样直接三角剪枝，只能构造 envelope 型下界 **LB_Keogh**，且必须证明它确是下界。
  - Lemire, *Faster retrieval with a two-pass dynamic-time-warping lower bound*, Pattern Recognition **42**(1) 2009, doi `10.1016/j.patcog.2008.11.030`：原句 *"The DTW fails to satisfy the triangle inequality and its computation requires quadratic time. Hence, to find closest neighbors quickly, we use bounding techniques."*，并复述 LB_Keogh 可剪掉 **90%+** 的 DTW 计算。
- 定量后果：「每个候选算 $O(n^2)$」→「先算 $O(n)$ 下界、只对少数候选算精确 DTW」。
- 消失测试双向成立：① 硬套三角剪枝 ⇒ **静默漏报**（不报错、只少返回真邻居）；② 下界未被证明 ⇒ 同样静默漏报且依数据分布，更难查。
- 旁证链：metric index 的剪枝判据本身即三角不等式（Ciaccia–Patella–Zezula, VLDB 1997）；非度量空间检索需另配剪枝函数（NeurIPS 2013《Learning to Prune in Metric and Non-Metric Spaces》）；余弦相似度的三角不等式迟到 SISAP 2021 才补（E. Schubert）——说明「缺一条公理就补一次」是进行中的工程，不是历史遗迹。

## 4. 仍保留的一格 `[未定位]`，以及判定标准

- 保留范围收窄为一格：「**某个业务系统的业务指标因为三公理而改善**」的因果链，查不到可引的一手材料；现有证据全部停在库 / 算法 / 检索结构层。
- 判定理由（可复用的判据）：留白在「检索文献里查一次就有 A 级坐标」的情况下是**懒惰**而非诚实，故补；在「再往下只能编因果链」的情况下是**必要**，因为编出来的因果会以「已理解」的身份进偏序图，比缺一格更坏。

## 5. 交付状态

- Windows 工作副本：`Desktop/课程文件/100b实分析/度量三公理-只依赖-疑问与解答.md`（363 行 / 36849 B，md5 `4fc83c5edbc237993d9580d22ca1ee33`）；v0 九问版改名 `_废弃-…-v0九问版.md` 留底。
- Linux 镜像：`/media/OS/linux-home/桌面-待处理文件夹/数学/度量三公理-只依赖-疑问与解答.md`，md5 与 Windows 端一致（`cp` 后两端对账是本专题的固定验收动作）。
- 校验：KaTeX 154 条 / 0 失败 / 0 warning；`$$` 0、`\[` 0、`<div>` 0、行首英文仅公式块内 3 行。
