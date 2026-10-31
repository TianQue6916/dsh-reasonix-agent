# wave-boyd241 · Boyd & Vandenberghe《Convex Optimization》PDF p241-260 / p261-280

WORKER_ID = boyd241　执行时间 2026-10-28　技能 learn-translate 形态 A（教材翻译 worker）

## 1. 交付物

| 文件 | bytes | 行数 | 覆盖 PDF 页 | 原书印刷页 | 页标记数 |
|---|---|---|---|---|---|
| `C:/Users/27063/Documents/翻译产出/教材/Boyd凸优化/Boyd凸优化_p241-260.bilingual.md` | 56 895 | 993 | p241–p260 | p.227–p.246 | 20（p241..p260 齐全） |
| `C:/Users/27063/Documents/翻译产出/教材/Boyd凸优化/Boyd凸优化_p261-280.bilingual.md` | 60 669 | 1218 | p261–p280 | p.247–p.266 | 20（p261..p280 齐全） |

覆盖章节（Chapter 5 Duality）：§5.2.4 Examples（least-squares / LP / QCQP / entropy maximization / minimum volume covering ellipsoid / 带 strong duality 的非凸二次 trust-region 问题）· §5.2.5 Mixed strategies for matrix games · §5.3 Geometric interpretation（5.3.1 / Epigraph variation / 5.3.2 证明 / 5.3.3 Multicriterion）· §5.4 Saddle-point interpretation（5.4.1–5.4.4，含 price/tax 解释）· §5.5 Optimality conditions（5.5.1 证书与停止准则 / 5.5.2 Complementary slackness / 5.5.3 KKT（例 5.1 等式约束 QP、例 5.2 water-filling）/ 5.5.4 KKT 的力学解释 / 5.5.5 通过对偶解原问题：例 5.3、例 5.4）· §5.6 Perturbation and sensitivity analysis（5.6.1–5.6.3 + shadow price）· §5.7 Examples（5.7.1–5.7.3，例 5.5–5.9）· §5.8 Theorems of alternatives（5.8.1–5.8.3，Farkas' lemma、例 5.10 无套利价格界、椭球交）· §5.9 Generalized inequalities（5.9.1，例 5.11 SDP dual、例 5.12 cone program dual、5.9.2 起头）。

## 2. 阻塞验收（KaTeX 真渲染）

```
cd C:/Users/27063/.dsh/tools
python extract-formulas.py <目录> <绝对路径 json>
node katex-check.js <json> C:/Users/27063/.dsh/tools <out json>
```

| 范围 | files | formulas | fails | files_with_errors |
|---|---|---|---|---|
| **我这两份独占**（临时目录只放本批 2 份） | 2 | 1123（597 + 526） | **0** | **0** |
| 目录合并（OUT_DIR 全部 17 份 `.bilingual.md`） | 17 | 10402 | **0** | **0** |

补充 lint（自写 python）：两份均 `$$` 计数 0、`\[` 计数 0、非围栏行 `$` 奇偶检查 0 处奇数。报告结论：**files_with_errors = 0**。

注：`extract-formulas.py` 只接受**目录**（内部 `os.walk` + `*.bilingual.md` 过滤），传单个文件路径会得 `files 0, formulas 0` 的假通过 —— 已踩过，报告中记为坑。行式抽取会漏「一行多公式」的长行，本批公式密集区（(5.49)、(5.54)、(5.67)、(5.69)–(5.71)）已用块级 `math` 围栏承载，行内公式多为单枚，故漏检风险低。

## 3. 术语表（15–25 条，一律保留 English 原词）

| English | 首现处理 | 备注 |
|---|---|---|
| convex / convexity | convex（凸） | 后文只留 convex |
| dual function | dual function（对偶函数） | 不译 |
| Lagrange dual problem | Lagrange dual problem | |
| strong duality / weak duality | strong duality（强对偶） | 全篇保留 |
| duality gap | duality gap（对偶间隙） | §5.5.1 定义处标中文 |
| Slater's condition | Slater's condition | constraint qualification（约束品性） |
| optimal / optimal value | optimal（最优的） | 不写「最优解」以免与 optimal point 混淆 |
| feasible / feasibility | feasible（可行） | |
| epigraph | epigraph | 不译 |
| supporting hyperplane | supporting hyperplane（支撑超平面） | + nonvertical |
| conjugate function | conjugate（共轭函数） | $f^{*}$ |
| perspective | perspective | 不译（§5.7.1 末） |
| saddle-point | saddle-point（鞍点） | + max-min inequality / strong max-min property |
| complementary slackness | complementary slackness（互补松弛） | (5.48) |
| KKT conditions | KKT 条件 | Karush-Kuhn-Tucker |
| perturbation / sensitivity | perturbed problem（扰动问题） | shadow price（影子价格） |
| scalarization | scalarization | §5.3.3 |
| multicriterion / Pareto optimal | multicriterion（多准则） | 与 §4.7 一致 |
| theorems of alternatives | strong alternatives（强择一） | weak alternatives |
| proper cone / dual cone | proper cone（真锥） | $K^{*}$ |
| generalized inequality | generalized inequality（广义不等式） | $\preceq_K$ |
| semidefinite program (SDP) | SDP | cone program（锥规划） |
| water-filling | water-filling（注水） | 例 5.2 |
| kinematic constraint | kinematic constraint（运动学约束） | §5.5.4 |
| arbitrage / risk-neutral | arbitrage（套利） | 例 5.10 |

## 4. 最没底的三处（含原因）

1. **Figure 5.9（原书 p.247）力平衡图的箭头方向。** 文字层只留下 `λ1 / λ2 / k1x1 / k2(x2−x1) / k3(l−x2)` 这些孤立标注，没有箭头与位置信息。我的图注按正文「contact force 必须背离接触面（$\lambda_1 \ge 0$、$-\lambda_2 \le 0$）」推断了方向。若原图箭头与我的描述相反，读者对照会困惑——但我刻意只描述「谁对谁施力」，不描述箭头朝向，降低误述风险。
2. **例 5.2 water-filling 的推理链缺一步。** 原文从「$\nu^{\star} \lt 1/\alpha_i$ ⇒ $x_i^{\star} \gt 0$」到「$x_i^{\star} = 1/\nu^{\star} - \alpha_i$」时，隐含用到 $\nu^{\star} \gt 0$（否则 $x_i^\star$ 会是负数，与 $x^\star \succeq 0$ 冲突）。原书没有显式论证 $\nu^{\star} \gt 0$，我照译未补，只在正文里保持方程形式一致。这是原文的跳步，不是我译错。
3. **§5.8.2 nonstrict 情形的「$p^{\star}$ 被取到」。** 原文写 "the optimal value $p^{\star}$ of (5.81) is attained"，此处的 $p^{\star}$ 是 (5.81) 那个辅助问题的 optimal value，与全章主问题 (5.1) 的 $p^{\star}$ **同名不同物**。我译文中显式补了「(5.81) 的」以消歧，属于必要的译注级澄清；但如果用户比对原文行，会觉得多了一句定语。

## 5. 跳过或降级处理的结构

- **图**：Figure 5.3、5.4、5.5、5.6、5.7、5.8、5.9、5.10 共 8 图，全部以 `[Figure N：…]` 文字描述保留，未静默丢弃。所有图注都注明「轴刻度未从文字层恢复」——fitz 在 Boyd 的矢量图里只抽出孤立数字（如 `0 / 5 / 10`），无法定位到刻度位置，故不编造数值。
- **表**：本批无表格。
- **习题**：本批范围内无习题正文（only 交叉引用「见习题 5.8 / 5.21 / 5.23 / 5.32 / 5.38」，这些引用照原文保留）。
- **公式编号**：全部照原文，未硬编码重排。原文 (5.43)–(5.92) 逐条对齐。
- **§5.9.2 尾部**：本批止于「我们先导出 complementary slackness 条件」一句，其后的 (5.93)–(5.95)（KKT 对 generalized inequality 的推广）属 PDF p281 起，**不在本批范围**，未越界翻译。

## 6. 原文自身的问题（最重要一节，不替原文圆场）

1. **记号冲突：§5.6.3 "Shadow price interpretation" 段写 $x \in \mathbf{R}^m$。** 全章主问题 (5.1) 的 $x \in \mathbf{R}^n$、$m$ 是 inequality constraint 的条数；该段却把运作变量写成 $x \in \mathbf{R}^m$，与既有记号直接冲突（同段又说「每条 constraint $f_i(x) \le 0$ 代表某种资源限制」，$i$ 跑到 $m$）。判断：印误，应为 $x \in \mathbf{R}^n$。**译文保留 $x \in \mathbf{R}^m$ 并在此报告**（不擅自改原文数学，但读者必须知道这是原文笔误）。
2. **§5.8.3 "Linear inequalities" 一段跳步。** 原文给出 $Ax \preceq b$ 的 alternative $\lambda \succeq 0, A^T\lambda = 0, b^T\lambda \lt 0$ 后写「These are, in fact, strong alternatives. This follows since the optimum in the related problem (5.81) is achieved, unless it is unbounded below.」——但 (5.81) 是为**严格**不等式系统 (5.79) 构造的辅助问题，而 $Ax \preceq b$ 是**非严格**系统，严格来说应引用 §5.8.2 中 nonstrict 段的论证（那里额外要求「(5.81) 的 optimal value 被取到」）。原文借 (5.81) 一句话带过，条件合并了两处，读者若独立推导会发现条件不足以覆盖该例。
3. **§5.8.1 与 §5.8.2 的 alternative 系统记号几乎是同一组式子。** (5.76) $\lambda \succeq 0, g(\lambda,\nu) \gt 0$（weak，无需凸性）与 (5.84) $\lambda \succeq 0, g(\lambda,\nu) \gt 0$（strong，需凸性 + 取到条件）逐字相同。原文用签名相同的两组编号表达「弱」与「强」两种地位，极易被误读成「强择一不需要额外条件」。这不是错，但记号复用制造了阅读陷阱；译文保留了同一形式，未做美化。
4. **§5.3.2 证明中「再加两个假定」。** 原文为简化证明假定 $D$ 有非空内部、且 $\mathbf{rank}\,A = p$。这两条在正文里被称作 "two additional assumptions" 而**没有交代**当它们不成立时怎么办（真实的证明要退到 relative interior 与 $A$ 的零空间分解，见 §B.1 的完整版本）。这属于「以简化换可读」的选择，但读者若以为定理只在这两条下成立，会低估定理。
5. **页码系统本身。** 本书 PDF 的 `fitz` page index 与印刷页码差 14（书页 = PDF − 14，用 PDF p229 页眉印 216、p262 页眉印 249 复核）。但**页眉/页脚数字在 fitz 的文本流里排在该页文本最前面**（如 `['5.2','The Lagrange dual problem','227']`），极易被误当成「上一页页码」从而把映射判成 −13。本次过程中我一度据此改判并写下 −13，随后用两处页眉交叉复核纠回 −14 并重排全篇页标记。**任何人重做这批都要注意这条陷阱。**

## 7. 本批技术事故记录（供后续 worker 避坑）

1. **heredoc 追加被截断。** 用 `cat >> file <<'MDEOF'` 追加约 16 KB 中文时，命令在约 7 KB 处被静默截断（bash 报 `here-document delimited by end-of-file`，且把后续 `wc` 也吞进 heredoc）。**结论：长中文正文一律先 `write` 到 Temp 片段再用 python 拼接，不要用 heredoc。**
2. **页标记整体偏移一页。** 首次用 `for i in range(240,280)` 提取时，`<<<PAGE i>>>` 里的 $i$ 是 fitz index（0-based），真实 PDF 页码 = $i+1$，导致第一轮所有页标记比真实页码小 1。已用「标记数字 +1、块内容随标记移动」的方式整体修正，并用「每页首句 vs 该页原书首句」逐页核对 20+20 个块起点。
3. **PDF p241 整页曾漏译。** 第一轮把 p242 的开头（"It is possible to derive an expression for $g(\lambda)$"）当成了 p241 的收尾，导致 p241 真正内容（refined Slater 收尾 + §5.2.4 的 least-squares / LP dual / QCQP (5.28) 三例）整页缺失。已补译并插入 `<!-- ===== p241 ===== -->` 块，`formulas` 由 597 稳定在 597（新增页带来约 30 个式子后总数变化已复核）。
4. **`extract-formulas.py` 只吃目录**（见 §2 注）。

## 8. 自检清单（对照任务规范逐条）

- 行内双语、术语首现 `English（中文）`、无「英文段 + 中文段」对照排版：✓（grep 英文行首为 0，除公式围栏与标签）
- 公式：行内 `$...$`、块级 ```` ```math ```` 围栏、无 `$$`、无 `\[`、无 Unicode 上下标：✓（脚本计数均为 0）
- 定理/定义/证明/例 的 span 配色：example=`#6c3483`（照 STYLE_REF `Boyd凸优化_p181-200.bilingual.md`）、proof=`#873600`、译注=`#1e8449`；未把自写段落套原书标签：✓
- 每页一个 `<!-- ===== pNNN ===== -->`，N 为 PDF 页码；文件头写清映射公式：✓（两份各 20 个，连续无缺）
- 图/表不静默丢弃：✓（8 图全部 `[Figure N：…]`）
- 习题留英文标 `[exercise]`：本批无习题正文
- 译者注 ≥1 条、800–1200 字、含机制 + 可点开落点、绿色 `#1e8449`：✓（第一份：Lagrange multiplier 的力/价格/法向量三重身份 + 抽掉它后 stopping criterion 与 sensitivity 崩在哪；第二份：theorems of alternatives 作为 infeasibility certificate，含 HiGHS/Gurobi Farkas dual ray、§2.5.1 (2.17)(2.18) 对照、`scipy.optimize.linprog` 可跑验证）
- 不越级（无群论/环论/拓扑/非标准分析）：✓（挂到 Strang 四个子空间、6.042J 偏序、6.006 算法、概率/信息论 capacity）
- 未自行加量/缩量：✓（严格 p241–p280）
