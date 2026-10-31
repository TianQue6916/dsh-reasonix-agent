# Boyd《Convex Optimization》官方勘误 × 我们 36 块译文 核查表

> 来源：`https://web.stanford.edu/~boyd/cvxbook/cvxbook_errata.html`（作者 Boyd & Vandenberghe 维护，2026-10-29 curl 实测 200 / 17,266 B）
> 解析出 **171 条带页码勘误**，覆盖 35 个 20 页块。
> **注意**：这里说的是**书页号**，我们 36 块已统一到 **PDF 号**；书页 → PDF 需加前置页偏移（前 14 页为前置，`pdf1..pdf14`），即 **PDF 页 = 书页 + 14**。

## 用法
1. 打开对应块的 `.bilingual.md`，定位 `<!-- ===== pNNN ===== -->`（**PDF 号**）
2. 按勘误检查译文有没有跟着错
3. 复现了原书错 → 修正 + 加 `> **[勘误]** 原书此处有误：<原文> → <勘误>（Boyd 官方 errata）`
4. 译文本来就对 → 也加一行说明


## Boyd凸优化_p015-034（书页 1-20，1 条）

- [ ] **书页 7（PDF 21）**：page 7, line below equation (1.7). "The details will be given in chapter 4" should be "The details will be given in chapter 6".

## Boyd凸优化_p035-054（书页 21-40，1 条）

- [ ] **书页 38（PDF 52）**：page 38, example 2.10. missing final period in first sentence.

## Boyd凸优化_p055-074（书页 41-60，3 条）

- [ ] **书页 43（PDF 57）**：page 43, example 2.14: 'than' should read 'that' in lines 3 and 5.
- [ ] **书页 46（PDF 60）**：page 46, section 2.5.1. add "nonempty" to "C and D are two convex sets".
- [ ] **书页 47（PDF 61）**：page 47, figure 2.18. E2 is not minimal.

## Boyd凸优化_p075-094（书页 61-80，4 条）

- [ ] **书页 62（PDF 76）**：page 62, exercise 2.16. "R^{m x n}" should be "R^{m + n}".
- [ ] **书页 63（PDF 77）**：page 63, exercise 2.20 requires the assumption that Ax=b is solvable.
- [ ] **书页 64（PDF 78）**：page 64, exercise 2.31d. last "K" should be "cl K".
- [ ] **书页 65（PDF 79）**：page 65, exercise 2.37b. Delete "known as the Markov-Lucacs theorem".

## Boyd凸优化_p095-114（书页 81-100，5 条）

- [ ] **书页 88（PDF 102）**：page 88, line 1. changed "provided $g(x) -\infty$ for all $x$."
- [ ] **书页 88（PDF 102）**：page 88, line 15. This assumes that the infimum in (3.16) is attained.
- [ ] **书页 95（PDF 109）**：page 95, last sentence. "A function is quasilinear if its domain, and every level set {x|f(x)=alpha} is convex" should be "If f is quasilinear, then its domain, and every level set {x|f(x)=alpha} is convex"
- [ ] **书页 97（PDF 111）**：page 97, line -3 of example 3.33. Insert "is" before "equivalent".
- [ ] **书页 98（PDF 112）**：page 98, second displayed equation. "PV(x,r) >= 0 for 0  0 for 0 = 0" should be "PV(x,r) > 0" and "0 page 109, last bullet in example 3.46. "det X is increasing on S^n_+" should be "det X is increasing on S^n_++ and nondecreasing on S^n_+".

## Boyd凸优化_p115-134（书页 101-120，9 条）

- [ ] **书页 103（PDF 117）**：page 103, line -13: delete period after "otherwise".
- [ ] **书页 114（PDF 128）**：page 114, exercise 3.10. f_0 should be f.
- [ ] **书页 114（PDF 128）**：page 114, exercise 3.5.  added short hint.
- [ ] **书页 114（PDF 128）**：page 114, exercise 3.9 (b).  On line 2 and in the hint, replace "if and only if" with "if".
- [ ] **书页 117（PDF 131）**：page 117, exercise 3.23 (a), last line: `is convex on {(x,t) | t>0}'.
- [ ] **书页 118（PDF 132）**：page 118, last line: replace kxk by ixi.
- [ ] **书页 118（PDF 132）**：page 118, line -7: replace n by k in the upper limit of the product on the the right.
- [ ] **书页 119（PDF 133）**：page 119, exercise 3.29. Add that $f$ is convex.
- [ ] **书页 120（PDF 134）**：page 120, exercise 3.34e. add "bounded" to assumptions on C.

## Boyd凸优化_p135-154（书页 121-140，7 条）

- [ ] **书页 121（PDF 135）**：page 121, exercise 3.41.  replaced with new problem.
- [ ] **书页 121（PDF 135）**：page 121, exercise 3.44 (a).  On the first line, replace "if and only if" with "if".
- [ ] **书页 123（PDF 137）**：page 123, exercise 3.54c. add "for xpage 124, end of exercise 3.55. Last inequality should be h'(x)<0.
- [ ] **书页 124（PDF 138）**：page 124, exercise 3.58. "viewed as function" should be "viewed as *a* function".
- [ ] **书页 128（PDF 142）**：page 128, line 14: replace f(x) by f_0(x).
- [ ] **书页 130（PDF 144）**：page 130, line after equation (4.3). Should be "where alpha_i>0, i=0,...m".
- [ ] **书页 140（PDF 154）**：page 140, two lines below (4.22). "Suppose x is feasible" should be "Suppose x is optimal".

## Boyd凸优化_p155-174（书页 141-160，4 条）

- [ ] **书页 141（PDF 155）**：page 141, example 4.6. "where a_i^T,...,a_m^T" should be "where a_1^T,..,a_m^T".
- [ ] **书页 144（PDF 158）**：page 144, equation (4.25). "for all y \in X" should be "for all y\in X\{x}".
- [ ] **书页 157（PDF 171）**：page 157, 4th line below (4.37), righthand side of eqtn `\sup \{u^T P_i x' should be `\sup \{u^T P_i^T x'.
- [ ] **书页 159（PDF 173）**：page 159,160 (1/K) in gradient expression should be K! in last eqn, differences should be multiplied by K. not divided. on p160, differences should be mult by K; also we should multiply obj by (1/K^2).

## Boyd凸优化_p175-194（书页 161-180，3 条）

- [ ] **书页 167（PDF 181）**：page 167, equation above section 4.6. "s_3v_3<=lambda v_3" should be "s_3v_3<=lambda v_4"; also, "1/2<=c_i<=2" should be "1/2<=c_i/c_i^nom<=2".
- [ ] **书页 169（PDF 183）**：page 169, definition of "K_i". "R^{k_i+1}" should be "R^{n_i+1}".
- [ ] **书页 177（PDF 191）**：page 177, line 6. "||Fv||_2^2" should be "||F^Tv||_2^2".

## Boyd凸优化_p195-214（书页 181-200，5 条）

- [ ] **书页 184（PDF 198）**：page 184, end of first paragraph.  Switch $F_i$ and $F_j$.
- [ ] **书页 191（PDF 205）**：page 191, exercise 4.6. Middle bullet at bottom of problem should be "f_1,...f_m are nondecreasing in x_r", not "f_1,...f_m are nonincreasing in x_r".
- [ ] **书页 199（PDF 213）**：page 199, exercise 4.29. Gave the required condition, instead of asking for it.
- [ ] **书页 199（PDF 213）**：page 199, exercise 4.31. Missing lower bound on aspect ratio, Smin <= h_i/w_i, which is in original problem (p165).
- [ ] **书页 199（PDF 213）**：page 199, line -10: `di' should be in the numerator: E*wi*hi^3*di/(6*F) <= 1.

## Boyd凸优化_p215-234（书页 201-220，9 条）

- [ ] **书页 201（PDF 215）**：page 201, exercise 4.39 (b): second "minimize" should be "subject to".
- [ ] **书页 201（PDF 215）**：page 201, exercise 4.39, last equation. Bottom left entry in matrix \tilde G should be b^T, not b.
- [ ] **书页 207（PDF 221）**：page 207, exercise 4.55, 2nd part of problem: add requirement that scalarized problem has unique solution.
- [ ] **书页 208（PDF 222）**：page 208, exercise 4.58. "The variables are c_1,...,cT" should be "The variables are c_0,...,c_T", and the sum defining U should start at t=0.
- [ ] **书页 208（PDF 222）**：page 208, line 2. In the first sum the index i should run from 1 to m; in the second sum, j should run from 1 to n.
- [ ] **书页 209（PDF 223）**：page 209, exercise 4.60, bottom equation, middle term.  "i=1" should be "t=1".
- [ ] **书页 209（PDF 223）**：page 209, line 3. Replace `know' by `known'.
- [ ] **书页 212（PDF 226）**：page 212, bottom equation: T+1 should be T.
- [ ] **书页 218（PDF 232）**：page 218, line 9.  "g_i(x)" should be "h_i(x)".

## Boyd凸优化_p235-254（书页 221-240，3 条）

- [ ] **书页 228（PDF 242）**：page 228, third equation. remove "2" in term "2q_i^Tx".
- [ ] **书页 229（PDF 243）**：page 229, line 15. Added explicit assumption A\not\succeq 0.
- [ ] **书页 232（PDF 246）**：page 232, equation (5.37). R^p should be {0}.

## Boyd凸优化_p255-274（书页 241-260，11 条）

- [ ] **书页 243（PDF 257）**：page 243 last equation (5.49). lambda_i^\star\succeq 0 should be lambda_i^star \geq 0.
- [ ] **书页 245（PDF 259）**：page 245 middle. "implies that \nu=1/(\alpha_i+x^\star_i)".
- [ ] **书页 247（PDF 261）**：page 247, line 6 from the bottom. 'lambda2' should read 'lambda3'.
- [ ] **书页 249（PDF 263）**：page 249, line 4.  "dom f" should be "dom f_0".
- [ ] **书页 250（PDF 264）**：page 250, line 13.  "p^*:R^m x R^p" should be "p^*:R^m x R^p -> R".
- [ ] **书页 253（PDF 267）**：page 253 first equation: \partial p^\star(0,0) should be \partial p^\star(0) (since there are no equality constraints here).
- [ ] **书页 255（PDF 269）**：page 255 last line (twice) and page 256 (lines 5, 6 and eq. 5.67): f^\star should be f^*.
- [ ] **书页 255（PDF 269）**：page 255 last line of example 5.6. "we use fact the conjugate" should be "we use the fact *that* the conjugate".
- [ ] **书页 255（PDF 269）**：page 255, the expression of L following (5.66): "y0,y1,...,ym" should be included in the argument list.
- [ ] **书页 256（PDF 270）**：page 256, line 6. "lambda_i f_i^*(nu_i/lambda_i)=-infty" should be "lambda_i f_i^*(nu_i/lambda_i)=infty".
- [ ] **书页 260（PDF 274）**：page 260 bottom equation. subscript "x\in D, t" should be "x\in D, s".

## Boyd凸优化_p275-294（书页 261-280，11 条）

- [ ] **书页 263（PDF 277）**：page 263, line below (5.87). change "inequalities" to "equalities and inequalities".
- [ ] **书页 265（PDF 279）**：page 265, line 12. "weak duality," can be deleted.
- [ ] **书页 267（PDF 281）**：page 267 (line -5), page 269 (equation (5.98) and line -6),
- [ ] **书页 267（PDF 281）**：page 267 (line 9).  "the both sums" should be "the two sums".
- [ ] **书页 268（PDF 282）**：page 268 8th line from bottom. 'Since F(x^*)\succeq 0' should be 'Since F(x^*)\preceq 0'.
- [ ] **书页 269（PDF 283）**：page 269 (line -3).   "We now assume that the functions ...".
- [ ] **书页 269（PDF 283）**：page 269 8th line from bottom '\lambda_i \geqKst' missing RHS 0.
- [ ] **书页 270（PDF 284）**：page 270 (line 2, equation (5.102) and line -11): "K_i^\star" should be "K_i^*".
- [ ] **书页 270（PDF 284）**：page 270, 6 lines above the example: "strict" should be "nonstrict".
- [ ] **书页 274（PDF 288）**：page 274, Exercise 5.6: bottom of 1st paragraph. "how much larger is ||.||_2 than ||.||_\inf?" should be "...is ||.||_\inf than ||.||\_inf?"
- [ ] **书页 277（PDF 291）**：page 277, exercise 5.14, second equation. "f(x)" should be "f_0(x)".

## Boyd凸优化_p295-314（书页 281-300，2 条）

- [ ] **书页 287（PDF 301）**：page 287, Exercise 5.43, line below dual: "data are c \in \reals^n, ..." should be "data are f \in \reals^n..."
- [ ] **书页 287（PDF 301）**：page 287, line 7 of exercise 5.43. The constraint "||ui||_2 <= vi" in the dual problem should be "||ui||_2 <= -vi".

## Boyd凸优化_p315-334（书页 301-320，9 条）

- [ ] **书页 310（PDF 324）**：page 310, example 6.4.  Switch m and n in first three lines.
- [ ] **书页 314（PDF 328）**：page 314, bottom paragraph. subscript "corr" should be "cor".
- [ ] **书页 314（PDF 328）**：page 314, line -4. "Figure 6.14 show" should be "Figure 6.14 shows".
- [ ] **书页 314（PDF 328）**：pages 314 and 317.  The order of the three plots in figure 6.14 should be reversed to be consistent with figures 6.10 and 6.12. The references to 'top' and 'bottom' in the caption and at the end of page 314 must be changed accordingly.
- [ ] **书页 316（PDF 330）**：page 316 Figure 6.12. Labels \hat{x}_i shoud not have a subscript; none of the similar figures in chapter 6 have that kind of subscript.
- [ ] **书页 316（PDF 330）**：page 316, figure 6.12: replace `smoothes' with `smooths'.
- [ ] **书页 318（PDF 332）**：pages 318--19.  Three occurrences of "statistical robust approximation" should be "stochastic robust approximation".
- [ ] **书页 319（PDF 333）**：page 319, line 15.  "variance delta" should be "variance delta/m".
- [ ] **书页 319（PDF 333）**：page 319, norm squared should be 2-norm squared.

## Boyd凸优化_p335-354（书页 321-340，3 条）

- [ ] **书页 326（PDF 340）**：page 326, last equation. "S_n" should be "S_m".
- [ ] **书页 327（PDF 341）**：page 327 middle: "piecewise-linear linear".
- [ ] **书页 336（PDF 350）**：page 336, line -3. "in in" should be "in".

## Boyd凸优化_p355-374（书页 341-360，3 条）

- [ ] **书页 346（PDF 360）**：page 346, line 2. "log(1-x^2)" should be "log(1-u^2)".
- [ ] **书页 352（PDF 366）**：page 352, line -9: replace (1/2)\log(2\pi\sigma) by (m/2)\log(2\pi\sigma^2).
- [ ] **书页 353（PDF 367）**：page 353, first equation. "a_i^Tx-b_i" should be "b_i-a_i^Tx".

## Boyd凸优化_p375-394（书页 361-380，5 条）

- [ ] **书页 362（PDF 376）**：page 362, line 11. "most unequivocal" should be "most equivocal".
- [ ] **书页 365（PDF 379）**：page 365, line 7. "we have mistaken $\theta$ for $\hat \theta$" should be "we have mistaken $\hat \theta$ for $\theta$".
- [ ] **书页 366（PDF 380）**：page 366, line 9 and -2. in both lines, "mistaking $\theta=j$ for $\theta=i$" should be "mistaking $\theta=i$ for $\theta=j$".
- [ ] **书页 375（PDF 389）**：page 375, equation 7.17: the sum in the second constraint runs from 0 (not "o") to n.
- [ ] **书页 376（PDF 390）**：page 376, bottom equation. replace "z" with "X".

## Boyd凸优化_p395-414（书页 381-400，8 条）

- [ ] **书页 385（PDF 399）**：page 385, section 7.5.1. "comparable to n" should be "comparable to p".
- [ ] **书页 386（PDF 400）**：page 386, first line. should be "for which a_j=v_i".
- [ ] **书页 387（PDF 401）**：page 387 bottom. (not really a typo.)  explain that $e_k$ in bottom equation is unit vector, not $k$th component of $e$ (the estimation error vector)
- [ ] **书页 387（PDF 401）**：page 387, last equation: replace matrix inequality with [ sum_i=1^p lambda_i v_i*v_i^T e_k; e_k^T u_k ] >= 0, k=1,...,n.
- [ ] **书页 388（PDF 402）**：page 388, sentence above (7.30). "be expressed is" should be "be expressed as".
- [ ] **书页 393（PDF 407）**：page 393 Exercise 7.2: l5: "\leq a" should be "\leq \alpha".
- [ ] **书页 394（PDF 408）**：page 394, exercise 7.6. "has mean b" should be "has mean b/a".
- [ ] **书页 396（PDF 410）**：page 396, line -2: replace "lower bound" by "upper bound".

## Boyd凸优化_p415-434（书页 401-420，1 条）

- [ ] **书页 420（PDF 434）**：page 420, 3 lines below (8.19). "analytic center in unique" should be "analytic center is unique".

## Boyd凸优化_p435-454（书页 421-440，7 条）

- [ ] **书页 426（PDF 440）**：page 426, first and third lines following (8.25). in both cases, "a^z+b$ should be $a^Tz-b$.
- [ ] **书页 427（PDF 441）**：page 427, first line of 2nd paragraph. remove "the" from "The first term is the proportional".
- [ ] **书页 429（PDF 443）**：page 429, caption of figure 8.12. "circles" should be "open circles" and "squares" should be "filled circles" (see previous figures).  also, last two words should be "dashed lines", not "solid lines".
- [ ] **书页 431（PDF 445）**：page 431, caption of figure 8.14. "x_1,...x_N" and "y_1,...y_M" should be "x_1,...,x_N" and "y_1,...,y_M" (missing second commas).
- [ ] **书页 434（PDF 448）**：page 434, equation above example 8.6. bottom choice righthand side should be $|z|>\gamma$.
- [ ] **书页 439（PDF 453）**：page 439, equation (8.32). some i's and j's are wrong in the third and fourth inequalities.
- [ ] **书页 440（PDF 454）**：page 440, 3rd paragraph. "Similarly, there is ... path in H" should be "Similarly, there is ... path in V".

## Boyd凸优化_p455-474（书页 441-460，6 条）

- [ ] **书页 442（PDF 456）**：page 442, alignment constraints. $w_i$ and $w_j$ should be $h_i$ and $h_j$.
- [ ] **书页 442（PDF 456）**：page 442, end of paragraph on Similarity constraints. second occurence of "or height)" should be "(or height)" (missing left parenthesis).
- [ ] **书页 443（PDF 457）**：page 443, last equation has a few misplaced parentheses. $(x_j-(x_i+w_i)^2+d_v^2) \leq D^2_{ij}$ should be $(x_j-(x_i+w_i))^2+d_v^2 \leq D^2_{ij}$.
- [ ] **书页 444（PDF 458）**：page 444 figure 8.20 in caption. "figure 8.18" should be "figure 8.19".
- [ ] **书页 448（PDF 462）**：page 448, exercise 8.8.  Remove mention of alternatives to lighten problem.
- [ ] **书页 449（PDF 463）**：page 449, problem 8.11, 2nd paragraph. "a_1,...,a_m in R"

## Boyd凸优化_p475-494（书页 461-480，3 条）

- [ ] **书页 479（PDF 493）**：page 479, bottom of first paragraph in section 9.4.3. "see \S A.1.2" should be "see \S A.1.4".
- [ ] **书页 479（PDF 493）**：page 479, equation in step 1. pf example 9.2.  third term in denominator should be "gamma_i", not "gamma_k".
- [ ] **书页 479（PDF 493）**：page 479-480, convergence analysis. Some gamma's should be gamma tilde's.

## Boyd凸优化_p495-514（书页 481-500，3 条）

- [ ] **书页 481（PDF 495）**：page 481, line -10. "Figure 9.13 show" should be "Figure 9.13 shows."
- [ ] **书页 483（PDF 497）**：page 483, first line of the caption of figure 9.15. P_1 should be P_2.
- [ ] **书页 488（PDF 502）**：page 488, line -3. "x^k" should be "x^{(k)}".

## Boyd凸优化_p515-534（书页 501-520，6 条）

- [ ] **书页 504（PDF 518）**：page 504, second equation from bottom of page. \alpha \beta should be - \alpha \beta.
- [ ] **书页 511（PDF 525）**：page 511, example 9.9. "where \phi_i" should be "where \psi_i".
- [ ] **书页 515（PDF 529）**：page 515, exercise 9.7. "Let Delta_sd" should be "Let Delta_nsd".
- [ ] **书页 518（PDF 532）**：page 518, line -8: delete last ")".
- [ ] **书页 519（PDF 533）**：page 519, exercise 9.28, last line. "x^T Ai" should be "x^T Ai x".
- [ ] **书页 520（PDF 534）**：page 520, problem 9.32, 10th line from the bottom. missing x in the search direction \Delta_gn.

## Boyd凸优化_p535-554（书页 521-540，11 条）

- [ ] **书页 522（PDF 536）**：page 522, equation (10.3). "(1/2)x^TPx+..." should be "f(x)=(1/2)x^TPx+..."
- [ ] **书页 522（PDF 536）**：page 522, line -8. '... is unbounded below or infeasible'.
- [ ] **书页 523（PDF 537）**：page 523, second line above example 10.1. "=\tilde f(z^star)=" should be "=\nabla \tilde f(z^star)=".
- [ ] **书页 525（PDF 539）**：page 525, equation above (10.9). "-diag(1/x_1,...1/x_n)" should be "-(1/x_1,...1/x_n)".
- [ ] **书页 526（PDF 540）**：page 526, second paragraph. "section symbol 10.2' should read 'section symbol 10.1.1'
- [ ] **书页 529（PDF 543）**：page 529, line -7. "equality constrained constrained problems" should be "equality constrained problems."
- [ ] **书页 530（PDF 544）**：page 530, line -16. switch x^0 and z^0.
- [ ] **书页 530（PDF 544）**：page 530, line 9. f(Fx+hat x) should be f(Fz+hat x). Errata corrected in sixth printing (May 2008).
- [ ] **书页 530（PDF 544）**：page 530, middle. "nabla f(x)^2" should be "nabla^2 f(x)".
- [ ] **书页 537（PDF 551）**：page 537, line -3. ||r(y)||_2 should be ||r(y^(0))||_2.
- [ ] **书页 537（PDF 551）**：page 537, line 18. Replace "do not hold" with "may not hold".

## Boyd凸优化_p555-574（书页 541-560，6 条）

- [ ] **书页 541（PDF 555）**：page 541, line -14: replace `Dr = nabla f^{-1} is bounded' by `Dr = nabla f has bounded inverse'.
- [ ] **书页 543（PDF 557）**：page 543. at the end of the caption for Figure 10.1 there is an extra sentence fragment.
- [ ] **书页 553（PDF 567）**：page 553. the (N-1,N) block be inv(Q_{N-1})*A_{N-1}^T and the same for the (N,N-1) block, i.e., index of Q should be N-1 instead of N.
- [ ] **书页 555（PDF 569）**：page 555, line -3: replace (1/2)p^2n^2 by p^2n^2
- [ ] **书页 555（PDF 569）**：page 555, line -8: replace `two matrices in S^n' by `two matrices in\reals^{n\times n}'. Replace (1/2)p^2n^2 by p^2n^2.
- [ ] **书页 559（PDF 573）**：page 559, last line. "... problem described in exercise 4.60, without the constraint x >= 0".

## Boyd凸优化_p575-594（书页 561-580，2 条）

- [ ] **书页 572（PDF 586）**：page 572, line 9. insert "(factor of)" before \mu.
- [ ] **书页 578（PDF 592）**：page 578, 2nd to last equation. A\nu_nt should be A\Delta x_nt = 0.

## Boyd凸优化_p595-614（书页 581-600，5 条）

- [ ] **书页 595（PDF 609）**：page 595, below (11.36).  Missing section symbol in 11.5.4.
- [ ] **书页 597（PDF 611）**：page 597, equation in example 11.5. remove "diag".
- [ ] **书页 598（PDF 612）**：page 598, middle. Missing cones in subscript in definition of domain of $\phi$.
- [ ] **书页 600（PDF 614）**：page 600 line -4, second term on the left should be tr((-F(x))^{-1}Fi).
- [ ] **书页 600（PDF 614）**：page 600 line -6. righthand side should be tr((-F(x))^{-1}Fi).

## Boyd凸优化_p615-634（书页 601-620，3 条）

- [ ] **书页 610（PDF 624）**：page 610, last line before subsection. A(x+s\Delta x_pd) = 0 should be A(x+s\Delta x_pd) = b.
- [ ] **书页 614（PDF 628）**：page 614 second line of figure 11.21 caption. \eta should be \hat \eta
- [ ] **书页 620（PDF 634）**：page 620 4th equation and below. U is concave, so we need to minimize -tU+barrier, not tU+barrier. then, below, D_0 should be D_0=-diag().

## Boyd凸优化_p635-654（书页 621-640，5 条）

- [ ] **书页 624（PDF 638）**：page 624 bottom of exercise 11.5 "point point".
- [ ] **书页 625（PDF 639）**：page 625, exercise 11.9. Modified to remove reference to exercise 3.41.
- [ ] **书页 637（PDF 651）**：page 637, middle of page. "The dual of the l1 norm is the linfty norm" should be "The dual of the linfty norm is the l1 norm".
- [ ] **书页 637（PDF 651）**：page 637, second last paragraph under Dual Norm, "q = p/(1-p)" should be "q=p/(p-1)".
- [ ] **书页 640（PDF 654）**：page 640. re-arrange and re-phrase definition of derivative.

## Boyd凸优化_p655-674（书页 641-660，2 条）

- [ ] **书页 647（PDF 661）**：page 647, middle of page. remove "in" from "if $-A$ is in nonnegative definite". Errata corrected in seventh printing (July 2009).
- [ ] **书页 656（PDF 670）**：page 656, above second displayed equation: replace second Tr(AZ) with Tr(BZ).

## Boyd凸优化_p675-694（书页 661-680，2 条）

- [ ] **书页 671（PDF 685）**：page 671, first equation.  top right entry in right matrix, D^{-1/2}u^T, should be D^{-1/2}u.
- [ ] **书页 677（PDF 691）**：page 677, example C.3. "the product A_{11}^{-1}A_{21}" should be "the product A_{11}^{-1}A_{12}". Errata corrected in third printing (January 2006).

## Boyd凸优化_p695-714（书页 681-700，3 条）

- [ ] **书页 682（PDF 696）**：page 682, last line. "The factors Q and R are usually dense" should be "The factor Q is usually dense".
- [ ] **书页 685（PDF 699）**：pages 685-696. Miscellaneous minor corrections and updates to the references. Errata corrected in second printing (September 2004).
- [ ] **书页 692（PDF 706）**：page 692 [MZ89]: replace Zafirou by Zafiriou.
