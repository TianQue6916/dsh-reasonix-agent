import io

P = r'C:/Users/27063/Documents/修复产出/Lec01.bilingual.md'
raw = io.open(P, encoding='utf-8', newline='').read()
crlf = '\r\n' in raw
lines = [l.rstrip('\r') for l in raw.split('\n')]

def rep(idx, must_contain, new):
    old = lines[idx - 1]
    assert must_contain in old, (idx, repr(old[:90]))
    lines[idx - 1] = new
    print('patched', idx)

rep(73, '你在 100B 学的"面积可测性"直觉在这里直接有用',
 '> <span style="color:#1e8449;">**[note] Note（译者注）:**</span> '
 '离散例子（四面骰两次，16 个点）与连续例子（$[0,1]^2$，不可数无穷）并排，预告本课程的两大分支：'
 '**离散概率**（样本空间可数，用"计数"算概率）与**连续概率**（样本空间连续，用"面积/密度"算概率）。'
 '注意连续例子的样本空间 $\\Omega = \\{(x,y): 0\\le x,y \\le 1\\}$ 是单位正方形——"两个随机数"实验的天然模型。'
 '这里用得上的直觉是你在 100B 已经建立的那一层：**开集、闭集、序列收敛、子集的"大小"可以相加**'
 '（有限个互不相交的集合，面积相加），连续概率 = 面积正是这条直觉的直接延续；'
 '至于"哪些子集才有资格拥有面积"（可测性）这一层，100B 并不涉及，它属于测度论（坐标：18.125 / 自学 measure theory），本课程不会真的踩到。'
 '这为后续（Lec 08 连续随机变量）埋下伏笔。')

rep(159, '它让你在 100B 的测度论（Lebesgue 测度）与概率论之间看到同一数学结构',
 '> <span style="color:#1e8449;">**[note] Note（译者注，验证 + 战略预告）:**</span> '
 '验算：$P(\\text{偶数}) = \\sum_{n=1}^{\\infty} 2^{-2n} = \\sum_{n=1}^{\\infty} \\left(\\frac{1}{4}\\right)^n = \\frac{1/4}{1-1/4} = \\frac{1}{3}$ ✓'
 '（等比级数求和，你在 L08/100B 学过：首项 $\\frac14$、公比 $\\frac14$）。'
 '这个例子展示了**为什么需要"可数可加性"公理**：$P(2)+P(4)+P(6)+\\cdots$ 是**可数无限项**的和，'
 '公理 3（有限可加）只能处理有限并；要算"所有偶数的概率"，必须把可数可加性作为公理接受——这正是公理 3 的"强化"。'
 '战略预告：可数可加性 + 非负 + 归一，构成**测度论意义下的概率公理**（Kolmogorov 公理，1933）：'
 '概率 $P$ 就是一个总测度为 $1$ 的 measure。注意坐标——这一步跨进了测度论，'
 '而 100B 不含测度论（它止于度量空间、紧致性、微分），真正的对应课程是 18.125（Measure and Integration），'
 '眼下只需知道"概率 = 测度为 1 的测度"这个提法；而 $2^{-n}$ 这个几何分布是后续"无记忆性"（Lec 13 伯努利过程）的种子。')

out = '\r\n'.join(lines) if crlf else '\n'.join(lines)
io.open(P, 'w', encoding='utf-8', newline='').write(out)
print('written')
