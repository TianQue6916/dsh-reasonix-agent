# -*- coding: utf-8 -*-
"""未译英文行审计（v3，排除 LaTeX）：正文行中「无 CJK、无反斜杠、无 $、含 >=5 英文词」的比例。
用法: python untr-v3.py <root>
"""
import os, sys, re, json
CJK = re.compile("[一-鿿]")
ENW = re.compile(r"[A-Za-z]{3,}")
BS = chr(92)

def analyse(path):
    lines = open(path, encoding="utf-8", errors="replace").read().split(chr(10))
    infence = False
    tot = untr = 0
    samples = []
    for i, l in enumerate(lines, 1):
        s = l.strip()
        if s.startswith("```"):
            infence = not infence; continue
        if infence or not s: continue
        if s.startswith(("|", "<!--", "<span", "!", "[", "#")): continue
        s2 = s.lstrip("> ").strip()
        if not s2 or s2.startswith(("|", "<")): continue
        if BS in s2 or "$" in s2: continue
        if len(ENW.findall(s2)) < 5: continue
        if CJK.search(s2): continue
        tot += 1
        untr += 1
        if len(samples) < 3: samples.append((i, s2[:100]))
    # 分母：所有「非公式正文行」
    infence = False
    base = 0
    for l in lines:
        s = l.strip()
        if s.startswith("```"):
            infence = not infence; continue
        if infence or not s: continue
        if s.startswith(("|", "<!--", "<span", "!", "[", "#")): continue
        s2 = s.lstrip("> ").strip()
        if not s2 or BS in s2 or "$" in s2: continue
        if len(ENW.findall(s2)) + len(CJK.findall(s2)) < 3: continue
        base += 1
    return dict(base=base, untr=untr, ratio=round(untr / base, 3) if base else 0.0, samples=samples)

if __name__ == "__main__":
    root = sys.argv[1]
    out = {}
    for dp, dn, fn in os.walk(root):
        if ".reasonix" in dp: continue
        for f in fn:
            if not f.endswith(".bilingual.md"): continue
            p = os.path.join(dp, f)
            try: r = analyse(p)
            except Exception: continue
            if r["base"] >= 20: out[p] = r
    print("UNTRJSON:" + json.dumps(out, ensure_ascii=False))
    print("files analysed: %d" % len(out), file=sys.stderr)
    bad = sorted(((v["ratio"], v["untr"], v["base"], k) for k, v in out.items()), reverse=True)
    print(chr(10) + "top 20 untranslated ratio:", file=sys.stderr)
    for r, u, b, k in bad[:20]:
        print("  %5.1f%%  %4d/%-4d %s" % (r * 100, u, b, os.path.basename(k)[:60]), file=sys.stderr)
    hi = [k for k, v in out.items() if v["ratio"] > 0.15]
    print(chr(10) + "files with >15%% untranslated: %d" % len(hi), file=sys.stderr)
