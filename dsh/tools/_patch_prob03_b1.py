import io

P = r'C:/Users/27063/Documents/修复产出/prob_chunk03_p101-150.bilingual.md'
lines = io.open(P, encoding='utf-8', newline='').read().split('\r\n')

S = '<span style="color:#2471a3;">**[problem]**</span>'
T = '<span style="color:#c0392b;">'

patches = [
(1608, '## <span style="color:#c0392b;">SECTION 2.2.',
 '## <span style="color:#c0392b;">SECTION 2.2. Probability Mass Functions（概率质量函数）</span>'),

(1610, S,
 S + ' ' + T + 'Problem 1.</span> MIT 足球队在一个周末安排了两场比赛。第一场不输的概率为 $0.4$，第二场不输的概率为 $0.7$，且与第一场的结果独立。若某场比赛没有输，则该队赢或平的机会均等，并与另一场比赛的结果无关。MIT 队赢一场得 $2$ 分，平一场得 $1$ 分，输一场得 $0$ 分。求该队在这个周末所得分数的 PMF。'),

(1612, S,
 S + ' ' + T + 'Problem 2.</span> 你去参加一个有 $500$ 位客人的聚会。恰好有一位其他客人与你同一天生日的概率是多少？请给出精确计算结果，并用 Poisson PMF 给出近似计算。（为简单起见，排除 2 月 29 日的生日。）'),

(1614, S,
 S + ' ' + T + 'Problem 3.</span> Fischer 与 Spassky 下棋比赛，谁先赢一局谁就取得整场胜利。若连续 $10$ 局皆是和局，则整场判为和局。每一局 Fischer 获胜的概率为 $0.4$，Spassky 获胜的概率为 $0.3$，和局的概率为 $0.3$，各局之间相互独立。'),

(1616, '(a) What is the probability that Fischer',
 '(a) Fischer 赢得整场比赛的概率是多少？'),

(1617, '(b) What is the PMF of the duration',
 '(b) 整场比赛时长（总局数）的 PMF 是什么？'),

(1619, S,
 S + ' ' + T + 'Problem 4.</span> 一家互联网服务商（ISP）用 $50$ 台调制解调器（modem）为 $1000$ 位客户提供服务。据估计，在任意给定时刻，每位客户需要建立连接的概率为 $0.01$，且与其他客户独立。'),

(1621, '(a) What is the PMF of the number of modems',
 '(a) 该给定时刻正在使用的调制解调器数量的 PMF 是什么？'),

(1622, '(b) Repeat part (a) by approximating',
 '(b) 把「需要连接的客户数」的 PMF 改用 Poisson PMF 近似，重做 (a)。'),

(1623, '(c) What is the probability that there are more customers',
 '(c) 需要连接的客户数多于调制解调器数的概率是多少？请给出精确公式，以及基于 (b) 中 Poisson 近似的近似公式。'),

(1625, S,
 S + ' ' + T + 'Problem 5.</span> 一个分组通信系统（packet communication system）由一个缓存（buffer）和一条通信线路组成：缓存存放来自信源的分组，线路则从缓存取出分组并发送给接收端。系统按时隙对（time-slot pair）运作。在第一个时隙里，系统存入信源按参数为 $\\lambda$ 的 Poisson PMF 生成的一批分组；但可存放的分组数最多为给定整数 $b$，到达已满缓存的分组则被丢弃。在第二个时隙里，系统发送已存放的全部分组或 $c$ 个分组（取两者中较小者）。其中 $c$ 是给定整数，满足 $0 < c < b$。'),

(1628, '## <span style="color:#c0392b;">Discrete Random Variables</span>',
 '## <span style="color:#c0392b;">Discrete Random Variables（离散随机变量）</span>'),

(1632, '(a) Assuming that at the beginning',
 '(a) 假设第一个时隙开始时缓存为空，求第一个时隙结束时、以及第二个时隙结束时缓存中分组数的 PMF。'),

(1634, '(b) What is the probability that some packets',
 '(b) 第一个时隙内有分组被丢弃的概率是多少？'),

(1636, S,
 S + ' ' + T + 'Problem 6.</span> Celtics 与 Lakers 将进行 $n$ 场季后赛，$n$ 为奇数。Celtics 在任何一场中获胜的概率为 $p$，各场之间相互独立。'),

(1638, '(a) Find the values of $p$ for which $n = 5$',
 '(a) 求使 $n = 5$ 对 Celtics 比 $n = 3$ 更有利的 $p$ 的取值。'),

(1640, '(b) Generalize part (a)',
 '(b) 推广 (a)：对任意 $k > 0$，求使 $n = 2k + 1$ 对 Celtics 比 $n = 2k - 1$ 更有利的 $p$ 的取值。'),

(1642, S,
 S + ' ' + T + 'Problem 7.</span> 你刚租下一栋大房子，中介给了你 5 把钥匙，对应房子的 5 扇门各一把。不幸的是所有钥匙外形完全相同，因此要打开前门只能随机地逐个试。'),

(1644, '(a) Find the PMF of the number of trials',
 '(a) 在下列两种不同假设下，求打开门所需试开次数的 PMF：(1) 每次试开失败后给对应钥匙做上标记，从而不再试它；(2) 每次试开都等可能地任选一把钥匙。'),

(1646, '(b) Repeat part (a) for the case where the realtor',
 '(b) 若中介为 5 扇门各多给了一把重复的钥匙，重做 (a)。'),

(1648, S,
 S + ' ' + T + 'Problem 8.</span> *二项 PMF 的递推计算（Recursive computation of the binomial PMF）。* 设 $X$ 是参数为 $n$ 与 $p$ 的二项（binomial）随机变量。证明它的 PMF 可以从下式出发计算'),

(1654, 'and then using the recursive formula',
 '然后使用递推公式（recursive formula）'),

(1660, S,
 S + ' ' + T + 'Problem 9.</span> *二项 PMF 的形状（Form of the binomial PMF）。* 考虑参数为 $n$ 与 $p$ 的二项随机变量 $X$。设 $k^{*}$ 为不超过 $(n+1)p$ 的最大整数。证明 PMF $p_X(k)$ 在 $k$ 从 $0$ 到 $k^{*}$ 的范围内随 $k$ 单调非降，而在 $k \\ge k^{*}$ 时随 $k$ 单调下降。'),

(1662, S,
 S + ' ' + T + 'Problem 10.</span> *Poisson PMF 的形状（Form of the Poisson PMF）。* 设 $X$ 是参数为 $\\lambda$ 的 Poisson 随机变量。证明 PMF $p_X(k)$ 随 $k$ 增大而单调上升，直至 $k$ 到达不超过 $\\lambda$ 的最大整数；此后随 $k$ 单调下降。'),

(1664, S,
 S + ' ' + T + 'Problem 11.</span> *火柴盒问题（the matchbox problem）——由 Banach 的吸烟习惯引发。* 一位吸烟的数学家在右口袋和左口袋里各放一盒火柴。每次想点烟时，他都以概率 $p = 1/2$ 从任一口袋取出一盒火柴，与先前的选择独立。两盒火柴最初各有 $n$ 根。求他伸手去取火柴、却发现对应的盒子已经空了的那一刻，另一盒中剩余火柴数的 PMF。若取左口袋与取右口袋的概率分别为 $p$ 与 $1 - p$，又该如何推广？'),

(1667, '## <span style="color:#c0392b;">Problems</span>',
 '## <span style="color:#c0392b;">Problems（习题）</span>'),

(1669, '<span style="color:#c0392b;">**Problem 11.**</span>',
 '<span style="color:#c0392b;">**Problem 11.**</span> *（解答，续）*'),

(1671, 'Solution. Let $X$ be the number of matches',
 '**解.** 设 $X$ 为发现某一盒已空时另一盒中剩余的根数。对 $k = 0, 1, \\ldots, n$，记 $L_k$（相应地 $R_k$）为「首次发现的空盒在左（相应地右）口袋、而此时右（相应地左）口袋中火柴数为 $k$」的事件。$X$ 的 PMF 为'),

(1677, 'Viewing a left and a right pocket selection',
 '把「取左口袋」与「取右口袋」分别看作 $2n-k$ 次试验中的「成功」与「失败」，则 $P(L_k)$ 就是「前 $2n-k$ 次试验中恰有 $n$ 次成功、且第 $2n-k+1$ 次试验为成功」的概率，即'),

(1683, 'By symmetry, $P(L_k) = P(R_k)$, so',
 '由对称性 $P(L_k) = P(R_k)$，于是'),

(1690, 'In the more general case, where the probabilities',
 '在更一般的情形下，取左、右口袋的概率分别为 $p$ 与 $1 - p$。用类似的推理可得'),

(1696, 'and',
 '以及'),

(1702, 'which yields',
 '于是得到'),

(1711, T + '**Problem 12.**</span> * Justification',
 S + ' ' + T + '**Problem 12.**</span> *Poisson 近似性质（Poisson approximation property）的论证。* 考虑参数为 $n$ 与 $p$ 的二项随机变量的 PMF。证明：当 $n \\to \\infty$、$p \\to 0$ 而 $np$ 固定为给定值 $\\lambda$ 时，该 PMF 渐近地趋于参数为 $\\lambda$ 的 Poisson 随机变量的 PMF。'),

(1713, '**Solution.** Using the equation',
 '**解.** 利用关系 $\\lambda = np$，把二项 PMF 写成'),

(1721, '<span style="color:#c0392b;">**Problem 12.**</span>',
 '<span style="color:#c0392b;">**Problem 12.**</span> *（解答，续）*'),

(1723, '**Solution.** ... Fix $k$ and let',
 '**解.** …… 固定 $k$，令 $n \\to \\infty$。对 $j = 1, \\ldots, k$，有'),

(1729, 'Thus, for each fixed $k$',
 '因此，对每个固定的 $k$，当 $n \\to \\infty$ 时得到'),

(1737, '## <span style="color:#c0392b;">SECTION 2.3.',
 '## <span style="color:#c0392b;">SECTION 2.3. Functions of Random Variables（随机变量的函数）</span>'),

(1741, T + '**Problem 13.**</span>',
 T + '**Problem 13.**</span> 一个家庭有 5 个亲生孩子，另外收养了 2 个女孩。每个亲生孩子在男、女之间的概率相等，且与其他孩子独立。求 7 个孩子中女孩数的 PMF。'),

(1745, T + '**Problem 14.**</span>',
 T + '**Problem 14.**</span> 设 $X$ 是从 0 到 9 取值的随机变量，各值概率均为 $1/10$。'),

(1747, '(a) Find the PMF of the random variable $Y = X \\bmod 3$',
 '(a) 求随机变量 $Y = X \\bmod 3$ 的 PMF。'),

(1749, '(b) Find the PMF of the random variable $Y = 5',
 '(b) 求随机变量 $Y = 5 \\bmod (X + 1)$ 的 PMF。'),

(1753, T + '**Problem 15.**</span>',
 T + '**Problem 15.**</span> 设 $K$ 是取区间 $[-n, n]$ 内各个整数值的随机变量，各值概率均为 $1/(2n+1)$。求随机变量 $Y = a|K|$ 的 PMF，其中 $a$ 为正数。 <span style="color:#7f8c8d;">[OCR 残缺]</span>'),

(1755, '## <span style="color:#c0392b;">SECTION 2.4.',
 '## <span style="color:#c0392b;">SECTION 2.4. Expectation, Mean, and Variance（期望、均值与方差）</span>'),

(1759, T + '**Problem 16.**</span>',
 T + '**Problem 16.**</span> 设 $X$ 是 PMF 为下式的随机变量'),

(1765, '(a) Find $a$ and $E[X]$.',
 '(a) 求 $a$ 与 $E[X]$。'),

(1767, '(b) What is the PMF of the random variable $Z',
 '(b) 随机变量 $Z = (X - E[X])^2$ 的 PMF 是什么？'),

(1769, '(c) Using the result from part (b)',
 '(c) 利用 (b) 的结果求 $X$ 的方差。'),

(1771, '(d) Find the variance of $X$ using the formula',
 '(d) 利用公式 $\\operatorname{var}(X) = \\sum_x (x - E[X])^2\\, p_X(x)$ 求 $X$ 的方差。'),

(1775, T + '**Problem 17.**</span>',
 T + '**Problem 17.**</span> 某城市的气温被建模为均值与标准差都等于 10 摄氏度（Celsius）的随机变量。若某天的气温落在均值的一个标准差范围之内，就称这一天为「正常日」。如果把气温改用华氏度（Fahrenheit）表示，正常日的气温范围是多少？'),

(1779, T + '**Problem 18.**</span>',
 T + '**Problem 18.**</span> 设 $a$ 与 $b$ 为正整数且 $a \\leq b$，$X$ 是等概率地取区间 $[2^a, 2^b]$ 内各个 2 的幂作为值的随机变量。求 $X$ 的期望值与方差。'),

(1782, '## <span style="color:#c0392b;">Problems</span>',
 '## <span style="color:#c0392b;">Problems（习题）</span>'),

(1786, T + '**Problem 19.**</span>',
 T + '**Problem 19.**</span> 一个奖品被随机放进 10 个编号 1 到 10 的盒子之一。你通过提出是/否问题来寻找奖品。对下列每种策略，求「直到你确定奖品所在位置为止所提问题数」的期望。'),

(1788, '(a) An enumeration strategy',
 '(a) 逐一枚举（enumeration）策略：所提问题形如「它在第 $k$ 个盒子里吗？」。'),

(1790, '(b) A bisection strategy',
 '(b) 折半（bisection）策略：用形如「它在编号不超过 $k$ 的盒子里吗？」的问题，尽量每次排除掉剩余盒子的一半。'),

(1792, '**Solution.** We will find the expected gain',
 '**解.** 我们将通过计算「直到找到奖品为止所提问题数」的期望，来求各策略的期望收益（expected gain）。'),

(1794, '(a) With this strategy, the probability',
 '(a) 在这一策略下，用 $i$ 个问题（$i = 1, \\ldots, 10$）定位到奖品的概率为 $1/10$。因此问题数的期望为'),

(1800, '(b) It can be checked that for 4 of the 10',
 '(b) 可以核验：在 10 个可能的盒号中，有 4 个恰好需要 4 个问题，另外 6 个只需 3 个问题。因此该策略下问题数的期望为'),
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
