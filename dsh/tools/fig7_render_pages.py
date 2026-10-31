# -*- coding: utf-8 -*-
"""Render full pages (downscaled) for visual inspection."""
import sys, os, fitz

sys.stdout.reconfigure(encoding="utf-8")
PDF = r"C:/Users/27063/Documents/源料-教材/MacKay信息论/MacKay信息论_p141-160.pdf"
OUT = r"C:/Users/27063/AppData/Local/Temp/fig7pages"
os.makedirs(OUT, exist_ok=True)
pages = [int(x) for x in sys.argv[1:]] or list(range(1, 21))
doc = fitz.open(PDF)
for p in pages:
    page = doc[p - 1]
    pix = page.get_pixmap(dpi=150)
    path = os.path.join(OUT, f"p{p:02d}.png")
    pix.save(path)
    print(path, pix.width, pix.height, os.path.getsize(path))
doc.close()
