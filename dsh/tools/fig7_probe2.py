# -*- coding: utf-8 -*-
"""Probe v2: cluster ink (drawings + image blocks) after dropping text-rule slivers."""
import sys, fitz

sys.stdout.reconfigure(encoding="utf-8")
PDF = r"C:/Users/27063/Documents/源料-教材/MacKay信息论/MacKay信息论_p141-160.pdf"
doc = fitz.open(PDF)

SLIVER = 1.5     # min(w,h) below this -> line rule candidate
GAP = 8.0

for pno in range(doc.page_count):
    page = doc[pno]
    d = page.get_text("dict")
    lines = []
    for b in d["blocks"]:
        if b.get("type") == 1:
            continue
        for l in b["lines"]:
            bb = fitz.Rect(l["bbox"])
            txt = "".join(s["text"] for s in l["spans"]).strip()
            if txt:
                lines.append((bb, txt))

    items = []   # (rect, kind)
    for b in d["blocks"]:
        if b.get("type") == 1:
            items.append((fitz.Rect(b["bbox"]), "img"))
    for dr in (page.get_drawings() or []):
        items.append((fitz.Rect(dr["rect"]), "drw"))

    kept, dropped = [], 0
    for r, kind in items:
        if r.width < 0.2 and r.height < 0.2:
            dropped += 1
            continue
        sliver = min(r.width, r.height) < SLIVER
        if sliver:
            # drop if it hugs a text baseline / row (rule under text)
            hit = False
            for lb, t in lines:
                if r.y1 >= lb.y0 - 2.5 and r.y0 <= lb.y1 + 2.5 and not (r.x1 < lb.x0 - 3 or lb.x1 < r.x0 - 3):
                    hit = True
                    break
            if hit:
                dropped += 1
                continue
        kept.append((r, kind))

    # also include text lines that sit INSIDE figure area later; first cluster ink
    n = len(kept)
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
    def near(a, b):
        return not (a.x1 + GAP < b.x0 or b.x1 + GAP < a.x0 or a.y1 + GAP < b.y0 or b.y1 + GAP < a.y0)
    for i in range(n):
        for j in range(i + 1, n):
            if near(kept[i][0], kept[j][0]):
                uni(i, j)
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(kept[i])
    out = []
    for g in groups.values():
        u = g[0][0]
        for r, k in g[1:]:
            u = u | r
        if u.width * u.height < 300:
            continue
        out.append((u, len(g), sum(1 for r, k in g if k == "img")))
    out.sort(key=lambda t: (t[0].y0, t[0].x0))
    print("=" * 72)
    print(f"== PDF p{pno+1} (book p{pno+129})  ink_items={n} dropped_sliver={dropped} clusters={len(out)}")
    for u, c, ni in out:
        # which text lines are inside / just under
        inside = [t for lb, t in lines if u.contains(lb) or (lb & u).get_area() > 0.6 * lb.get_area()]
        below = [t for lb, t in lines if lb.y0 > u.y1 - 1 and lb.y0 < u.y1 + 26]
        print(f"  C n={c:3d} img={ni:3d} x0={u.x0:6.1f} y0={u.y0:6.1f} x1={u.x1:6.1f} y1={u.y1:6.1f} w={u.width:6.1f} h={u.height:6.1f}")
        if inside:
            print(f"      inside_txt: {' | '.join(inside)[:200]}")
        if below:
            print(f"      below_txt : {' | '.join(below)[:160]}")
doc.close()
