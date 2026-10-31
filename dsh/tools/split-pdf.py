# -*- coding: utf-8 -*-
"""把大 PDF 切成 20 页一组的块，供 subagent 逐块翻译。
用法: python split-pdf.py <src.pdf> <outdir> [pages_per_chunk]
"""
import os, sys
import fitz

def split(src, outdir, per=20):
    doc = fitz.open(src)
    n = len(doc)
    base = os.path.splitext(os.path.basename(src))[0]
    base = base.replace(" ", "_").replace("(", "").replace(")", "").replace(",", "")[:40]
    os.makedirs(outdir, exist_ok=True)
    made = []
    for s in range(0, n, per):
        e = min(s + per, n)
        part = fitz.open()
        part.insert_pdf(doc, from_page=s, to_page=e - 1)
        name = "%s_p%03d-%03d.pdf" % (base, s + 1, e)
        p = os.path.join(outdir, name)
        part.save(p)
        part.close()
        made.append((name, e - s))
    doc.close()
    return n, made

if __name__ == "__main__":
    src, outdir = sys.argv[1], sys.argv[2]
    per = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    n, made = split(src, outdir, per)
    print("%s: %d pages -> %d chunks of <=%d" % (os.path.basename(src), n, len(made), per))
    for name, k in made: print("   ", name, k, "p")
