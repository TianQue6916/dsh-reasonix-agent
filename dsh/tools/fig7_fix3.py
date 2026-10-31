# -*- coding: utf-8 -*-
"""Two textual fixes in fig7_md3.py: escape-safe -log P, and mark the four-channel
block as an explicit 补图说明 quote so it cannot be mistaken for translated prose."""
import pathlib

p = pathlib.Path(r"C:/Users/27063/.dsh/tools/fig7_md3.py")
s = p.read_text(encoding="utf-8")

old1 = r"""（不是 bit 数、不是 $-\\log P$）。"""
new1 = r"""（不是 bit 数、不是 $-\log P$）。"""
assert s.count(old1) == 1, s.count(old1)
s = s.replace(old1, new1)

old2 = r"""（下面四张是原书 9.3 节的四幅 **inline 图示**：原书无编号、无图注，每幅都是一行「信道名 + 两侧 alphabet + 转移图 + 转移概率 + 转移矩阵图」。占位原本只留了 Binary erasure channel 一幅，实际是四幅。）"""
new2 = r"""> **补图说明**：下面四张是原书 9.3 节的四幅 **inline 图示** —— 原书无编号、无图注，每幅都是一行「信道名 + 两侧 alphabet + 转移图 + 转移概率 + 转移矩阵图」。原先的文本占位只留了 Binary erasure channel 一幅，实际是四幅；本块按原书顺序（BSC → BEC → noisy typewriter → Z channel）全部补上。"""
assert s.count(old2) == 1, s.count(old2)
s = s.replace(old2, new2)

p.write_text(s, encoding="utf-8")
print("fixed")
for ln in s.splitlines():
    if "log P" in ln or "补图说明" in ln:
        print("  >", ln[:120])
