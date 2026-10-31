# -*- coding: utf-8 -*-
"""全库「整块未译」扫描：找连续 N 行无 CJK 但含 >=3 英文词的段落。
排除：代码围栏、math 围栏、表格行、引用来源行、URL、纯公式行。
用法: python scan-untranslated.py <root>
"""
import os, sys, re, json

CJK = re.compile("[一-鿿]")
EN_WORD = re.compile(r"[A-Za-z]{2,}")
SKIP_PREFIX = ("|", ">", "#", "-", "*", "```", "<!--", "<span", "http", "$$")

def blocks(path, minrun=8):
    lines = open(path, encoding="utf-8", errors="replace").read().split(chr(10))
    infence = False
    runs, cur = [], []
    for i, l in enumerate(lines, 1):
        s = l.strip()
        if s.startswith("```"):
            infence = not infence
            if cur: runs.append(cur); cur = []
            continue
        if infence:
            continue
        bad = (s and not CJK.search(s) and len(EN_WORD.findall(s)) >= 3
               and not s.startswith(SKIP_PREFIX) and "$" not in s)
        if bad:
            cur.append((i, s))
        else:
            if len(cur) >= minrun: runs.append(cur)
            cur = []
    if len(cur) >= minrun: runs.append(cur)
    return runs

if __name__ == "__main__":
    root = sys.argv[1]
    out = {}
    files = 0
    for dp, dn, fn in os.walk(root):
        if ".reasonix" in dp: continue
        for f in fn:
            if not f.endswith(".bilingual.md"): continue
            files += 1
            p = os.path.join(dp, f)
            try: r = blocks(p)
            except Exception: continue
            if r:
                tot = sum(len(x) for x in r)
                out[p] = [(x[0][0], x[-1][0], len(x)) for x in r]
    print("SCANJSON:" + json.dumps(out, ensure_ascii=False))
    print("scanned %d files, %d with untranslated blocks" % (files, len(out)), file=sys.stderr)
    rows = sorted(((sum(b[2] for b in v), len(v), os.path.basename(k), k) for k, v in out.items()), reverse=True)
    print(chr(10) + "top offenders (rows, blocks, file):", file=sys.stderr)
    for rows_n, nb, name, k in rows[:20]:
        print("  %5d rows / %2d blocks  %s" % (rows_n, nb, name[:62]), file=sys.stderr)
