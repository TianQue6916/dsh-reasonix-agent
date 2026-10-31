import io

P = r'C:/Users/27063/Documents/修复产出/prob_chunk03_p101-150.bilingual.md'
lines = io.open(P, encoding='utf-8', newline='').read().split('\r\n')

S = '<span style="color:#2471a3;">**[problem]**</span>'
T = '<span style="color:#c0392b;">'

patches = [
(2064, 'and similarly',
 '同理可得'),

(2071, '## <span style="color:#c0392b;">Problems</span>',
 '## <span style="color:#c0392b;">Problems（习题）</span>'),

(2073, 'Thus,',
 '从而，'),

(2079, 'and finally, using the fact $p+q=1$,',
 '最后利用 $p+q=1$，'),

(2085, 'In the case of a fair coin',
 '若硬币是均匀的（$p=q=1/2$），则得到 $E[X]=3$。还可以验证'),

(2086, 'that $2 \\le E[X] \\le 3$ for all values of $p$.',
 '对 $p$ 的所有取值都有 $2 \\le E[X] \\le 3$。'),

(2088, S + ' ' + T + 'Problem 34.</span>',
 S + ' ' + T + 'Problem 34.</span>* 一只蜘蛛与一只苍蝇沿一条直线移动。每一秒，苍蝇以相等的概率 $p$ 向右或向左移动一个单位步长，并以概率 $1-2p$ 停在原地。蜘蛛总是朝着苍蝇的方向移动一个单位步长。初始时蜘蛛与苍蝇相距 $D$ 个单位，$D$ 是取正整数值、具有给定 PMF 的随机变量。若蜘蛛落到苍蝇身上，过程即结束。求这一过程所需时间的期望值。'),

(2090, '**Solution.** Let $T$ be the time',
 '**解.** 设 $T$ 为蜘蛛落到苍蝇身上的时刻。我们定义'),

(2092, '$A_d$: the event that initially',
 '$A_d$：初始时刻蜘蛛与苍蝇相距 $d$ 个单位的事件。'),

(2093, '$B_d$: the event that after one second',
 '$B_d$：一秒之后蜘蛛与苍蝇相距 $d$ 个单位的事件。'),

(2095, 'Our approach will be to first apply',
 '我们的做法是：先对（条件版本的）全期望定理应用一次，算出 $E[T \\mid A_d]$，再用所得结果算出 $E[T \\mid A_{2}]$，并同样依次算出所有相关 $d$ 值对应的 $E[T \\mid A_d]$。然后对（无条件版本的）全期望定理应用一次，算出 $E[T]$。'),

(2097, 'We have',
 '我们有'),

(2101, 'if $d > 1$.',
 '其中 $d > 1$。'),

(2103, 'This is because if the spider and the fly',
 '这是因为：若蜘蛛与苍蝇相距 $d > 1$，则一秒之后它们的距离将为 $d$（若苍蝇远离蜘蛛）、$d-1$（若苍蝇不动）或 $d-2$（若苍蝇朝蜘蛛移动）。当蜘蛛与苍蝇起初相距一个单位时，我们还有'),

(2107, 'Using the total expectation theorem, we obtain',
 '利用全期望定理，得到'),

(2113, 'if $d > 1$,',
 '其中 $d > 1$，'),

(2115, 'and',
 '而'),

(2121, 'if $d = 1$.',
 '其中 $d = 1$。'),

(2123, 'It can be seen based on the problem data that',
 '从题给数据可以看出'),

(2130, '## <span style="color:#c0392b;">Solution（续 · Problem 34）</span>',
 '## <span style="color:#c0392b;">Solution（解答，续 · Problem 34）</span>'),

(2132, 'We have',
 '我们有'),

(2136, 'so by applying the formula for the case $d = 1$, we obtain',
 '于是把 $d = 1$ 的情形代入公式，得到'),

(2142, 'or',
 '或'),

(2148, 'By applying the formula with $d = 2$, we obtain',
 '把 $d = 2$ 代入该公式，得到'),

(2150, 'We have',
 '我们有'),

(2158, 'so by substituting these relations in the expression for',
 '把这些关系代入 $E[T \\mid A_2]$ 的表达式，得到'),

(2168, 'This equation yields after some calculation',
 '该方程经过一些计算可得'),

(2174, 'Generalizing, we obtain for $d \\geq 2$,',
 '加以推广，对 $d \\geq 2$ 我们得到'),

(2180, 'Thus, $E[T \\mid A_d]$ can be generated recursively',
 '因此，只要把前面得到的 $E[T \\mid A_1]$ 与 $E[T \\mid A_2]$ 取作初始'),

(2181, 'conditions the values of',
 '条件，就可以对任意初始距离 $d$ 递推生成 $E[T \\mid A_d]$。'),

(2183, 'Finally, the expected value of $T$ can be obtained',
 '最后，利用初始距离 $D$ 的给定 PMF 与全期望定理，可以求出 $T$ 的期望值：'),

(2190, '## <span style="color:#c0392b;">Problem 35</span>',
 '## <span style="color:#c0392b;">Problem 35（习题）</span>'),

(2192, S + ' ' + T + 'Problem 35.</span>',
 S + ' ' + T + 'Problem 35.</span>* 验证期望值法则（expected value rule）'),

(2198, 'using the expected value rule for a function of a single random variable. Then, use the',
 '这里利用的是「单个随机变量的函数」的期望值法则。然后，把该法则用于线性函数这一特殊情形，验证公式'),

(2208, '...where $a$ and $b$ are given scalars.',
 '……其中 $a$ 与 $b$ 是给定的标量。'),

(2210, '**Solution.** We use the total expectation theorem',
 '**解.** 我们用全期望定理把问题化归为单个随机变量的情形。具体地，有'),

(2225, 'as desired. Note that the third equality above used the expected value rule for the',
 '这正是所要的结论。注意上面第三个等号用的是「单个随机变量 $X$ 的函数」即 $g(X, y)$ 的期望值法则。'),

(2226, 'function of a single random variable $X$, i.e., for $g(X, y)$.',
 ''),

(2228, 'For the linear special case, the expected value rule gives',
 '对线性这一特殊情形，期望值法则给出'),

(2246, '## <span style="color:#c0392b;">Problem 36</span>',
 '## <span style="color:#c0392b;">Problem 36（习题）</span>'),

(2248, S + ' ' + T + 'Problem 36.</span>',
 S + ' ' + T + 'Problem 36.</span>* 条件 PMF 的乘法规则（The multiplication rule for conditional PMFs）。设 $X$、$Y$、$Z$ 为随机变量。'),

(2250, '(a) Show that',
 '(a) 证明'),

(2256, '(b) How can we interpret this formula',
 '(b) 如何把这个公式解释为第 1.3 节所给乘法规则的特例？'),

(2259, '(c) Generalize to the case of more than three random variables.',
 '(c) 推广到多于三个随机变量的情形。'),

(2261, '**Solution.** (a) We have',
 '**解.** (a) 我们有'),

(2279, '(b) The formula can be written as',
 '(b) 该公式可以写成'),

(2286, '# <span style="color:#c0392b;">Discrete Random Variables</span>',
 '# <span style="color:#c0392b;">Discrete Random Variables（离散随机变量）</span>'),

(2290, 'which is a special case of the multiplication rule.',
 '这正是乘法规则的一个特例。'),

(2292, '**(c)** The generalization is',
 '**(c)** 推广形式为'),

(2300, S + ' ' + T + 'Problem 37.</span>',
 S + ' ' + T + 'Problem 37.</span> *' + T + 'Poisson 随机变量的分裂（Splitting a Poisson random variable）。</span>* 一个发送端以概率 $p$ 发出 **1**、以概率 $1-p$ 发出 **0**，且与先前的发送独立。若在给定时段内发送次数服从参数为 $\\lambda$ 的 Poisson PMF，证明同一时段内发出的 **1** 的个数服从参数为 $p\\lambda$ 的 Poisson PMF。'),

(2302, '**Solution.** Let $X$ and $Y$ be the numbers',
 '**解.** 设 $X$ 与 $Y$ 分别为发出的 **1** 与 **0** 的个数，并令 $Z = X + Y$ 为发出的符号总数。我们有'),

(2308, 'Thus,',
 '因此，'),

(2314, 'so that $X$ is Poisson with parameter $\\lambda p$.',
 '于是 $X$ 服从参数为 $\\lambda p$ 的 Poisson 分布。'),

(2318, '## <span style="color:#c0392b;">SECTION 2.7. Independence</span>',
 '## <span style="color:#c0392b;">SECTION 2.7. Independence（独立性）</span>'),

(2320, S + ' ' + T + 'Problem 38.</span>',
 S + ' ' + T + 'Problem 38.</span> Alice 上班路上要经过四个红绿灯，每个灯为绿或为红的可能性相同，且彼此独立。'),

(2322, '**(a)** What is the PMF, the mean, and the variance',
 '**(a)** Alice 遇到红灯数的 PMF、均值与方差是多少？'),

(2324, '**(b)** Suppose that each red light delays',
 '**(b)** 假设每个红灯使 Alice 恰好延误两分钟。她的通勤时间的方差是多少？'),

(2328, S + ' ' + T + 'Problem 39.</span>',
 S + ' ' + T + 'Problem 39.</span> 每天早晨「饿汉」Harry 都要吃几个鸡蛋。任一天早晨他所吃的鸡蛋数等可能地取 2、3、4、5 或 6，且与其它每个早晨独立。 <span style="color:#7f8c8d;">[OCR 残缺：题面续至下一页]</span>'),

(2331, '## <span style="color:#c0392b;">Problems</span>',
 '## <span style="color:#c0392b;">Problems（习题）</span>'),

(2333, S + ' ' + T + 'Problem 39.</span>',
 S + ' ' + T + 'Problem 39.</span> …… 与他过去所作所为如何无关。设 $X$ 为 Harry 在 10 天内所吃的鸡蛋数。求 $X$ 的均值与方差。'),

(2335, S + ' ' + T + 'Problem 40.</span>',
 S + ' ' + T + 'Problem 40.</span> 某位教授以评分政策的随意著称。每份作业从集合 $\\{A,\\ A^{-},\\ B^{+},\\ B,\\ B^{-},\\ C^{+}\\}$ 中等概率地得到一个评分，且与其他作业独立。你期望在交上多少份作业之后，才能得到上述每一种评分至少一次？'),

(2337, S + ' ' + T + 'Problem 41.</span>',
 S + ' ' + T + 'Problem 41.</span> 你每周开车上班 5 天，全年共 50 周；任意一天收到交通罚单的概率为 $p = 0.02$，且各天独立。设 $X$ 为你全年收到的罚单总数。'),

(2339, '(a) What is the probability that the number of tickets',
 '(a) 你收到的罚单数恰好等于 $X$ 的期望值的概率是多少？'),

(2341, '(b) Calculate approximately the probability in (a)',
 '(b) 用 Poisson 近似近似计算 (a) 中的概率。'),

(2343, '(c) Any one of the tickets is',
 '(c) 任意一张罚单的金额为 \\$10、\\$20 或 \\$50，概率分别为 $0.5$、$0.3$ 与 $0.2$，且与其他罚单独立。求你全年在交通罚单上所付金额的均值与方差。'),

(2345, '(d) Suppose you don\'t know the probability',
 '(d) 假设你不知道被开罚单的概率 $p$，但你在这一年里收到了 5 张罚单，于是用样本均值来估计 $p$：'),

(2351, 'What is the range of possible values of $p$',
 '假设 $\\hat{p}$ 与真值 $p$ 之差在样本均值的标准差的 5 倍之内，那么 $p$ 的可能取值范围是多少？（注：原文此处把真值写作 sample mean，指被估计的总体均值。）'),

(2353, S + ' ' + T + 'Problem 42.</span>',
 S + ' ' + T + 'Problem 42.</span> 计算题。下面给出一种用概率方法计算单位正方形中给定子集 $S$ 面积的做法。该方法在单位正方形 $[0,1] \\times [0,1]$ 中按均匀概率律独立地随机选取一串点。若第 $i$ 个点落在子集 $S$ 中，则令随机变量 $X_i = 1$，否则令 $X_i = 0$。设 $X_1, X_2, \\ldots$ 是由此定义的随机变量序列，并对任意 $n$ 令'),

(2359, '(a) Show that $E[S_n]$ is equal to the area',
 '(a) 证明 $E[S_n]$ 等于子集 $S$ 的面积，并证明 $\\mathrm{var}(S_n)$ 随 $n$ 增大趋于 $0$。'),

(2361, '(b) Show that to calculate $S_n$',
 '(b) 证明：为计算 $S_n$，只需知道 $S_{n-1}$ 与 $X_n$，因此不必记住 $X_k$（$k = 1, \\ldots, n-1$）的过去取值。给出相应公式。'),

(2363, '(c) Write a computer program',
 '(c) 针对子集 $S$ 为单位正方形内切圆的情形，编写计算机程序，用计算机的随机数生成器产生 $n = 1, 2, \\ldots, 10000$ 时的 $S_n$。如何用你的程序实验性地测出 $\\pi$ 的值？'),

(2365, '(d) Use a similar computer program',
 '(d) 用类似的程序，近似计算「落在单位正方形内且满足 $0 \\le \\cos \\pi x + \\sin \\pi y \\le 1$ 的所有 $(x, y)$ 构成的集合」的面积。'),

(2370, T + 'Problem 43.</span>',
 T + 'Problem 43.</span> * 设 $X$ 与 $Y$ 是独立同分布、参数为 $p$ 的几何（geometric）随机变量。证明'),

(2376, '**Solution.** Consider repeatedly and independently tossing',
 '**解.** 考虑反复独立地抛一枚正面概率为 $p$ 的硬币。我们可以把 $P\\{X = i \\mid X + Y = n\\}$ 解释为：在「第 $n$ 次抛掷才出现第二个正面」的条件下，「第 $i$ 次抛掷才首次出现正面」的概率。直观上可以说：已知第二个正面出现在第 $n$ 次抛掷，那么第一个正面等可能地出现在 $1$ 到 $n-1$ 的任一次抛掷。'),

(2378, 'To establish this precisely, note that we have',
 '为严格证明这一点，注意有'),

(2384, 'Also',
 '又有'),

(2396, 'It follows that',
 '于是推出'),

(2402, 'Therefore, for any $i$ and $j$',
 '因此，对 $[1, n - 1]$ 中的任意 $i$ 与 $j$，我们有'),

(2408, 'Hence',
 '从而'),

(2418, T + 'Problem 44.</span>',
 T + 'Problem 44.</span> * 设 $X$ 与 $Y$ 是联合 PMF 给定的两个随机变量，$g$ 与 $h$ 分别是 $X$ 与 $Y$ 的函数。证明：若 $X$ 与 $Y$ 独立，则随机变量 $g(X)$ 与 $h(Y)$ 也独立。'),

(2420, '**Solution.** Let $U = g(X)$',
 '**解.** 令 $U = g(X)$、$V = h(Y)$。则'),

(2430, 'so $U$ and $V$ are independent.',
 '因此 $U$ 与 $V$ 独立。'),

(2433, '## <span style="color:#c0392b;">Problems</span>',
 '## <span style="color:#c0392b;">Problems（习题）</span>'),

(2435, S + ' ' + T + 'Problem 45.\\*</span>',
 S + ' ' + T + 'Problem 45.\\*</span> **方差的极端情形（Variability extremes）。** 设 $X_1,\\ldots,X_n$ 是独立随机变量，$X = X_1 + \\cdots + X_n$ 为它们的和。'),

(2437, '(a) Suppose that each $X_i$ is Bernoulli',
 '(a) 假设每个 $X_i$ 是参数为 $p_i$ 的 Bernoulli 随机变量，并且 $p_1,\\ldots,p_n$ 的取法使 $X$ 的均值为给定值 $\\mu > 0$。证明：当所有 $p_i$ 都取 $\\mu/n$ 时，$X$ 的方差达到最大。'),

(2439, '(b) Suppose that each $X_i$ is geometric',
 '(b) 假设每个 $X_i$ 是参数为 $p_i$ 的几何随机变量，并且 $p_1,\\ldots,p_n$ 的取法使 $X$ 的均值为给定值 $\\mu > 0$。证明：当所有 $p_i$ 都取 $n/\\mu$ 时，$X$ 的方差达到最小。[注意 (a) 与 (b) 的结果在性质上差别之大。]'),

(2441, '<span style="color:#00838f;">**Solution.**</span> (a) We have',
 '<span style="color:#00838f;">**解.**</span> (a) 我们有'),

(2447, 'Thus maximizing the variance is equivalent',
 '因此最大化方差等价于最小化 $\\sum_{i=1}^n p_i^2$。可以看出（利用约束 $\\sum_{i=1}^n p_i = \\mu$）'),

(2453, 'so $\\sum_{i=1}^n p_i^2$ is minimized',
 '故当所有 $i$ 都有 $p_i = \\mu/n$ 时，$\\sum_{i=1}^n p_i^2$ 取到最小值。'),

(2455, '(b) We have',
 '(b) 我们有'),

(2467, 'Introducing the change of variables',
 '引入变量替换 $Y_i = 1/p_i = E[X_i]$，可见约束变为'),

(2473, 'and that we must minimize',
 '且我们要在该约束下最小化 $\\sum_{i=1}^n (Y_i^2 - Y_i) = \\sum_{i=1}^n Y_i^2 - \\mu$。这与 (a) 中的问题是同一个问题，因此那里的证明方法适用。'),

(2475, S + ' ' + T + 'Problem 46.\\*</span>',
 S + ' ' + T + 'Problem 46.\\*</span> **熵与不确定性（Entropy and uncertainty）。** 考虑取值 $x_1,\\ldots,x_n$、对应概率为 $p_1,\\ldots,p_n$ 的随机变量 $X$。$X$ 的熵（entropy）定义为'),

(2485, '<span style="color:#c0392b;">Problem 46</span> (续)',
 '<span style="color:#c0392b;">Problem 46</span> (续) — *熵与不确定性（Entropy and uncertainty）*。'),

(2487, '(All logarithms in this problem are with respect to base two.)',
 '（本题中所有对数均以 2 为底。）熵 $H(X)$ 给出了对 $X$ 取值不确定性的一种度量。要体会这一点，注意 $H(X) \\ge 0$，且当 $X$「几乎是确定的」——即以非常接近 $1$ 的概率取某个可能值——时 $H(X)$ 非常接近 $0$（因为当 $p \\approx 0$ 或 $p \\approx 1$ 时都有 $p\\log p \\approx 0$）。'),

(2489, 'The notion of entropy is fundamental in information theory',
 '熵这一概念在信息论（information theory）中是基本的；信息论源自 C. Shannon 的著名工作，并在许多专门教材中有所论述。例如可以证明：$H(X)$ 是「为确定 $X$ 的取值而必须提出的是/否问题个数（例如「$X = x_1$ 吗？」或「$X < x_5$ 吗？」）的平均值」的一个下界。进一步地，若 $k$ 是确定一串独立同分布随机变量 $X_1, X_2, \\ldots, X_n$ 的取值所需的平均问题数，那么采用合适的策略，当 $n$ 很大时 $k/n$ 可以任意接近 $H(X)$。'),

(2491, '(a) Show that if $q_1',
 '(a) 证明：若 $q_1, \\ldots, q_n$ 为非负实数且 $\\sum_{i=1}^n q_i = 1$，则'),

(2497, 'with equality if and only if $p_i = q_i$',
 '且等号成立当且仅当对所有 $i$ 都有 $p_i = q_i$。作为特例，证明 $H(X) \\le \\log n$，且等号成立当且仅当对所有 $i$ 都有 $p_i = 1/n$。提示：利用不等式 $\\ln Q \\le Q - 1$（$Q > 0$），它取等号当且仅当 $Q = 1$；这里 $\\ln Q$ 表示自然对数。'),

(2499, '(b) Let $X$ and $Y$ be random variables taking a finite number of values',
 '(b) 设 $X$ 与 $Y$ 是取有限个值的随机变量，联合 PMF 为 $p_{X,Y}(x,y)$。定义'),

(2505, 'Show that $I(X, Y) \\ge 0$',
 '证明 $I(X, Y) \\ge 0$，且 $I(X, Y) = 0$ 当且仅当 $X$ 与 $Y$ 独立。'),

(2507, '(c) Show that',
 '(c) 证明'),

(2513, 'where',
 '其中'),

(2523, '(d) Show that',
 '(d) 证明'),

(2529, 'where <span style="color:#7f8c8d;">[OCR 残缺',
 '其中 <span style="color:#7f8c8d;">[OCR 残缺：条件熵公式仅存零散下标，依据下方释义重建为 $H(X \\mid Y) = \\sum_y p_Y(y) H(X \\mid Y = y)$，$H(X \\mid Y = y) = - \\sum_x p_{X \\mid Y}(x \\mid y) \\log p_{X \\mid Y}(x \\mid y)$]</span>'),

(2531, '[Note that $H(X \\mid Y)$ may be viewed',
 '[注意 $H(X \\mid Y)$ 可看作在给定 $Y$ 时 $X$ 的条件熵，即「在 $Y = y$ 条件下 $X$ 的条件分布的熵」对 $y$ 取平均。]'),

(2534, S + '（上接前一页 Problem 续）... over all possible values $y$. Thus, the quantity',
 S + '（上接前一页 Problem 续）……对 $y$ 的所有可能取值取平均。因此，量'),

(2540, 'is the reduction in the entropy',
 '就是当 $Y$ 变为已知时 $X$ 的熵（不确定性）的减少量。因此它可以解释为 $Y$ 所传达的关于 $X$ 的信息，称为 $X$ 与 $Y$ 的*互信息*（mutual information）。'),

(2542, '## <span style="color:#c0392b;">Solution</span>',
 '## <span style="color:#c0392b;">Solution（解答）</span>'),

(2544, '**Solution.** We will use the inequality',
 '**解.** 我们将使用不等式 $\\ln a \\le a - 1$。（要看这个不等式为何成立，对 $a > 1$ 可写成'),

(2550, 'for $a > 1$, and write',
 '而对 $0 < a < 1$ 可写成'),

(2556, 'for $0 < a < 1$.)',
 '）'),

(2558, 'We have',
 '我们有'),

(2564, 'with equality if and only if $p_i = q_i$',
 '且等号成立当且仅当对所有 $i$ 都有 $p_i = q_i$。由于 $\\ln p = (\\log p)\\,\\ln 2$，即得所要的关系式'),

(2570, 'The inequality $H(X) \\le \\log n$ is obtained',
 '不等式 $H(X) \\le \\log n$ 可令所有 $i$ 取 $q_i = \\frac{1}{n}$ 得到。'),

(2572, '**(b)** The numbers $p_X(x)\\,p_Y(y)$ satisfy',
 '**(b)** 数 $p_X(x)\\,p_Y(y)$ 满足'),

(2578, 'so by part (a), we have',
 '故由 (a) 得'),

(2584, 'with equality if and only if',
 '且等号成立当且仅当'),

(2590, 'for all $x$ and $y$, which is equivalent to',
 '对所有 $x$ 与 $y$ 成立，而这等价于 $X$ 与 $Y$ 独立。'),

(2592, '**(c)** We have',
 '**(c)** 我们有'),

(2598, 'and',
 '以及'),

(2604, 'Also,',
 '又有'),

(2615, 'Combining the above three relations, we obtain',
 '把上面三个关系式合并，得到'),

(2624, '<span style="color:#00838f;">**Solution.**</span> (continued)',
 '<span style="color:#00838f;">**解.**</span> （续）'),

(2626, '**(d)** From the calculation in part (c), we have',
 '**(d)** 由 (c) 中的计算，我们有'),
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
