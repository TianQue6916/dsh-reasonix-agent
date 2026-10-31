# -*- coding: utf-8 -*-
"""Dump every text span / image block / drawing rect of one PDF page, sorted by y."""
import sys
import fitz

sys.stdout.reconfigure(encoding="utf-8")
PDF = r"C:/Users/27063/Documents/源料-教材/MacKay信息论/MacKay信息论_p141-160.pdf"
pno = int(sys.argv[1])
doc = fitz.open(PDF)
page = doc[pno - 1]
rows = []
d = page.get_text("dict")
for b in d["blocks"]:
    if b.get("type") == 1:
        r = fitz.Rect(b["bbox"])
        rows.append((r.y0, r.x0, "IMG", r, ""))
        continue
    for l in b["lines"]:
        r = fitz.Rect(l["bbox"])
        txt = "".join(s["text"] for s in l["spans"]).strip()
        if txt:
            rows.append((r.y0, r.x0, "TXT", r, txt))
for dr in (page.get_drawings() or []):
    r = fitz.Rect(dr["rect"])
    if r.width < 0.2 and r.height < 0.2:
        continue
    rows.append((r.y0, r.x0, "DRW", r, ""))
rows.sort(key=lambda t: (round(t[0], 1), t[1]))
for y0, x0, kind, r, txt in rows:
    print(f"{kind} y {r.y0:7.1f}-{r.y1:7.1f}  x {r.x0:7.1f}-{r.x1:7.1f}  {txt[:75]}")
doc.close()
