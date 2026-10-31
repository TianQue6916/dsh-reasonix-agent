import re, sys, os
from collections import Counter
D = r"C:/Users/27063/Documents/翻译产出/教材/Boyd凸优化"
FS = ["Boyd凸优化_p121-140.bilingual.md","Boyd凸优化_p141-160.bilingual.md",
      "Boyd凸优化_p161-180.bilingual.md","Boyd凸优化_p181-200.bilingual.md"]

def strip_math(s):
    s = re.sub(r"```math.*?```", "", s, flags=re.S)
    s = re.sub(r"\$[^$]*\$", "", s)
    return s

for f in FS:
    p = os.path.join(D, f)
    t = open(p, encoding="utf-8").read()
    print("=" * 70)
    print(f, "chars", len(t), "lines", t.count("\n") + 1)
    # page markers
    pm = re.findall(r"<!-- ===== p(\d+) ===== -->", t)
    print(" page markers:", len(pm), pm[:2], "...", pm[-2:])
    # gaps
    ints = [int(x) for x in pm]
    gaps = [b for a, b in zip(ints, ints[1:]) if b - a != 1]
    print(" page gaps:", gaps)
    # zh char ratio over whole doc
    zh = len(re.findall(r"[\u4e00-\u9fff]", t))
    print(" zh chars:", zh, "ratio %.2f" % (zh / len(t)))
    # 译注 paragraphs
    paras = [x for x in re.split(r"\n\s*\n", t) if "译注" in x]
    print(" 译注 blocks:", len(paras))
    for x in paras:
        b = re.sub(r"<[^>]+>", "", x)
        zhx = len(re.findall(r"[\u4e00-\u9fff]", b))
        print("    zh_len=%4d  head=%s" % (zhx, b[:34].replace("\n", " ")))
    # tags
    tags = Counter(re.findall(r"\*\*\[([\w \-]+)\]\*\*", t))
    print(" tags:", dict(tags))
    # structural issues
    print(" '$$':", t.count("$$") , " '[2pt]':", t.count("2pt]"), " '<div>':", t.count("<div>"))
    # headings
    for m in re.finditer(r"^(#{2,4}) (.+)$", t, flags=re.M):
        pass
