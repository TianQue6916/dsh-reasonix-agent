# -*- coding: utf-8 -*-
"""Crop figures from p141-160: strict in-window union (text spans + ink rects) + per-figure pad."""
import sys, os
import fitz

sys.stdout.reconfigure(encoding="utf-8")
PDF = r"C:/Users/27063/Documents/源料-教材/MacKay信息论/MacKay信息论_p141-160.pdf"
ASSETS = r"C:/Users/27063/Documents/翻译产出/教材/MacKay信息论/_assets"
DPI = 400

# name, pdf_page(1-based), window (x0,y0,x1,y1), pad_pt
WINDOWS = [
    ("fig_141_fig6-11_low_entropy_source",    1, (60, 364, 434, 466), 4.0),
    ("fig_142_fig6-12_pins_texture",          2, (60, 103, 434, 204), 4.0),
    ("fig_142_fig6-13_frustrated_ising",      2, (98, 375, 362, 512), 4.0),
    ("fig_143_fig6-14_cellular_automaton",    3, (60, 103, 434, 204), 4.0),
    ("fig_152_fig8-1_entropy_bars",          12, (126, 106, 332, 190), 4.0),
    ("fig_152_ex8-6_probability_squares",    12, (276, 576, 372, 692), 4.0),
    ("fig_153_fig8-2_venn_two",              13, (96, 236, 366, 318), 4.0),
    ("fig_156_fig8-3_venn_three",            16, (60, 104, 409, 222), 4.0),
    ("fig_158_fig9-1_system_diagram",        18, (114, 270, 344, 421), 3.0),
    ("fig_149_partII_frontispiece",           9, (240, 360, 450, 632), 4.0),
    ("fig_160_ch_bsc",                       20, (64, 126, 542, 180), 3.0),
    ("fig_160_ch_bec",                       20, (64, 183, 542, 248), 3.0),
    ("fig_160_ch_typewriter",                20, (88, 311, 517, 433), 3.0),
    ("fig_160_ch_zchannel",                  20, (64, 445, 542, 498), 3.0),
]


def collect(page, win):
    ws = fitz.Rect(win)
    rects, notes = [], []
    d = page.get_text("dict")
    for b in d["blocks"]:
        if b.get("type") == 1:
            r = fitz.Rect(b["bbox"])
            if ws.contains(r):
                rects.append(r)
                notes.append(("img", r, ""))
            continue
        for l in b["lines"]:
            r = fitz.Rect(l["bbox"])
            txt = "".join(s["text"] for s in l["spans"]).strip()
            if txt and ws.contains(r):
                rects.append(r)
                notes.append(("txt", r, txt))
    for dr in (page.get_drawings() or []):
        r = fitz.Rect(dr["rect"])
        if r.width < 0.2 and r.height < 0.2:
            continue
        if ws.contains(r):
            rects.append(r)
            notes.append(("drw", r, ""))
    if not rects:
        return None, []
    u = rects[0]
    for r in rects[1:]:
        u = u | r
    return u, notes


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "dump"
    only = sys.argv[2] if len(sys.argv) > 2 else None
    doc = fitz.open(PDF)
    os.makedirs(ASSETS, exist_ok=True)
    for name, pno, win, pad in WINDOWS:
        if only and only not in name:
            continue
        page = doc[pno - 1]
        u, notes = collect(page, win)
        print("=" * 78)
        print(f"{name}  PDF p{pno}  window={win}")
        if u is None:
            print("  !! NOTHING inside window")
            continue
        n = {k: sum(1 for kk, _, _ in notes if kk == k) for k in ("txt", "img", "drw")}
        print(f"  strict union = ({u.x0:.1f}, {u.y0:.1f}, {u.x1:.1f}, {u.y1:.1f}) "
              f"w={u.width:.1f} h={u.height:.1f}  {n}")
        clip = fitz.Rect(u.x0 - pad, u.y0 - pad, u.x1 + pad, u.y1 + pad) & page.rect
        print(f"  clip = ({clip.x0:.1f}, {clip.y0:.1f}, {clip.x1:.1f}, {clip.y1:.1f})")
        if mode == "crop":
            pix = page.get_pixmap(dpi=DPI, clip=clip)
            out = os.path.join(ASSETS, name + ".png")
            pix.save(out)
            print(f"  SAVED {name}.png  {pix.width}x{pix.height}  {os.path.getsize(out)} bytes")
    doc.close()


main()
