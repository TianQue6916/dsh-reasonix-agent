# -*- coding: utf-8 -*-
"""Part 3: insert unnumbered figures (Part II frontispiece, exercise 8.6 square plot,
and the four inline channel diagrams of section 9.3 replacing the single Figure 9.3 stub)."""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
BASE = r"C:/Users/27063/Documents/翻译产出/教材/MacKay信息论"
MD = os.path.join(BASE, "MacKay信息论_p141-160.bilingual.md")
with open(MD, encoding="utf-8") as f:
    s = f.read()
n0 = len(s)


def rep(anchor, new, label):
    global s
    c = s.count(anchor)
    assert c == 1, f"[{label}] anchor count={c} (expected 1)"
    s = s.replace(anchor, new, 1)
    print("OK", label)


# ---------------------------------------------- Part II frontispiece (book p137)
A_FRONT = r"""<!-- ===== p150 ===== -->"""

N_FRONT = r"""![Part II 扉页分形图](_assets/fig_149_partII_frontispiece.png)

> **图注**：原书此图**无编号、无图注** —— 它是 Part II 扉页（书内 p137）中央的装饰性分形图，与全书各 Part 扉页同一族。
> **图面要素**：一棵自相似的层级「树」：白描空心圆与实心黑块（V 形 / 梯形）交替出现在各层，用细线连成主干 + 分枝的结构；越往右下，元素越大、分枝越少，越小越密地聚在上方 —— 典型的分形递归展开。它不承载任何数据，纯粹是扉页版式。
> **图内标签对照**：图内无任何文字标签。
> 来源：源书 PDF p149（书内 p137）

<!-- ===== p150 ===== -->"""

rep(A_FRONT, N_FRONT, "frontispiece")

# ---------------------------------------------- exercise 8.6 square plot (book p140)
A_EX86 = r"""（上表为原书页内表格的重建。原文以行标签 `y` 与列标签 `x` 排出 4×4 矩阵。译本复算：行和均为 $1/4$，列和为 $1/2, 1/4, 1/8, 1/8$，总和为 1。）"""

N_EX86 = r"""（上表为原书页内表格的重建。原文以行标签 `y` 与列标签 `x` 排出 4×4 矩阵。译本复算：行和均为 $1/4$，列和为 $1/2, 1/4, 1/8, 1/8$，总和为 1。）

![Exercise 8.6 的方块图（原书无编号）](_assets/fig_152_ex8-6_probability_squares.png)

> **图注**：原书此图**无编号、无图注** —— 它和上面那张表是同一份 $P(x, y)$ 的图形版，排在表右边（书内 p140，Exercise 8.6 内）。
> **图面要素**：4 × 4 的黑方块阵，每块面积正比于对应格子的概率；阵框上方一行小字 `1 2 3 4` 是列标签（$x = 1, 2, 3, 4$），行自上而下对应 $y = 1, 2, 3, 4$。读图要点：$P = 1/4$ 的那一格（$y = 4, x = 1$）最大；(1,1) 与 (2,2) 两个 $1/8$ 次之；$1/16$ 的成片更小；四块 $1/32$ 最小；$y = 4$ 这一行右边的三格 $P = 0$，是全空的。
> **图内标签对照**：`1 2 3 4` = $x$ 的四个取值；方块面积 = $P(x, y)$ 的值（不是 bit 数、不是 $-\log P$）。
> 来源：源书 PDF p152（书内 p140）"""

rep(A_EX86, N_EX86, "ex8.6")

# ---------------------------------------------- section 9.3 channel diagrams (book p148)
A_CH = r"""[Figure 9.3（原书无编号的小图）：Binary erasure channel 的转移示意图。左侧输入结点 0、1，右侧输出结点 0、?、1；0→0 与 1→1 各以概率 $1-f$ 直达，0→? 与 1→? 各以概率 $f$ 汇入中间的擦除态，0→1 与 1→0 的转移概率为 0。]"""

N_CH = r"""> **补图说明**：下面四张是原书 9.3 节的四幅 **inline 图示** —— 原书无编号、无图注，每幅都是一行「信道名 + 两侧 alphabet + 转移图 + 转移概率 + 转移矩阵图」。原先的文本占位只留了 Binary erasure channel 一幅，实际是四幅；本块按原书顺序（BSC → BEC → noisy typewriter → Z channel）全部补上。

![Binary symmetric channel（原书无编号）](_assets/fig_160_ch_bsc.png)

> **图注**：原书无编号、无图注；图中文字为 `Binary symmetric channel.` $\mathcal{A}_X = \{0, 1\}.$ $\mathcal{A}_Y = \{0, 1\}.$
> **图面要素**：左边是转移图 —— 输入结点 0、1 在左，输出结点 0、1 在右，四条支路全画：0→0 与 1→1 各以 $1-f$ 直通，0→1 与 1→0 各以 $f$ 翻转。中间是四条转移概率式。右边是 2 × 2 的**矩阵图**：列标签 0、1 是输入 $x$，行标签 0、1 是输出 $y$（与正文 (9.1) 的「行 = 输出 $j$、列 = 输入 $i$」一致）；两格大黑块在**对角**（$1-f$），两格小点在**反对角**（$f$）—— 方块面积正比于概率。
> **图内标签对照**：Binary symmetric channel = 二元对称信道（BSC）；$\mathcal{A}_X$/$\mathcal{A}_Y$ = 输入 / 输出 alphabet；$f$ = 翻转概率；$1-f$ = 正确传送概率。
> 来源：源书 PDF p160（书内 p148）

![Binary erasure channel（原书无编号）](_assets/fig_160_ch_bec.png)

> **图注**：原书无编号、无图注；图中文字为 `Binary erasure channel.` $\mathcal{A}_X = \{0, 1\}.$ $\mathcal{A}_Y = \{0, ?, 1\}.$
> **图面要素**：转移图只有**四条**支路 —— 0→0 与 1→1 各以 $1-f$ 直达，0→? 与 1→? 各以 $f$ 斜着汇入中间的擦除态 $?$；0→1 与 1→0 这两条**根本不画**（概率为 0，所以图上不存在这条箭头，而不是画出来标 0）。中间是六条转移概率式。右边是 **3 × 2** 矩阵图：列 0、1 是输入，行 0、?、1 是输出；大黑块落在 (行 0, 列 0) 与 (行 1, 列 1)（各 $1-f$），中间一整行两个小点（各 $f$），(行 0, 列 1) 与 (行 1, 列 0) 全空。
> **图内标签对照**：Binary erasure channel = 二元擦除信道（BEC）；`?` = erasure（擦除态，接收方知道「这里丢了」）；$f$ = 擦除概率；$1-f$ = 未被擦除的概率。注意它与 BSC 的本质区别：BSC 错得**静默**（你不知道哪个 bit 错），BEC 错得**明示**（$?$ 直接告诉你丢了）。
> 来源：源书 PDF p160（书内 p148）

![Noisy typewriter（原书无编号）](_assets/fig_160_ch_typewriter.png)

> **图注**：原书无编号、无图注；图中文字为 `Noisy typewriter.` $\mathcal{A}_X = \mathcal{A}_Y =$ the 27 letters $\{A, B, \ldots, Z, -\}.$
> **图面要素**：左边是 27 个字母排成一列（$A \ldots Z$ 再加 `-`），每个输入字母向右引三支箭头，落到相邻的三个输出字母（恰是「打字机敲 B，出来可能是 A、B 或 C」）；首尾相接 —— `-` 与 `A` 相邻。中间是三行示例概率 $P(y=\mathrm{F} \mid x=\mathrm{G}) = P(y=\mathrm{G} \mid x=\mathrm{G}) = P(y=\mathrm{H} \mid x=\mathrm{G}) = 1/3$，上下各有省略号。右边是 **27 × 27** 的转移矩阵点阵：列是输入、行是输出，非零点排成一条**带状对角线**（带宽 3），右上角与左下角各有一个**孤立点** —— 那就是首尾相接的两对（$A$ 敲成 `-`、`-` 敲成 $A$）。
> **图内标签对照**：Noisy typewriter = 有噪打字机信道；`F`/`G`/`H` = 输出字母示例；$1/3$ = 每个相邻输出的概率；字母表末的 `-` 是第 27 个 symbol（不是减号）。
> 来源：源书 PDF p160（书内 p148）

![Z channel（原书无编号）](_assets/fig_160_ch_zchannel.png)

> **图注**：原书无编号、无图注；图中文字为 `Z channel.` $\mathcal{A}_X = \{0, 1\}.$ $\mathcal{A}_Y = \{0, 1\}.$
> **图面要素**：转移图只有**三条**支路 —— 0→0 以 1 直通、1→1 以 $1-f$ 直通、1→0 以 $f$ 斜上；0→1 **不画**（概率为 0）。这种「一个输入绝不会被错成另一个、但反过来会」的不对称，正是 $Z$ 字形的来历。中间是四条转移概率式（$P(y=0 \mid x=0) = 1$、$P(y=0 \mid x=1) = f$、$P(y=1 \mid x=0) = 0$、$P(y=1 \mid x=1) = 1-f$）。右边是 2 × 2 矩阵图：大黑块在 (行 0, 列 0) 与 (行 1, 列 1)，小点在 (行 0, 列 1)，(行 1, 列 0) 全空。
> **图内标签对照**：Z channel = Z 信道；$f$ = 1 被错成 0 的概率；$1$ = 0 完全可靠、不会被错成 1。
> 来源：源书 PDF p160（书内 p148）"""

rep(A_CH, N_CH, "9.3 channels")

with open(MD, "w", encoding="utf-8", newline="\n") as f:
    f.write(s)
print("part 3 written; len", n0, "->", len(s))
