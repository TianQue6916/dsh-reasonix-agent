# -*- coding: utf-8 -*-
"""Probe p141-160: list drawings clusters + image blocks + caption candidates per page."""
import sys, fitz

sys.stdout.reconfigure(encoding="utf-8")
PDF = r"C:/Users/27063/Documents/源料-教材/MacKay信息论/MacKay信息论_p141-160.pdf"
doc = fitz.open(PDF)
print("page_count", doc.page_count)

for pno in range(doc.page_count):
    page = doc[pno]
    drw = page.get_drawings() or []
    imgs = page.get_images(full=True) or []
    print("=" * 70)
    print(f"PDF p{pno+1}  rect={page.rect}  drawings={len(drw)}  xobjects_img={len(imgs)}")
    # cluster drawings by proximity
    rects = []
    for d in drw:
        r = d["rect"]
        if r.width < 0.3 and r.height < 0.3:
            continue
        rects.append(r)
    # union-find clustering with 6pt gap
    GAP = 6.0
    n = len(rects)
    parent = list(range(n))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    def uni(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    def near(a, b, gap=GAP):
        return not (a.x1 + gap < b.x0 or b.x1 + gap < a.x0 or a.y1 + gap < b.y0 or b.y1 + gap < a.y0)
    for i in range(n):
        for j in range(i + 1, n):
            if near(rects[i], rects[j]):
                uni(i, j)
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(rects[i])
    clusters = []
    for g in groups.values():
        u = g[0]
        for r in g[1:]:
            u = u | r
        clusters.append((u, len(g)))
    clusters.sort(key=lambda t: (t[0].y0, t[0].x0))
    for u, c in clusters:
        if u.width * u.height < 40:
            continue
        print(f"   CLUSTER n={c:3d}  x0={u.x0:7.1f} y0={u.y0:7.1f} x1={u.x1:7.1f} y1={u.y1:7.1f}  w={u.width:6.1f} h={u.height:6.1f}")
    # captions
    d = page.get_text("dict")
    for b in d["blocks"]:
        if b.get("type") == 1:
            print(f"   IMAGEBLOCK bbox={b['bbox']}")
            continue
        txt = " ".join(s["text"] for l in b["lines"] for s in l["spans"]).strip()
        if not txt:
            continue
        if "Figure" in txt or "Table" in txt:
            bb = b["bbox"]
            print(f"   CAP y0={bb[1]:7.1f} y1={bb[3]:7.1f} x0={bb[0]:7.1f} x1={bb[2]:7.1f} :: {txt[:90]}")
doc.close()
