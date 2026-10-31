# -*- coding: utf-8 -*-
"""Estimate the bit-grid of the two raster figures (6.11, 6.14) from pixel runs."""
import numpy as np
from PIL import Image

BASE = r"C:/Users/27063/Documents/翻译产出/教材/MacKay信息论/_assets/"


def analyse(name):
    im = Image.open(BASE + name).convert("L")
    a = np.array(im)
    dark = a < 128
    # column profile: fraction of dark rows per column; find run-length period of the grid
    prof = dark.mean(axis=0).astype(np.float32)
    print(name, "size", a.shape, "dark frac", round(float(dark.mean()), 3))
    # transitions along the middle row tell the cell width
    mid = dark[dark.shape[0] // 2]
    xt = np.flatnonzero(np.diff(mid.astype(np.int8)))
    print("  mid-row transitions:", len(xt))
    if len(xt) > 4:
        gaps = np.diff(xt)
        print("  gap median:", float(np.median(gaps)), "min", int(gaps.min()), "max", int(gaps.max()))
    # row-wise: are rows uniform in width? estimate number of rows by looking for row-to-row
    # correlation pattern (each source row is a constant-height band)
    rowdark = dark.mean(axis=1)
    print("  row dark frac: min %.3f max %.3f" % (rowdark.min(), rowdark.max()))
    return prof


for n in ["fig_141_fig6-11_low_entropy_source.png", "fig_143_fig6-14_cellular_automaton.png"]:
    analyse(n)
    print()
