# -*- coding: utf-8 -*-
"""Move the Part II frontispiece block so it sits right AFTER the Part II heading
(book p137 places the fractal under the 'Part II / Noisy-Channel Coding' title),
not before the p150 page marker."""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
BASE = r"C:/Users/27063/Documents/翻译产出/教材/MacKay信息论"
MD = os.path.join(BASE, "MacKay信息论_p141-160.bilingual.md")
s = open(MD, encoding="utf-8").read()

BLOCK = r"""![Part II 扉页分形图](_assets/fig_149_partII_frontispiece.png)

> **图注**：原书此图**无编号、无图注** —— 它是 Part II 扉页（书内 p137）中央的装饰性分形图，与全书各 Part 扉页同一族。
> **图面要素**：一棵自相似的层级「树」：白描空心圆与实心黑块（V 形 / 梯形）交替出现在各层，用细线连成主干 + 分枝的结构；越往右下，元素越大、分枝越少，越小越密地聚在上方 —— 典型的分形递归展开。它不承载任何数据，纯粹是扉页版式。
> **图内标签对照**：图内无任何文字标签。
> 来源：源书 PDF p149（书内 p137）

"""

# 1) remove the block from its current place
assert s.count(BLOCK) == 1, "frontispiece block not found exactly once"
s = s.replace(BLOCK, "", 1)

# 2) re-insert after the Part II heading
ANCHOR = "# Part II ｜ Noisy-Channel Coding（有噪信道编码）\n\n"
assert s.count(ANCHOR) == 1, s.count(ANCHOR)
s = s.replace(ANCHOR, ANCHOR + BLOCK, 1)

open(MD, "w", encoding="utf-8", newline="\n").write(s)
print("moved; len", len(s))
