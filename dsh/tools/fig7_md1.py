# -*- coding: utf-8 -*-
"""Replace [Figure ...] placeholders in MacKay p141-160 with real PNGs + bilingual captions,
and insert the unnumbered figures (Part II frontispiece, exercise 8.6 square plot,
the four inline channel diagrams of section 9.3)."""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
BASE = r"C:/Users/27063/Documents/翻译产出/教材/MacKay信息论"
MD = os.path.join(BASE, "MacKay信息论_p141-160.bilingual.md")

with open(MD, encoding="utf-8") as f:
    s = f.read()
orig = s

used = []


def rep(anchor, new, label):
    """Anchor replace with count==1 assertion."""
    global s
    n = s.count(anchor)
    assert n == 1, f"[{label}] anchor count={n} (expected 1)"
    s = s.replace(anchor, new, 1)
    used.append(label)
    print("OK", label)


# ---------------------------------------------------------------- 1. Figure 6.11
A_611 = r"""[Figure 6.11：一个 entropy 低、却不能被 Lempel-Ziv 很好压缩的 source。位序列从左往右读，每一行与上一行在 $f = 5\%$ 的 bit 上不同。图像宽度为 400 像素。]"""

N_611 = r"""![Figure 6.11](_assets/fig_141_fig6-11_low_entropy_source.png)

> **Figure 6.11 图注**：Figure 6.11. A source with low entropy that is not well compressed by Lempel–Ziv. The bit sequence is read from left to right. Each line diﬀers from the line above in f = 5% of its bits. The image width is 400 pixels.　—　一个 entropy 低、却不能被 Lempel–Ziv 好好压缩的 source。位序列从左往右读。每一行与上一行在 $f = 5\%$ 的 bit 上不同。图像宽度为 400 像素。
> **图面要素**：400 列 × 100 行的纯黑白位图（每格 0.9 pt，整幅 360 × 90 pt）。相邻两行只差 5% 的 bit，所以把 100 行叠起来看是密集的竖条纹：同一列在上下相邻行里几乎不变，这就是「长程横向相关」的视觉形态 —— 逐像素扫描喂给 Lempel-Ziv 时，要等长度 2w（≈ 2 行）的串凑巧全出现过才能吃到这份冗余。图上没有坐标轴、没有刻度、没有图例。
> **图内标签对照**：图内无任何文字标签；黑 = 1、白 = 0。
> 来源：源书 PDF p141（书内 p129）"""

rep(A_611, N_611, "6.11")

# ---------------------------------------------------------------- 2. Figure 6.12
A_612 = r"""[Figure 6.12：由随机撒在平面上的水平与竖直「针」构成的纹理。图中可见长短不一的横线与竖线交错分布，形成同时具有横向与纵向长程相关的图案。]"""

N_612 = r"""![Figure 6.12](_assets/fig_142_fig6-12_pins_texture.png)

> **Figure 6.12 图注**：Figure 6.12. A texture consisting of horizontal and vertical pins dropped at random on the plane.　—　一种由随机撒在平面上的水平与竖直「针」构成的纹理。
> **图面要素**：同样是 400 列 × 100 行的二值位图。每根「针」是一段长度随机的横线或竖线，位置在平面上随机撒落、并且互相覆盖，于是同一行里既有被横针拉长的同色段、也能被竖针截断；同一列同理。结果是横向与纵向**同时**存在长程相关 —— 这正是 Lempel-Ziv 的软肋：抓一个方向就必须放弃另一个方向的记忆。图上无坐标轴、无标签。
> **图内标签对照**：图内无任何文字标签；黑 = 1、白 = 0。
> 来源：源书 PDF p142（书内 p130）"""

rep(A_612, N_612, "6.12")

# ---------------------------------------------------------------- 3. Figure 6.13
A_613 = r"""[Figure 6.13：受挫三角 Ising model 的某个基态。三角形晶格上每个格点取两种状态之一，图上用两种灰度表示；由于三角格子的拓扑，无法让每条边两端的格点都取相反状态，于是出现受挫结构，图案在横向与纵向同时呈现相关。]"""

N_613 = r"""![Figure 6.13](_assets/fig_142_fig6-13_frustrated_ising.png)

> **Figure 6.13 图注**：Figure 6.13. Frustrated triangular Ising model in one of its ground states.　—　处于某个基态的受挫三角 Ising model。
> **图面要素**（按真图重转；占位所写的「两种灰度」与真图不符 —— 真图是**纯黑白二值**，没有灰度级）：整幅由三角晶格铺成，每个格点上的二值块即为该格点的 spin 取向（黑 / 白）。看得出来的规律是：任意一个由三个格点构成的最小三角单元里，**不可能三个格点两两异色**，至少有一对同色 —— 这就是 frustration（受挫）：想让每条边两端反平行，在三角格子上做不到，于是图案既不是棋盘格、也不是随机噪声，而是横向纵向同时带长程相关的冻结纹理。图上无坐标轴、无标签、无图例。
> **图内标签对照**：图内无任何文字标签；黑 / 白 = 三角晶格每个格点的两个 spin 取值。
> 来源：源书 PDF p142（书内 p130）"""

rep(A_613, N_613, "6.13")

# ---------------------------------------------------------------- 4. Figure 6.14
A_614 = r"""[Figure 6.14：一个 400 个格子的元胞自动机 100 步的时间历史。横轴是格子序号（0 到 400），纵轴是时间步（自上而下 100 步），黑白两色表示每个格子在每一步的状态；图案显示由随机更新规则产生的斜向传播结构。]"""

N_614 = r"""![Figure 6.14](_assets/fig_143_fig6-14_cellular_automaton.png)

> **Figure 6.14 图注**：Figure 6.14. The 100-step time-history of a cellular automaton with 400 cells.　—　一个 400 格元胞自动机的 100 步时间历史。
> **图面要素**（按真图重转；占位所写的「横轴 0 到 400 / 纵轴 100 步」的坐标刻度在真图上**并不存在**）：400 列 × 100 行的二值位图，一行 = 一个时间步（自上而下推进），一列 = 一个格子。更新规则是随机选定的、每个格子的新状态取决于它前面五个格子；因此上半部能清楚看到斜向（光锥状）的传播结构 —— 一条初始的「扰动」以有限速度向两侧扩散；到下半部流已越过边界多次、图案趋于统计均匀。这条「时间轴长度不影响 information content」的事实，正是这道题要你压缩的对象。图上无坐标轴、无刻度。
> **图内标签对照**：图内无任何文字标签；黑 / 白 = 格子的两个状态。
> 来源：源书 PDF p143（书内 p131）"""

rep(A_614, N_614, "6.14")

with open(MD, "w", encoding="utf-8", newline="\n") as f:
    f.write(s)
print("part 1 written; len", len(orig), "->", len(s))
