# -*- coding: utf-8 -*-
"""CJK 覆盖率审计：正文自由文本行中带中文的比例。健康值 >80%。
低值 = 该文件（或该段）几乎没翻译。
用法: python cjk-ratio.py <root>
"""
import os, sys, re, json
CJK = re.compile("[一-鿿]")
ENW = re.compile(r"[A-Za-z]{2,}")

def analyse(path, win=80):
    lines = open(path, encoding="utf-8", errors="replace").read().split(chr(10))
    infence = False
    free = []   # (lineno, has_cjk)
    for i, l in enumerate(lines, 1):
        s = l.strip()
        if s.startswith("```"):
            infence = not infence; continue
        if infence or not s: continue
        if s.startswith(("|", "<!--", "<span", "!", "[")): continue
        if "$" in s and len(CJK.findall(s)) == 0: continue
        if len(ENW.findall(s)) < 2 and not CJK.search(s): continue
        free.append((i, bool(CJK.search(s))))
    n = len(free)
    if n < 40: return None
    total = sum(1 for _, c in free if c) / n
    worst_win, worst_at = 1.0, 0
    for k in range(0, max(1, n - win), 20):
        seg = free[k:k + win]
        if len(seg) < win // 2: break
        r = sum(1 for _, c in seg if c) / len(seg)
        if r < worst_win: worst_win, worst_at = r, seg[0][0]
    return dict(free_lines=n, cjk_ratio=round(total, 3), worst_win=round(worst_win, 3), worst_at=worst_at)

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
            try: r = analyse(p)
            except Exception: r = None
            if r: out[p] = r
    print("CJKJSON:" + json.dumps(out, ensure_ascii=False))
    print("scanned %d files (%d analysed)" % (files, len(out)), file=sys.stderr)
    bad = sorted(((v["worst_win"], v["cjk_ratio"], k) for k, v in out.items()))
    print(chr(10) + "worst 20 by window ratio:", file=sys.stderr)
    for w, t, k in bad[:20]:
        print("  win %-5s overall %-5s %s" % (w, t, os.path.basename(k)[:64]), file=sys.stderr)
    low = [k for k, v in out.items() if v["cjk_ratio"] < 0.75]
    print(chr(10) + "overall <75%% : %d files" % len(low), file=sys.stderr)
