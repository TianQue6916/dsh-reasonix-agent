# -*- coding: utf-8 -*-
import glob, os, sys
try:
    import fitz
except Exception:
    fitz = None
KEY = ["elements of information", "cover", "thomas", "information theory", "信息论"]
roots = [os.path.expanduser("~/课程资料"), os.path.expanduser("~/下载"), os.path.expanduser("~/文档"), os.path.expanduser("~/桌面")]
hits = []
n_scanned = 0
for r in roots:
    if not os.path.isdir(r): continue
    for f in glob.glob(os.path.join(r, "**", "*.pdf"), recursive=True):
        try:
            if os.path.getsize(f) < 300000: continue
        except Exception:
            continue
        n_scanned += 1
        b = os.path.basename(f).lower()
        if any(k in b for k in KEY):
            hits.append(("byname", 0, f)); continue
        if fitz:
            try:
                d = fitz.open(f); n = len(d)
                if n < 80:
                    d.close(); continue
                head = " ".join(d[i].get_text() for i in range(min(2, n))).lower()[:500]
                d.close()
                if any(k in head for k in KEY):
                    hits.append(("byhead", n, f))
            except Exception:
                pass
print("scanned %d pdf (>=300KB), hits %d" % (n_scanned, len(hits)))
for k, n, f in hits[:20]:
    print("  [%s] %4dp  %s" % (k, n, f))
