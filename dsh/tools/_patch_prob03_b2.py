import io

P = r'C:/Users/27063/Documents/修复产出/prob_chunk03_p101-150.bilingual.md'
lines = io.open(P, encoding='utf-8', newline='').read().split('\r\n')

S = '<span style="color:#2471a3;">**[problem]**</span>'
T = '<span style="color:#c0392b;">'

patches = [
(1808, T + '**Problem 20.**</span>',
 S + ' ' + T + '**Problem 20.**</span> 作为一项广告活动，一家巧克力工厂在部分巧克力棒中放入金券（golden ticket），并承诺：持金券可参观巧克力工厂，且终生免费吃巧克力。若找到金券的概率为 $p$，求为找到一张金券而需要吃掉的巧克力棒数目的均值与方差。'),

(1812, T + '**Problem 21.**</span>',
 S + ' ' + T + '**Problem 21.**</span> *圣彼得堡悖论（St. Petersburg paradox）。* 你独立地抛一枚均匀硬币，数到第一次出现反面为止的抛掷次数。若该次数为 $n$，你得到 $2^n$ 美元。你所得金额的期望是多少？你愿意付多少钱来玩这个游戏？'),

(1816, T + '**Problem 22.**</span>',
 S + ' ' + T + '**Problem 22.**</span> 同时抛两枚硬币，直到其中一枚正面朝上、另一枚反面朝上为止。第一枚硬币正面朝上的概率为 $p$，第二枚为 $q$。假设所有抛掷相互独立。'),

(1818, '(a) Find the PMF, the expected value',
 '(a) 求抛掷次数的 PMF、期望值与方差。'),

(1820, '(b) What is the probability that the last toss',
 '(b) 第一枚硬币最后一次抛掷结果为正面朝上的概率是多少？'),

(1826, '(a) A fair coin is tossed repeatedly',
 '(a) 反复独立地抛一枚均匀硬币，直到出现连续两个正面或连续两个反面为止。求抛掷次数的 PMF、期望值与方差。'),

(1828, '(b) Assume now that the coin is tossed',
 '(b) 现在假设一直抛硬币，直到出现「紧接在一个正面之后的反面」为止。求抛掷次数的 PMF 与期望值。'),

(1831, '## <span style="color:#c0392b;">2.5 Joint PMFs',
 '## <span style="color:#c0392b;">2.5 Joint PMFs of Multiple Random Variables（多个随机变量的联合 PMF）</span>'),

(1833, S + ' ' + T + 'Problem 24.</span>',
 S + ' ' + T + 'Problem 24.</span> 一位股市交易者买入 100 股股票 A 与 200 股股票 B。设 $X$ 与 $Y$ 分别为 A 与 B 在某段时间内的价格变化量，并假设 $X$ 与 $Y$ 的联合 PMF 在满足下式的整点 $(x, y)$ 上均匀分布，'),

(1839, '(a) Find the marginal PMFs and the means',
 '(a) 求 $X$ 与 $Y$ 的边际 PMF 与均值。'),

(1840, "(b) Find the mean of the trader's profit.",
 '(b) 求这位交易者利润的均值。'),

(1842, S + ' ' + T + 'Problem 25.</span>',
 S + ' ' + T + 'Problem 25.</span> 一个 $n$ 名学生的班级参加一场含 $m$ 道题的测验。设学生 $i$ 提交了前 $m_i$ 道题的答案。'),

(1844, '(a) The grader randomly picks one answer',
 '(a) 评分者随机抽取一份答案，记为 $(I, J)$，其中 $I$ 是学生学号（取值 $1, \\dots, n$），$J$ 是题号（取值 $1, \\dots, m$）。假设所有答案被抽到的可能性相同。求 $I$ 与 $J$ 的联合 PMF 与边际 PMF。'),

(1845, '(b) Assume that an answer to question $j$',
 '(b) 假设第 $j$ 题由学生 $i$ 提交的答案正确的概率为 $p_{ij}$。每份答案正确得 $a$ 分、否则得 $b$ 分。求学生 $i$ 得分的期望值。'),

(1847, S + ' ' + T + 'Problem 26.</span>',
 S + ' ' + T + 'Problem 26.</span> 多个随机变量最小值的 PMF。某天你的高尔夫成绩以概率 0.1 取 101 到 110 之间的每个值，各天之间相互独立。为提高成绩，你决定在不同的三天各打一场，并把这三天的成绩 $X_1$、$X_2$、$X_3$ 中的最小值 $X$ 作为自己的成绩。'),

(1849, '(a) Calculate the PMF of $X$.',
 '(a) 计算 $X$ 的 PMF。'),

(1850, '(b) By how much has your expected score improved',
 '(b) 由于打了三天，你的期望成绩改善了多少？'),

(1852, S + ' ' + T + 'Problem 27. ...</span>',
 S + ' ' + T + 'Problem 27. ...</span> 多项分布（The multinomial distribution）。一颗有 $r$ 个面、编号 $1, \\dots, r$ 的骰子被投掷固定的 $n$ 次。任一次投掷出现第 $i$ 面的概率记为 $p_i$，并假设各次投掷的结果相互独立。设 $X_i$ 为第 $i$ 面出现的次数。'),

(1854, '(a) Find the joint PMF $p_{X_1',
 '(a) 求联合 PMF $p_{X_1, \\dots, X_r}(k_1, \\dots, k_r)$。'),

(1855, '(b) Find the expected value and variance of $X_i$.',
 '(b) 求 $X_i$ 的期望值与方差。'),

(1856, '(c) Find $E[X_i X_j]$ for',
 '(c) 对 $i \\ne j$ 求 $E[X_i X_j]$。'),

(1858, T + 'Solution.</span> (a) The probability of a sequence',
 T + 'Solution.</span> (a) 对于满足「第 $i$ 面出现 $k_i$ 次（$i = 1, \\dots, r$）」的一列投掷结果，其概率为 $p_1^{k_1} \\cdots p_r^{k_r}$。每一个这样的结果都把 $n$ 次投掷的集合划分成 $r$ 个子集，其中第 $i$ 个子集的大小为 $k_i$（该子集就是第 $i$ 面出现的那批投掷 <span style="color:#7f8c8d;">[OCR 残缺]</span>'),

(1861, '## <span style="color:#c0392b;">Solution (continued)</span>',
 '## <span style="color:#c0392b;">Solution (continued)（解答，续）</span>'),

(1863, 'for which the $i$th face came up)',
 '）。这类划分的个数就是多项系数（multinomial coefficient，cf. 第 1.6 节）'),

(1869, 'Thus, if $k_1 + \\cdots + k_r = n$',
 '因此，当 $k_1 + \\cdots + k_r = n$ 时'),

(1875, 'and otherwise, $P_{X_1',
 '否则 $P_{X_1, \\ldots, X_r}(k_1, \\ldots, k_r) = 0$。'),

(1877, '**(b)** The random variable $X_1$ is binomial',
 '**(b)** 随机变量 $X_1$ 是参数为 $n$ 与 $p_1$ 的二项随机变量。因此 $E[X_1] = n p_1$，且 $\\operatorname{var}(X_1) = n p_1 (1 - p_1)$。'),

(1879, '**(c)** Suppose that $i \\neq j$',
 '**(c)** 设 $i \\neq j$，令 $Y_{i,k}$（或 $Y_{j,k}$）为「第 $k$ 次投掷出现第 $i$ 面（相应地第 $j$ 面）时取 $1$、否则取 $0$」的伯努利（Bernoulli）随机变量。注意 $Y_{i,k} Y_{j,k} = 0$，且当 $l \\neq k$ 时 $Y_{i,k}$ 与 $Y_{j,l}$ 独立，故 $E[Y_{i,k} Y_{j,l}] = p_i p_j$。因此'),

(1887, '## <span style="color:#2471a3;">**[problem]**</span> <span style="color:#c0392b;">Problem 28.</span> * The quiz problem.',
 '## <span style="color:#2471a3;">**[problem]**</span> <span style="color:#c0392b;">Problem 28.</span> *问答问题（The quiz problem）。*'),

(1889, 'Consider a quiz contest where a person is given',
 '考虑一场问答竞赛：参赛者拿到一份 $n$ 道题的清单，可以按自己选定的任意顺序作答。第 $i$ 题被答对的概率为 $p_i$，答对后参赛者获得奖励 $v_i$。一旦出现第一个答错，竞赛即终止，参赛者保留此前已获得的奖励。问题在于选择题目顺序，使所得总奖励的期望最大。证明：按 $p_i v_i / (1 - p_i)$ 非增的顺序作答是最优的。'),

(1891, '**Solution.** We will use a so-called interchange argument',
 '**解.** 我们使用所谓交换论证（interchange argument），它在排序（sequencing）问题中常常很有用。设在一个最优排序表 $L$ 中，$i$ 与 $j$ 分别是第 $k$ 个与第 $(k+1)$ 个问题。考虑把 $L$ 中问题 $i$ 与 $j$ 的次序互换后得到的表 $L\'$。我们计算 $L$ 与 $L\'$ 的奖励期望，并注意到由于 $L$ 是最优排序，故有'),

(1897, 'Define the weight of question $i$ to be',
 '定义问题 $i$ 的权重（weight）为'),

(1904, '# <span style="color:#c0392b;">Discrete Random Variables — Chapter 2 (Problems)</span>',
 '# <span style="color:#c0392b;">Discrete Random Variables（离散随机变量）— Chapter 2 (Problems／习题)</span>'),

(1906, '## <span style="color:#c0392b;">Solution (conclusion of the expected-reward problem)</span>',
 '## <span style="color:#c0392b;">Solution（解答，前述期望奖励问题的收尾）</span>'),

(1908, 'We will show that any permutation of the questions',
 '我们将证明：凡按权重非增顺序排列题目所得的排列，都使期望奖励最大。'),

(1910, 'If $L = (i_1, \\ldots, i_n)$ is a permutation',
 '若 $L = (i_1, \\ldots, i_n)$ 是题目的一种排列，记 $L^{(k)}$ 为把 $L$ 中第 $k$ 与第 $k+1$ 个问题互换后得到的排列。先计算 $L$ 与 $L^{(k)}$ 的期望奖励之差。我们有'),

(1918, 'and',
 '以及'),

(1926, 'Therefore,',
 '因此，'),

(1936, 'Now, let us go back to our problem.',
 '现在回到我们的问题。考虑题目的任意排列 $L$。若对某个 $k$ 有 $w_{i_k} < w_{i_{k+1}}$，则由上式可知排列 $L^{(k)}$ 的期望奖励大于 $L$ 的期望奖励。因此，题目的最优排列必须按权重非增的顺序排列。'),

(1938, 'Let us finally show that any two such permutations',
 '最后我们证明：任意两个这样的排列都有相同的期望奖励。设 $L$ 是这样的排列，且对某个 $k$ 有 $w_{i_k} = w_{i_{k+1}}$。我们知道互换 $i_k$ 与 $i_{k+1}$ 不改变期望奖励。因此，任何按权重非增顺序排列的排列 $L\'$ 的期望奖励都等于 $L$ 的期望奖励，因为 $L\'$ 可以通过反复互换相邻的等权重问题由 $L$ 得到。'),

(1940, '## <span style="color:#c0392b;">Problem 29.* — The inclusion–exclusion formula</span>',
 '## <span style="color:#c0392b;">Problem 29.* — 容斥公式（The inclusion–exclusion formula）</span>'),

(1942, S + ' ' + T + '**Problem 29.***</span>',
 S + ' ' + T + '**Problem 29.***</span> 容斥公式。设 $A_1, A_2, \\ldots, A_n$ 为事件。'),

(1944, 'Let $S_1 = \\{i_1 \\mid',
 '令 $S_1 = \\{i_1 \\mid 1 \\le i_1 \\le n\\}$，$S_2 = \\{\\{i_1, i_2\\} \\mid 1 \\le i_1 < i_2 \\le n\\}$，更一般地，令 $S_m$ 为所有满足 $1 \\le i_1 < i_2 < \\ldots < i_m \\le n$ 的下标 $m$ 元组 $(i_1, \\ldots, i_m)$ 的集合。证明'),

(1948, '**Hint:** Let $X_i$ be a binary random variable',
 '**提示：** 设 $X_i$ 是「$A_i$ 发生取 $1$、否则取 $0$」的二值（binary）随机变量。把所关心的事件与随机变量 $(1 - X_1)(1 - X_2)\\cdots(1 - X_n)$ 联系起来。'),

(1950, '## <span style="color:#c0392b;">Solution</span>',
 '## <span style="color:#c0392b;">Solution（解答）</span>'),

(1952, 'Let us express the event $B = \\cup_{k=1}^n A_k$',
 '我们把事件 $B = \\cup_{k=1}^n A_k$ 用随机变量 $X_1, \\ldots, X_n$ 表示出来。补事件 $B^c$ 发生当且仅当 $X_1, \\ldots, X_n$ 全部为 $0$，而这当且仅当随机变量 $Y = (1 - X_1)(1 - X_2)\\cdots(1 - X_n)$ 等于 $1$。'),

(1957, 'Note that $Y$ can only take values',
 '注意 $Y$ 只能取值于集合 $\\{0, 1\\}$，故 $P(B) = P(Y = 1) = E[Y]$。因此'),

(1965, 'We note that',
 '我们注意到'),

(1983, 'etc., from which the desired formula follows.',
 '依此类推，由此即得所需公式。'),

(1987, S + ' ' + T + 'Problem 30.</span>',
 S + ' ' + T + 'Problem 30.</span> *Alvin 的通讯录里有 $n$ 条朋友记录，但由于一处软件故障，地址与姓名以完全随机的方式错配。Alvin 给每位朋友写一张节日卡片，并按（已被软件弄坏的）地址寄出。至少有一位朋友收到正确卡片的概率是多少？**提示：** 使用容斥公式。'),

(1989, T + 'Solution.</span> Let $A_k$ be the event',
 T + 'Solution.</span> 设 $A_k$ 为「第 $k$ 张卡片被寄到正确地址」的事件。对任意的 $k$、$j$、$i$，有'),

(2003, 'etc., and',
 '依此类推，并且'),

(2005, 'Applying the inclusion-exclusion formula,',
 '应用容斥公式（inclusion–exclusion formula），'),

(2011, 'we obtain the desired probability',
 '就得到所求的概率'),

(2023, 'When $n$ is large, this probability',
 '当 $n$ 很大时，该概率可以用 $1 - e^{-1}$ 近似。'),

(2026, '## <span style="color:#c0392b;">SECTION 2.6. Conditioning</span>',
 '## <span style="color:#c0392b;">SECTION 2.6. Conditioning（条件化）</span>'),

(2028, S + ' ' + T + 'Problem 31.</span>',
 S + ' ' + T + 'Problem 31.</span> 考虑独立地投掷一颗 6 面骰子四次。设 $X$ 为出现 1 点的次数，$Y$ 为出现 2 点的次数。$X$ 与 $Y$ 的联合 PMF 是什么？'),

(2030, S + ' ' + T + 'Problem 32.</span>',
 S + ' ' + T + 'Problem 32.</span> D. Bernoulli 的夫妻同存问题（problem of joint lives）。考虑在某一时刻共同生活的 $m$ 对夫妻、共 $2m$ 人。假设在之后的某个时刻，每个人活着的概率为 $p$，且与其他人相互独立。到那个时刻，设 $A$ 为活着的人数，$S$ 为夫妻双方都活着的夫妻对数。对任意存活人数 $a$，求 $E[S \\mid A = a]$。'),

(2032, S + ' ' + T + 'Problem 33. \\*</span>',
 S + ' ' + T + 'Problem 33. \\*</span> 反复独立地抛掷一枚正面概率为 $p$ 的硬币，直到出现连续两次正面或连续两次反面为止。求抛掷次数的期望值。'),

(2034, '**Solution.** One possibility here',
 '**解.** 这里的一种做法是先算出 $X$（游戏结束时的抛掷次数）的 PMF，再用它计算 $E[X]$。但在硬币不均匀时，这条路会很繁重，因此我们改为使用全期望定理（total expectation theorem）以及对样本空间作合适的划分来论证。设 $H_k$（或 $T_k$）为「第 $k$ 次抛掷出现正面（相应地反面）」的事件，并令 $p$（相应地 $q$）为 $H_k$（相应地 $T_k$）的概率。由于 $H_1$ 与 $T_1$ 构成样本空间的一个划分，且 $P(H_1) = p$、$P(T_1) = q$，我们有'),

(2040, 'Using again the total expectation theorem, we have',
 '再次使用全期望定理，可得'),

(2046, 'where we have used the fact',
 '其中我们用到了 $E[X \\mid H_1 \\cap H_2] = 2$（因为接连两次正面后游戏结束），以及'),

(2052, '(since if the game is not over',
 '（因为若游戏尚未结束，则决定还需抛多少次直到结束时，只有最后一次抛掷是相关的）。同理可得'),

(2058, 'Combining the above two relations',
 '把上述两个关系式合并、整理各项，并利用 $p + q = 1$，经过一些计算得到'),
]

bad = 0
for ln, pref, new in patches:
    old = lines[ln - 1]
    if not old.startswith(pref):
        print('MISMATCH', ln, repr(old[:70]))
        bad += 1
        continue
    lines[ln - 1] = new

print('patched', len(patches) - bad, 'of', len(patches))
if bad == 0:
    io.open(P, 'w', encoding='utf-8', newline='').write('\r\n'.join(lines))
    print('written')
