# -*- coding: utf-8 -*-
"""Print verbatim caption blocks (page, y-window, x-window)."""
import sys
import fitz

sys.stdout.reconfigure(encoding="utf-8")
PDF = r"C:/Users/27063/Documents/源料-教材/MacKay信息论/MacKay信息论_p141-160.pdf"
doc = fitz.open(PDF)

TARGETS = [
    (1, (465, 505), (60, 470)),
    (2, (204, 220), (60, 470)),
    (2, (378, 418), (405, 550)),
    (3, (204, 220), (60, 470)),
    (12, (106, 155), (405, 550)),
    (13, (238, 275), (405, 550)),
    (16, (106, 145), (405, 550)),
    (18, (255, 300), (60, 400)),
    (11, (735, 800), (60, 470)),
]
for pno, (y0, y1), (x0, x1) in TARGETS:
    page = doc[pno - 1]
    win = fitz.Rect(x0, y0, x1, y1)
    print("=" * 70)
    print(f"PDF p{pno}  win={win}")
    d = page.get_text("dict")
    for b in d["blocks"]:
        if b.get("type") == 1:
            continue
        bb = fitz.Rect(b["bbox"])
        if not (win & bb).is_empty and (win & bb).get_area() > 0.3 * bb.get_area():
            txt = " ".join("".join(s["text"] for s in l["spans"]) for l in b["lines"])
            print(f"  [{bb.x0:.1f},{bb.y0:.1f},{bb.x1:.1f},{bb.y1:.1f}] {txt}")
doc.close()
