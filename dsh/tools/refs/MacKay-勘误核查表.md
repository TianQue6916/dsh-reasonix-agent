# MacKay 官方勘误 × 我们 32 块译文 核查表（**v2 · 页码口径已修正**）

> 来源：`https://www.inference.org.uk/itprnn/corrections.txt`（作者本人维护，2026-10-29 curl 实测 200 / 28,348 B / 859 行）
> **共 194 条带页码勘误**，覆盖 32 块中的 **32 块**。

## ★★★ 页码口径（v1 在这里搞错了，v2 修正）

| 口径 | 含义 |
|---|---|
| corrections.txt 的 `p.N` | **书内印刷页码**（正文 p.1 = 第 1 章首页） |
| 我们 md 的 `<!-- ===== pNNN ===== -->` | **PDF 页码** |
| **换算** | **PDF 页 = 书内页 + 12**（前面 12 页是封面/序/目录） |

⇒ 本表每条都给出 **书内页 → PDF 页** 两个号，**按 PDF 页归块**。
**v1 的错**：直接把书内页当成块号，导致 `p.129 / p.138` 这类条目被塞进了 `p121-140` 块（它们实际在 PDF p141 / p150，属 `p141-160` 块）。
同项目 worker `f22429df` 发现并纠正。

## 用法
1. 打开对应块的 `.bilingual.md`，定位 `<!-- ===== pNNN ===== -->`（**PDF 号**）
2. 按勘误检查译文有没有跟着错
3. 复现了原书错 → 修正 + 加 `> **[勘误]** 原书此处有误：<原文> → <勘误>（MacKay 官方 corrections.txt）`
4. 译文本来就对 → 也加一行说明，避免后人再查


## MacKay信息论_p001-020（PDF 页；= 书内 p-11-8，3 条）

- [ ] **书内 p.1 → PDF p.13**：:  It's often suggested that 'x! \simeq x^x e^{-x}' is an error, as the factor of sqrt{2 pi x} (in eq 1.11) is missing.
- [ ] **书内 p.3 → PDF p.15**：Replace mmm by mm in section heading 1.1.
- [ ] **书内 p.3 → PDF p.15**：VERY EMBARRASSING:  The word "communication" got cut from the first line of the book. Shannon's quote should read:

## MacKay信息论_p021-040（PDF 页；= 书内 p9-28，1 条）

- [ ] **书内 p.26 → PDF p.38**：The presentation of the Cox axioms on page 26 is not entirely correct.   Axiom 1 postulates that degrees of belief can be ordered; I state that this implies that beliefs can be mapped onto real numbers.  Unfortunately this is not entirely valid, as all linear orderings cannot be mapped onto real numbers. (credit:  Kerkko Luosto and Antti Honkela)

## MacKay信息论_p041-060（PDF 页；= 书内 p29-48，11 条）

- [ ] **书内 p.29 → PDF p.41**：probablities -> probabilities
- [ ] **书内 p.30 → PDF p.42**：before Ex 2.8 replace < by \leq so it reads: $P(v) \leq 1$ for any interval $(a,b)$.
- [ ] **书内 p.33 → PDF p.45**：eq 2.36: replace 1/|X| by 1/|A_X|
- [ ] **书内 p.34 → PDF p.46**：line 11   regretably -> regrettably
- [ ] **书内 p.36 → PDF p.48**：Ex 2.17:  "what is b as a function of p?" should be "what is p as a function of b?"
- [ ] **书内 p.37 → PDF p.49**：ex 2.25: replace |X| by |A_X| three times
- [ ] **书内 p.38 → PDF p.50**：line 6    Change "results" to "is obtained".
- [ ] **书内 p.42 → PDF p.54**：: soln to ex 2.17 (eq 2.68) Replace "a" by "b".
- [ ] **书内 p.42 → PDF p.54**：After (2.67) replace (2.63-2.63) by (2.63-2.65).
- [ ] **书内 p.46 → PDF p.58**：occuring -> occurring
- [ ] **书内 p.48 → PDF p.60**：contructing -> constructing

## MacKay信息论_p061-080（PDF 页；= 书内 p49-68，9 条）

- [ ] **书内 p.49 → PDF p.61**：Add labels $x$ and $\lambda$ respectively to the first two figures' horizontal axes.
- [ ] **书内 p.49 → PDF p.61**：The 3 graphs in Figure 3.1 are incorrect. The correct figure (which doesn't look very different qualitatively) can be found here: http://www.inference.phy.cam.ac.uk/mackay/itila/errata/decay.like.1C.ps http://www.inference.phy.cam.ac.uk/mackay/itila/errata/decay.like.1C.png
- [ ] **书内 p.50 → PDF p.62**：reproduceable -> reproducible
- [ ] **书内 p.52 → PDF p.64**：Middle of page Replace "that next toss is a" by "that the next toss is an".
- [ ] **书内 p.53 → PDF p.65**：: Five lines from bottom of page: It depends what $p_{0}$ is. should read It depends what $p_{a}$ is.
- [ ] **书内 p.56 → PDF p.68**：To be more precise, "But does the fact that type O blood was detected at the scene favour the hypothesis that Oliver was present?" could be tweaked to "But do the data (type O and type AB blood detected at the scene) favour the hypothesis that Oliver was present?"
- [ ] **书内 p.61 → PDF p.73**："There is a general rule which helps immensely in confusing probability problems" is poor and confusing English! As a quick fix, add a comma thus: "There is a general rule which helps immensely, in confusing probability problems"
- [ ] **书内 p.61 → PDF p.73**：,  and numerous other pages: occured -> occurred; occuring -> occurring
- [ ] **书内 p.66 → PDF p.78**：pp.37-36 should read pp. 36-37

## MacKay信息论_p081-100（PDF 页；= 书内 p69-88，5 条）

- [ ] **书内 p.69 → PDF p.81**：Figure 4.2, on the right hand side after you weigh 1/7, the boxes containing "8-" and "*" should be swapped so that "*" is the middle outcome. And after you weigh 7/1, the boxes containing "8+" and "*" should be swapped so that "*" is the middle outcome.
- [ ] **书内 p.80 → PDF p.92**：eq 4.28. Second "approx equal" should be "equal"
- [ ] **书内 p.82 → PDF p.94**：Before eq 4.36:  Replace 'that T_Nb contains' by 'contained by T_Nb'.
- [ ] **书内 p.86 → PDF p.98**：Curiousities -> curiosities
- [ ] **书内 p.87 → PDF p.99**：Fig 4.14 Caption "1, 2, 100" should read "1, 2, 1000".

## MacKay信息论_p101-120（PDF 页；= 书内 p89-108，3 条）

- [ ] **书内 p.92 → PDF p.104**：line 5  punctutation -> punctuation
- [ ] **书内 p.97 → PDF p.109**：end of sec 5.2 inquality -> inequality
- [ ] **书内 p.103 → PDF p.115**：Ex 5.27. Line 1. Delete the word "binary".

## MacKay信息论_p121-140（PDF 页；= 书内 p109-128，5 条）

- [ ] **书内 p.116 → PDF p.128**：: line 7:   corresponds  ->   correspond
- [ ] **书内 p.117 → PDF p.129**：after eq (6.10) replace "and" by "and define"
- [ ] **书内 p.117 → PDF p.129**：left hand side of eqs 6.11 and 6.12, $a$ should read $\tt a$; subscript P_L in 6.12 should be P_D
- [ ] **书内 p.123 → PDF p.135**："the next few chapters" -> "Part II"
- [ ] **书内 p.125 → PDF p.137**：last line probabilties -> probabilities

## MacKay信息论_p141-160（PDF 页；= 书内 p129-148，2 条）

- [ ] **书内 p.129 → PDF p.141**：center of page: probablity -> probability
- [ ] **书内 p.138 → PDF p.150**：Chapter 8, "Correlated Random Variables", should have been called "Dependent Random Variables", and the word "correlated" should be "dependent" throughout that chapter.

## MacKay信息论_p161-180（PDF 页；= 书内 p149-168，9 条）

- [ ] **书内 p.152 → PDF p.164**：In theorem (part one): insert space between `,' and `there'.
- [ ] **书内 p.159 → PDF p.171**：Cut the final two sentences of the Z-channel answer, from "Thus starting from..." to "...-1/2)." [They are incorrect.]
- [ ] **书内 p.159 → PDF p.171**：Eq 9.51: log should be ln (twice).
- [ ] **书内 p.159 → PDF p.171**：Line 1, the exercise reference "p.153" should say "p.154"
- [ ] **书内 p.160 → PDF p.172**：Eq 9.54: A^q should be A^S in denominator.
- [ ] **书内 p.161 → PDF p.173**：Line 2, the exercise reference "p.153" should say "p.154"  [Note to DJCM - Latex bug?]
- [ ] **书内 p.166 → PDF p.178**：After eq 10.17:  P_ERR should be P_TOT.
- [ ] **书内 p.168 → PDF p.180**：add label $R$ to x-axis.
- [ ] **书内 p.168 → PDF p.180**：hypthenate " rate-R' " after Asymptotically.

## MacKay信息论_p181-200（PDF 页；= 书内 p169-188，8 条）

- [ ] **书内 p.170 → PDF p.182**：Lines 3 and 8:  I(X,Y) should be I(X;Y)
- [ ] **书内 p.171 → PDF p.183**：Fig 10.8 caption missing "."
- [ ] **书内 p.174 → PDF p.186**：Fig 10.9 overhangs the right margin. The label $p_1$ is missing.
- [ ] **书内 p.174 → PDF p.186**：eq 10.28:  insert "partial" operator before each p_i on left hand side.
- [ ] **书内 p.178 → PDF p.190**：End of 2nd paragraph: separated by LESS THAN the Nyquist interval
- [ ] **书内 p.182 → PDF p.194**：Fig 11.5 axis is dotty.
- [ ] **书内 p.182 → PDF p.194**：eq (11.33) replace M by S.
- [ ] **书内 p.188 → PDF p.200**：Downgrade the rating of ex 11.7 from [5] to [4].

## MacKay信息论_p201-220（PDF 页；= 书内 p189-208，8 条）

- [ ] **书内 p.189 → PDF p.201**：eq (11.40): the -1/2 on the RHS of eq (11.40) should be replaced by -1/2 ln[2 \pi e] or "-1/2 - 1/2 ln(2 \pi)"
- [ ] **书内 p.190 → PDF p.202**：Add rating "2" to ex. 11.10.
- [ ] **书内 p.190 → PDF p.202**：Eq 11.46.  Replace C'' by C'.
- [ ] **书内 p.190 → PDF p.202**：Following line:  insert minus sign before (y-x)^2.
- [ ] **书内 p.202 → PDF p.214**：A reader writes "On p 202 you claim that equation 12.6 is "exactly" right.  I think it's only approximately right as this is based on the assumption that pairs are independent.  This independence assumption is a reasonable approximation for low probability of collision events - at higher probability events like triangles are more likely eg A=B and B=C => A=C, which breaks independence."
- [ ] **书内 p.206 → PDF p.218**：Example 13.1 line 2.	minimum -> maximum
- [ ] **书内 p.206 → PDF p.218**：I used the word "minimum" when I should have used "maximum" in six bizarre and embarrassing places in this chapter!
- [ ] **书内 p.206 → PDF p.218**：Sec 13.2 line 1.		minimum -> maximum

## MacKay信息论_p221-240（PDF 页；= 书内 p209-228，10 条）

- [ ] **书内 p.210 → PDF p.222**：Sec 13.4 line 6: typically by -> typically be
- [ ] **书内 p.212 → PDF p.224**：Second Definition, line 1.	 minimum -> maximum
- [ ] **书内 p.212 → PDF p.224**：fig 13.9 Caption: Three times!	 minimum -> maximum
- [ ] **书内 p.214 → PDF p.226**：Realign figures with right margin.
- [ ] **书内 p.214 → PDF p.226**：Table should read p_b = \frac{3}{N} {{N} \choose {2}} f^2 : probability of bit error to leading order (not block error)
- [ ] **书内 p.215 → PDF p.227**：Sec 13.8, last paragraph, line 2: must at least than -> must be at least
- [ ] **书内 p.218 → PDF p.230**：7 lines from bottom: insert "the" before "overlap".
- [ ] **书内 p.221 → PDF p.233**：Realign fig 13.17 vertically.
- [ ] **书内 p.223 → PDF p.235**：Soln to ex 13.4. should read: The  probability of block error to leading order is $p_{\rm B} =  {{N} \choose {2}} f^2$. The  probability of bit error to leading order is $p_{\rm b} = \frac{3}{N} {{N} \choose {2}} f^2$.
- [ ] **书内 p.226 → PDF p.238**：line 2. coresponding	-> corresponding

## MacKay信息论_p241-260（PDF 页；= 书内 p229-248，7 条）

- [ ] **书内 p.231 → PDF p.243**：eq (14.12)  The "=" should be "<="
- [ ] **书内 p.237 → PDF p.249**：Fig 15.2 Caption, "correlated sources" -> "dependent sources"
- [ ] **书内 p.244 → PDF p.256**：sec 16.2 line 3 of point "2." the the -> the
- [ ] **书内 p.245 → PDF p.257**：, 4th line from the last, "edge H-K" should be "edge I-K".
- [ ] **书内 p.245 → PDF p.257**：sec 16.3 Delete "." after algorithm
- [ ] **书内 p.246 → PDF p.258**：, end of sec 16.4. large subset variables -> large subset of variables
- [ ] **书内 p.248 → PDF p.260**：orientiation -> orientation

## MacKay信息论_p261-280（PDF 页；= 书内 p249-268，13 条）

- [ ] **书内 p.257 → PDF p.269**：line 13: change  kT  to  -kT
- [ ] **书内 p.257 → PDF p.269**：line 16: replace "trellis section" by "connection matrix".
- [ ] **书内 p.257 → PDF p.269**：line 2 from bottom:  insert "be" before "encoded".
- [ ] **书内 p.260 → PDF p.272**：Crossword A line 3: BORB should read SORB. Line 12, YEA should read TEA.
- [ ] **书内 p.260 → PDF p.272**：Delete "the" in the phrase: in the `word
- [ ] **书内 p.261 → PDF p.273**：Before eqn 18.4, insert "approximately"
- [ ] **书内 p.261 → PDF p.273**：I might add the following cautionary comment to this calculation:
- [ ] **书内 p.261 → PDF p.273**：Second to last paragraph: replace "previous page" by "table 18.2".
- [ ] **书内 p.261 → PDF p.273**：`previous page' should read `table 18.2'
- [ ] **书内 p.261 → PDF p.273**：eqn 18.5   Delete   \log \beta^{f_w S} |T|  at end of r.h.s.
- [ ] **书内 p.261 → PDF p.273**：eqns 18.5,6   Replace subscripts l by 1 in f_l, twice.
- [ ] **书内 p.261 → PDF p.273**：eqns 18.6,7   Replace H_w by H_W
- [ ] **书内 p.261 → PDF p.273**：line 12. Cut the word "these"

## MacKay信息论_p281-300（PDF 页；= 书内 p269-288，7 条）

- [ ] **书内 p.269 → PDF p.281**：octupuses -> octopuses
- [ ] **书内 p.276 → PDF p.288**：para 2. mutuation -> mutation
- [ ] **书内 p.278 → PDF p.290**：Fig 19.5 caption: final sentence should read: "Vertical axes show the fitnesses of the two sub-populations, and the percentage of the population that is parthenogenetic."
- [ ] **书内 p.278 → PDF p.290**：line 7-8 parthonegens -> parthenogens
- [ ] **书内 p.279 → PDF p.291**：line 12. Insert "a"    before "highly".
- [ ] **书内 p.280 → PDF p.292**：line 11, replace "." by "?"
- [ ] **书内 p.286 → PDF p.298**：Line 8: r_nk should be r_k^{(n)}.

## MacKay信息论_p301-320（PDF 页；= 书内 p289-308，6 条）

- [ ] **书内 p.297 → PDF p.309**：Figure 21.5 caption: Replace S^2 by S.
- [ ] **书内 p.301 → PDF p.313**：Fig 22.1 Caption. Add, at end of (c): "(shown as a density over $\ln \sigma$)"
- [ ] **书内 p.301 → PDF p.313**：Figure 22.1 caption: Replace S^2 by S.
- [ ] **书内 p.301 → PDF p.313**：Insert minus sign thus after eq 22.7: which is $-1/\sigma^2_{\mu}$,
- [ ] **书内 p.303 → PDF p.315**：Line after the data figure, delete the symbol "L"
- [ ] **书内 p.304 → PDF p.316**：Eq 22.25  Both k in denominator should be k'

## MacKay信息论_p321-340（PDF 页；= 书内 p309-328，10 条）

- [ ] **书内 p.311 → PDF p.323**：Chapter 23: all occurrences of log should be changed to ln (natural log)
- [ ] **书内 p.315 → PDF p.327**：Eq 23.25. Insert (1/Z) into right hand side.
- [ ] **书内 p.315 → PDF p.327**：Figure 23.5 caption has x where it should say v: "and shown as a function of $v$ on the left and $l = \ln v$ on the right."
- [ ] **书内 p.316 → PDF p.328**：Eq 23.27: sigma should be sigma^2.
- [ ] **书内 p.318 → PDF p.330**：. Entropic distribution (23.35) is wrong, it's missing the measure. Replace eq (23.35) by:
- [ ] **书内 p.319 → PDF p.331**：Line 7 from bottom. \sigma_{\mu} should be \sigma_{\mu}^2.
- [ ] **书内 p.321 → PDF p.333**：Fig 24.1 Caption. Add, at end of (c): "(shown as a density over $\ln \sigma$)"
- [ ] **书内 p.321 → PDF p.333**：Figure 24.1 caption: Replace S^2 by S.
- [ ] **书内 p.326 → PDF p.338**：, third line from the bottom, defining a trellis: "The leftmost and rightmost states contain only one node." should read "The leftmost and rightmost times contain only one node."
- [ ] **书内 p.326 → PDF p.338**：eq 25.9 Replace =1 by =0

## MacKay信息论_p341-360（PDF 页；= 书内 p329-348，9 条）

- [ ] **书内 p.330 → PDF p.342**：First Line after Ex 25.5: replace alpha_i by alpha_I. Last line of Ex 25.7: delete the symbol $n$ after "subsequent".
- [ ] **书内 p.333 → PDF p.345**：In the solution to ex. 25.9, second line from bottom, the bitwise posterior probabilities are all listed as P(t_1 | {\bf{y}}).  It should read t_1, t_2, and t_3.
- [ ] **书内 p.335 → PDF p.347**：Fig 26.1 caption -  Replace g(x) by P^*(x)
- [ ] **书内 p.335 → PDF p.347**：The square boxes in the figure 26.1 have come out broken.
- [ ] **书内 p.335 → PDF p.347**：Too much space between x_n and '
- [ ] **书内 p.337 → PDF p.349**：Fig 26.4 caption -  Replace g(x) by P^*(x)
- [ ] **书内 p.337 → PDF p.349**：The square boxes in the figure 26.4 have come out broken.
- [ ] **书内 p.340 → PDF p.352**：line 2.     and replaced by -> are replaced by
- [ ] **书内 p.343 → PDF p.355**：artifical -> artificial

## MacKay信息论_p361-380（PDF 页；= 书内 p349-368，2 条）

- [ ] **书内 p.355 → PDF p.367**：Line 2: "then" should be "than".
- [ ] **书内 p.360 → PDF p.372**：line 3 replace "can can" by "can"

## MacKay信息论_p381-400（PDF 页；= 书内 p369-388，8 条）

- [ ] **书内 p.371 → PDF p.383**：Replace "Because Gibbs sampling is a Metropolis method," by "Because Gibbs sampling is composed of updates that are Metropolis methods,"
- [ ] **书内 p.375 → PDF p.387**：In steps 3d and 3e replace u by u'
- [ ] **书内 p.377 → PDF p.389**：End of middle line: (top line of para 4) add "the" after "help of"
- [ ] **书内 p.378 → PDF p.390**：Ex 29.11, 5th line: replace P*(X) by P*(X')
- [ ] **书内 p.378 → PDF p.390**：Second algorithm, line "2f:" replace P*(X) by P*(X')
- [ ] **书内 p.378 → PDF p.390**：Top algorithm, line "7:" replace P*(X) by P*(X')
- [ ] **书内 p.383 → PDF p.395**：Ex 29.16, line 12. Replace refeq.assignII by 22.22; and responsiblities -> responsibilities
- [ ] **书内 p.385 → PDF p.397**：End of soln of ex 29.2.	   other mode ->   other modes

## MacKay信息论_p401-420（PDF 页；= 书内 p389-408，2 条）

- [ ] **书内 p.407 → PDF p.419**：: just after eq 31.25, "Let" should be "let".
- [ ] **书内 p.408 → PDF p.420**：Fig 31.12  - grey fuzziness has appeared around the black dots.

## MacKay信息论_p421-440（PDF 页；= 书内 p409-428，6 条）

- [ ] **书内 p.412 → PDF p.424**：line 3:	One could a more accurate comparison should be One could make a more accurate comparison
- [ ] **书内 p.412 → PDF p.424**：partitition -> partition
- [ ] **书内 p.418 → PDF p.430**：Algorithm 32.4. Line 3. Insert factor of 2 before a_i.
- [ ] **书内 p.418 → PDF p.430**：Top paragraph. Replace 32.3b by 32.3a; 	32.3(c,d) by 32.3(b,c); (c) by (b);	and (d) by (c).
- [ ] **书内 p.419 → PDF p.431**：line 1. Insert "of" after "idea".
- [ ] **书内 p.421 → PDF p.433**：The second sentence of section 32.5 is easy to misread. Better: "We can prove this using the example of..."

## MacKay信息论_p441-460（PDF 页；= 书内 p429-448，6 条）

- [ ] **书内 p.430 → PDF p.442**：Equation (33.43) could be improved. Replace Q_sigma(sigma) by Q_sigma(beta) (twice in eq 33.43), and add to the text: "We represent Q_sigma(sigma) using the density over beta=1/sigma^2, Q_sigma(beta) \equiv Q_sigma(sigma) |d sigma/d beta|."
- [ ] **书内 p.430 → PDF p.442**：Subsection "Optimization of Q_sigma(sigma)": I messed up the correction to the first printing! The first line should read "We represent Q_sigma(sigma) using the density over beta, Q_sigma(beta) \equiv Q_sigma(sigma) |d sigma/d beta|." [Delete \propto 1/\beta at end of first line.]
- [ ] **书内 p.430 → PDF p.442**：line 2. denotes-> denote
- [ ] **书内 p.436 → PDF p.448**：Equation	(33.61): add parentheses around the second two fractions on the right hand side.
- [ ] **书内 p.441 → PDF p.453**：Change i to i' in the suffix of w_i on the right hand side of eqn (34.20).
- [ ] **书内 p.447 → PDF p.459**：Sec 35.3 Line 6.  of the others ->  of the other

## MacKay信息论_p461-480（PDF 页；= 书内 p449-468，8 条）

- [ ] **书内 p.449 → PDF p.461**：before eq 35.9: unbiased estimator should read $\hat{a} = (\bar{n}/N) / \log N$.
- [ ] **书内 p.453 → PDF p.465**：Add {$\sigma_n$} label to vertical axis fig 36.1. Add words "Contour plot of " to figure caption.
- [ ] **书内 p.453 → PDF p.465**：line 2  descision -> decision
- [ ] **书内 p.454 → PDF p.466**："Allias paradox" should be "Allais paradox" (also in the index)
- [ ] **书内 p.454 → PDF p.466**：Insert `large' before queue
- [ ] **书内 p.454 → PDF p.466**：Replace `people' by `anyone'
- [ ] **书内 p.455 → PDF p.467**：Delete word `made' in `having not chosen the most desirable'.
- [ ] **书内 p.463 → PDF p.475**：Cut the word "probability" before two-tailed

## MacKay信息论_p481-500（PDF 页；= 书内 p469-488，3 条）

- [ ] **书内 p.484 → PDF p.496**：: Def 40.1 reads "A set of points...are in general position..." But "are" should read "is" (set being singular).
- [ ] **书内 p.484 → PDF p.496**：Definition 40.1 (General position) The definition given is insufficient. An extra constraint is needed, namely - and no $K+1$ of them lie in a $(K-1)$-dimensional plane.
- [ ] **书内 p.486 → PDF p.498**：penultimate line:   exisiting -> existing

## MacKay信息论_p501-520（PDF 页；= 书内 p489-508，2 条）

- [ ] **书内 p.493 → PDF p.505**：after eq 41.11  probabillity -> probability
- [ ] **书内 p.500 → PDF p.512**：fig 41.9 caption  evalutations -> evaluations

## MacKay信息论_p521-540（PDF 页；= 书内 p509-528，4 条）

- [ ] **书内 p.512 → PDF p.524**：After ex 42.6. Lyapunov functions -> Lyapunov function
- [ ] **书内 p.518 → PDF p.530**：fig 42.11 caption line 2	continous -> continuous
- [ ] **书内 p.522 → PDF p.534**：Before eq 43.3: Replace subscripts "n" by "i". Add a reference to equation (42.3) for the definition of the activation. Eq 43.3: add subscript "i" to "a".
- [ ] **书内 p.528 → PDF p.540**：Last para of sec 44.1, line 1 - 44.3 should read 44.4

## MacKay信息论_p541-560（PDF 页；= 书内 p529-548，6 条）

- [ ] **书内 p.529 → PDF p.541**：line 11:  delete "reading aloud". Add entry to index: "reading aloud, p.529".
- [ ] **书内 p.533 → PDF p.545**：: equation 44.12 right hand side has a sign error. P(t)/P(t|y) should be P(t|y)/P(t)
- [ ] **书内 p.534 → PDF p.546**：: ex 45.1  "There's" should be "There are".
- [ ] **书内 p.538 → PDF p.550**：-9  Figures 44.2 and 44.3 occur in the wrong order.
- [ ] **书内 p.538 → PDF p.550**：: Just after Eqn (45.9) "discontinuities in its second derivative" should be "discontinuities in the third derivative".
- [ ] **书内 p.548 → PDF p.560**：comparision -> comparison

## MacKay信息论_p561-580（PDF 页；= 书内 p549-568，4 条）

- [ ] **书内 p.554 → PDF p.566**：Replace (Ratliff and L.A., 1950) by (Ratliff and Riggs, 1950)
- [ ] **书内 p.562 → PDF p.574**：: line 13: 120t/R should be 120j/R.
- [ ] **书内 p.566 → PDF p.578**：Line 3 overhangs right margin.
- [ ] **书内 p.567 → PDF p.579**：It's been pointed out that the discussion of GF(4) and GF(8) and clumped bits should be clearer.  If I clump the bits in threes, I work in GF(8). If I clump them in twos, I work in GF(4).

## MacKay信息论_p581-600（PDF 页；= 书内 p569-588，7 条）

- [ ] **书内 p.574 → PDF p.586**：, 6th line from the bottom: indicate -> indicates
- [ ] **书内 p.576 → PDF p.588**：Middle of page, after (48.1) replace "whereas is" by                "whereas in"
- [ ] **书内 p.581 → PDF p.593**："... tweaking of turbo codes is a black art, and it never succeeds in totalling eliminating low-weight...". "totalling" should be "totally".
- [ ] **书内 p.581 → PDF p.593**：, end of section 48.4, final sentence: add "as long as their number of weight-2 columns is not too large (cf. exercise 47.3, p.572)."
- [ ] **书内 p.583 → PDF p.595**：, bottom paragraph. Where it says "Figure 49.3", it should be "Figure 49.2".
- [ ] **书内 p.583 → PDF p.595**：sec 49.3: multipled -> multiplied
- [ ] **书内 p.584 → PDF p.596**：last line: diagramatic -> diagrammatic

## MacKay信息论_p601-620（PDF 页；= 书内 p589-608，4 条）

- [ ] **书内 p.592 → PDF p.604**：Ex 50.2. Add parentheses around "K-t" in line 7.
- [ ] **书内 p.595 → PDF p.607**：Upgrade difficulty of ex 50.12 from 3C to 4C.
- [ ] **书内 p.598 → PDF p.610**：-9 bottom of page, all "log" should be "ln". (Eq A.3, A.4)
- [ ] **书内 p.602 → PDF p.614**：: Just after (B.5), a sentence begins "if", rather than "If".

## MacKay信息论_p621-640（PDF 页；= 书内 p609-628，6 条）

- [ ] **书内 p.610 → PDF p.622**：: Eqn (C.22) Left hand side of 2nd line, lambda^(b) should read \lambda^{(b)}(0).
- [ ] **书内 p.614 → PDF p.626**：Childs et al reference: Add volume 63: 036113
- [ ] **书内 p.615 → PDF p.627**：Harvey and Neal reference: remove spurious "/"
- [ ] **书内 p.618 → PDF p.630**：Rasmussen refs: (2000) eds: S.A. Solla and T.K. Leen and K.-R. M\"uller (2003)  editor={Suzanna Becker and Sebastian Thrun and Klaus Obermayer}
- [ ] **书内 p.618 → PDF p.630**：Ratliff reference details incorrect - should read: Ratliff, F. and Riggs, L. A.
- [ ] **书内 p.618 → PDF p.630**：Ratzer, E. A., and MacKay, D. J. C.    (missing initial)
