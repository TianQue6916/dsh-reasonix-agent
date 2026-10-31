# -*- coding: utf-8 -*-
"""Part 2: Figure 8.1 / 8.2 / 8.3 / 9.1 placeholders + insert unnumbered figures."""
import os
import re
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


# ------------------------------------------------------- Figure 8.1
A_81 = r"""[Figure 8.1：joint information、marginal entropy、conditional entropy 与 mutual entropy 之间的关系。整条横条的高度是 $H(X, Y)$；左段是 $H(X)$，右段是 $H(Y)$，两者重叠部分是 $I(X; Y)$；左段不重叠部分标 $H(X \mid Y)$，右段不重叠部分标 $H(Y \mid X)$。注意与图 8.2 的 Venn 图表示相对照。]"""

N_81 = r"""![Figure 8.1](_assets/fig_152_fig8-1_entropy_bars.png)

> **Figure 8.1 图注**：Figure 8.1. The relationship between joint information, marginal entropy, conditional entropy and mutual entropy.　—　joint information、marginal entropy、conditional entropy 与 mutual entropy 之间的关系。
> **图面要素**（按真图重转；占位所说的「整条横条分左右两段、重叠处是 $I(X;Y)$」与真图不符 —— 真图是**四条独立横条 Stacked bars**，不是一条横条切成两段）：四条横条等宽对齐，自上而下 ——
> ① 第一条占满全宽，条内写 $H(X, Y)$；
> ② 第二条从最左端起、止于 2/3 处，条内写 $H(X)$；
> ③ 第三条从 1/3 处起、接到最右端，条内写 $H(Y)$；
> ④ 第四条被等分成三段，从左到右依次写 $H(X \mid Y)$、$I(X; Y)$、$H(Y \mid X)$。
> 读法：第 ④ 行三段拼起来就是第 ① 行的 $H(X, Y)$；第 ② 行 = 第 ④ 行前两段（$H(X) = H(X \mid Y) + I(X;Y)$），第 ③ 行 = 第 ④ 行后两段（$H(Y) = I(X;Y) + H(Y \mid X)$）。图的全部信息就在这三条等式里，所以 MacKay 说它「重要」。
> **图内标签对照**：$H(X,Y)$ = joint information（联合熵）；$H(X)$、$H(Y)$ = marginal entropy（边缘熵）；$H(X \mid Y)$、$H(Y \mid X)$ = conditional entropy（条件熵）；$I(X;Y)$ = mutual entropy（互信息，书中也叫 mutual information）。条内无英文单词，全是公式标签。
> 来源：源书 PDF p152（书内 p140）"""

rep(A_81, N_81, "8.1")

# ------------------------------------------------------- Figure 8.2
A_82 = r"""[Figure 8.2：一种会误导人的 entropy 表示（请与图 8.1 对照）。这里把 $H(X)$ 与 $H(Y)$ 画成两个部分重叠的圆（Venn 图）：左圆独有部分标 $H(X \mid Y)$，右圆独有部分标 $H(Y \mid X)$，交集标 $I(X; Y)$，而两圆并集的外框标为 $H(X, Y)$。图 8.3 沿用同一种画法却更糟。]"""

N_82 = r"""![Figure 8.2](_assets/fig_153_fig8-2_venn_two.png)

> **Figure 8.2 图注**：Figure 8.2. A misleading representation of entropies (contrast with ﬁgure 8.1).　—　一种会误导人的 entropy 表示（请与 Figure 8.1 对照）。
> **图面要素**（按真图重转；占位所说的「两圆并集的外框标为 $H(X,Y)$」与真图不符 —— 真图**没有外框**，是第二个面板里两个**灰色实心圆**的并集上盖一个白底胶囊标签）：整幅是两个面板 ——
> 面板 1（左）：两个部分重叠的白圆。左圆独有月牙写 $H(X \mid Y)$，交叠透镜区写 $I(X; Y)$，右圆独有月牙写 $H(Y \mid X)$；圆外用**带弯箭头的标签** $H(X)$（左下，箭头指进左圆）与 $H(Y)$（右上，箭头指进右圆），表示「这个圆的整个面积」就是一个变量自己的 entropy。
> 面板 2（右）：两个重叠的**灰色实心圆**，两块灰区合成一片，交叠处盖着一个白底圆角标签 $H(X, Y)$ —— 意思是「两圆并起来的面积 = $H(X,Y)$」。
> 为什么「误导」：Venn 图诱导你把 entropy 当集合来数（下意识认为面积可加、交集不会超过任何一个圆），而 $I(X;Y) \le H(X)$ 只是碰巧成立；一旦推广到三个变量，就会出现必须取负值的区域（见 Figure 8.3 的 $A$ 区与 8.3 节正文）。
> **图内标签对照**：$H(X)$/$H(Y)$ 用箭头标在圆外 ⇒ 读作「这整个圆的面积就是 $H(X)$ / $H(Y)$」；$H(X \mid Y)$ = 左圆里不属于 $H(Y)$ 的那块；$I(X;Y)$ = 两圆交叠；$H(X,Y)$ = 灰色两圆的并集。
> 来源：源书 PDF p153（书内 p141）"""

rep(A_82, N_82, "8.2")

# ------------------------------------------------------- Figure 8.3
A_83 = r"""[Figure 8.3：又一种会误导人的 entropy 表示（图 8.2 的续）。三个圆分别代表 $H(X)$、$H(Y)$、$H(Z)$，两两交叠；图中标出 $I(X; Y)$、$H(X \mid Y, Z)$、$A$、$I(X; Y \mid Z)$、$H(Y \mid X, Z)$、$H(Z \mid X)$、$H(Z \mid Y)$、$H(Z \mid X, Y)$ 等区域，其中 A 区被单独标出 —— 按文中例子，它必须取 $-1$ bit。]"""

N_83 = r"""![Figure 8.3](_assets/fig_156_fig8-3_venn_three.png)

> **Figure 8.3 图注**：Figure 8.3. A misleading representation of entropies, continued.　—　又一种会误导人的 entropy 表示（Figure 8.2 之续）。
> **图面要素**（按真图重转；占位把整幅当成「一张三圆图」，真图其实是**三个面板并列**，每个面板都是一组两两交叠的三圆，$H(X)$、$H(Y)$、$H(Z)$ 分别对应上左、上右、下三个圆）：
> 面板 1（左）—— 用**灰填充**标出 $H(X \mid Y, Z)$（左上月牙）与 $H(Y \mid X, Z)$（右上月牙），用**斜线纹**标出 $H(Z \mid X)$ 那一片；箭头从外面指进两圆交叠处并写 $I(X; Y)$。
> 面板 2（中）—— 三圆共同交集涂**交叉网格纹**，外部箭头标 $A$ 指向它；其下方的两圆交叠处涂**竖条纹**，箭头从上方标 $I(X; Y \mid Z)$；底部白底标签写 $H(Z \mid Y)$。
> 面板 3（右）—— 只画 $H(X)$ 与 $H(Y)$ 两圆并集外侧的**灰色环带**，白底标签 $H(X, Y \mid Z)$ 挂在顶部；下面另用白底标签 $H(Z \mid X, Y)$ 标出 $H(Z)$ 圆的独有部分。
> 为什么「更糟」：三变量时 Venn 图逼你给每一格分配一个面积，而 8.3 节的教学例子里，网格纹区域 $A$ 被算成 $-1$ bit —— 面积不可能为负，可见这套表示从一开始就不该被当真。
> **图内标签对照**：$H(X)$/$H(Y)$/$H(Z)$ = 三个圆的整体面积；$H(X \mid Y, Z)$、$H(Y \mid X, Z)$、$H(Z \mid X)$、$H(Z \mid Y)$、$H(Z \mid X, Y)$、$H(X,Y \mid Z)$ = 各块条件熵区；$I(X; Y)$、$I(X; Y \mid Z)$ = 两圆（或两圆在给定 $Z$ 后）的交叠；$A$ = 三圆共同交集那一小块，按正文例子必须取负值。
> 来源：源书 PDF p156（书内 p144）"""

rep(A_83, N_83, "8.3")

# ------------------------------------------------------- Figure 9.1
A_91 = r"""[Figure 9.1：一个完整的通信系统框图。自上而下的数据流：`Source` → `Source coding`（其内部是 `Compressor`）→ `Channel coding`（其内部是 `Encoder`）→ 标着 $E$ 的 `Noisy channel` → `Decoder` → `Decompressor` → 交付端。箭头之间的标注为：源到压缩器之间是原始文本，压缩器到编码器之间是压缩后的 bit 串，编码器送入信道的是受保护的码字，信道输出送进解码器，解压后还原出文本。]"""

N_91 = r"""![Figure 9.1](_assets/fig_158_fig9-1_system_diagram.png)

> **Figure 9.1 图注**：原书此图**没有图注**（直接排在 9.1 节标题之下）。　—　一个完整的通信系统框图：数据从左列自上而下、经底部信道、再从右列自下而上回到输出。
> **图面要素**（按真图重转；占位与真图不符，逐条见下）：U 形回路，六个方框 ——
> 左列自上而下：`Source`（从图上方一支箭头进入）→ `Compressor` → `Encoder`；
> 底部中央：`Noisy channel`（`Encoder` 出口向下、折向右进入；出口向右、折向上）；
> 右列自下而上：`Decoder` → `Decompressor` → 顶部一支向外箭头（交付端）。
> 左列外侧有两行小型大写灰字做分组：`SOURCE CODING` 与 `Compressor` 齐平，`CHANNEL CODING` 与 `Encoder` 齐平。注意右列**没有**对应的分组标签。
> **占位与真图的差异**：① 真图上没有任何 $E$ 标签，`Noisy channel` 框里只有这两行字；② `SOURCE CODING` / `CHANNEL CODING` 不是把方框套起来的容器框，而是左列外的小字分组标签；③ 数据流不是「自上而下」一条直线，而是左降右升的 U 形；④ 真图上**没有任何箭头文字标注**（原始文本 / 压缩后的 bit 串 / 受保护码字这些描述是正文里的，不在图里）。
> **图内标签对照**：`Source` = 信源；`Compressor` = 压缩器（source encoder）；`Encoder` = 信道编码器；`Noisy channel` = 有噪信道；`Decoder` = 信道解码器；`Decompressor` = 解压器；`SOURCE CODING` = 信源编码；`CHANNEL CODING` = 信道编码。
> 来源：源书 PDF p158（书内 p146）"""

rep(A_91, N_91, "9.1")

with open(MD, "w", encoding="utf-8", newline="\n") as f:
    f.write(s)
print("part 2 written; len", n0, "->", len(s))
