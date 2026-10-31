# -*- coding: utf-8 -*-
"""Final inventory of the 14 cropped figures (pixels / bytes) for the report."""
import os
from PIL import Image

BASE = r"C:/Users/27063/Documents/翻译产出/教材/MacKay信息论/_assets"
NAMES = [
    "fig_141_fig6-11_low_entropy_source.png",
    "fig_142_fig6-12_pins_texture.png",
    "fig_142_fig6-13_frustrated_ising.png",
    "fig_143_fig6-14_cellular_automaton.png",
    "fig_149_partII_frontispiece.png",
    "fig_152_ex8-6_probability_squares.png",
    "fig_152_fig8-1_entropy_bars.png",
    "fig_153_fig8-2_venn_two.png",
    "fig_156_fig8-3_venn_three.png",
    "fig_158_fig9-1_system_diagram.png",
    "fig_160_ch_bsc.png",
    "fig_160_ch_bec.png",
    "fig_160_ch_typewriter.png",
    "fig_160_ch_zchannel.png",
]
tot = 0
for n in NAMES:
    p = os.path.join(BASE, n)
    w, h = Image.open(p).size
    b = os.path.getsize(p)
    tot += b
    print(f"{n:52s} {w:5d}x{h:<5d} {b/1024:7.1f} KB")
print("total %.1f KB" % (tot / 1024))
