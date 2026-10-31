import re, os
D = r"C:/Users/27063/Documents/翻译产出/教材/Boyd凸优化"
PDF = r"D:/gh-publish/Convex-Optimization-EE364a/01-教材/Convex Optimization (Boyd, Vandenberghe).pdf"
FS = ["Boyd凸优化_p121-140.bilingual.md","Boyd凸优化_p141-160.bilingual.md",
      "Boyd凸优化_p161-180.bilingual.md","Boyd凸优化_p181-200.bilingual.md"]
import fitz
doc = fitz.open(PDF)

def eqnums(s):
    return re.findall(r"\((\d\.\d{1,2})\)", s)

for f in FS:
    t = open(os.path.join(D, f), encoding="utf-8").read()
    lo = int(re.search(r"p(\d+)-", f).group(1))       # pdf page, 1-based
    hi = lo + 19
    raw = "".join(doc[i - 1].get_text() for i in range(lo, hi + 1))
    me = eqnums(t)
    pe = eqnums(raw)
    ms, ps = set(me), set(pe)
    print("=" * 70)
    print(f, "PDF pages", lo, "-", hi, "= book p.%d-%d" % (lo - 14, hi - 14))
    print(" md eq refs:", len(me), "uniq", len(ms))
    print(" pdf eq refs:", len(pe), "uniq", len(ps))
    print(" in PDF not in md:", sorted(ps - ms))
    print(" in md not in PDF:", sorted(ms - ps))
