# -*- coding: utf-8 -*-
"""双语成品静态审计（全量、可判定，不依赖 LLM）"""
import os, sys, json, re, collections

CJK = re.compile("[一-鿿]")
BS = chr(92)
BAD2PT = BS + BS + "[2pt]"
BR = BS + "["
EN_LINE = re.compile("^[A-Za-z][A-Za-z0-9 ,;:'\"()\-\.]{20,}$")
TAGS = ["[theorem]", "[definition]", "[proof]", "[lemma]", "[section]", "[info]", "[lecture]", "[example]", "[corollary]"]
TERMS = {
    "matrix": ("矩阵",), "eigenvalue": ("特征值",), "vector": ("向量",),
    "theorem": ("定理",), "proof": ("证明",), "definition": ("定义",),
    "convex": ("凸",), "probability": ("概率",), "random variable": ("随机变量",),
    "sequence": ("数列", "序列"), "converge": ("收敛",), "integral": ("积分",),
    "derivative": ("导数",), "compact": ("紧",), "metric": ("度量",),
    "complexity": ("复杂度",), "congestion": ("拥塞",), "protocol": ("协议",),
    "metric space": ("度量空间",), "open set": ("开集",), "power series": ("幂级数",),
    "isolated point": ("孤立点",), "eigenvector": ("特征向量",),
}

def audit(p):
    d = open(p, encoding="utf-8", errors="replace").read()
    body = re.sub(r"<[^>]+>", "", d)
    lines = [l.rstrip() for l in body.split(chr(10))]
    nonempty = [l for l in lines if l.strip()]
    rules = []
    run = maxrun = 0
    for l in lines:
        s = l.strip()
        if s and not CJK.search(s) and EN_LINE.match(s):
            run += 1; maxrun = max(maxrun, run)
        elif not s: continue
        else: run = 0
    if maxrun >= 4: rules.append("R9_en_block_%d" % maxrun)
    r2 = sum(1 for l in nonempty if CJK.search(l) and l[:1].isascii() and l[:1].isalpha() and " " in l[:20])
    if r2 >= 3: rules.append("R2_en_start_%d" % r2)
    if "$$" in body: rules.append("R6_dollar_dollar")
    bad = sum(1 for l in lines if (l.replace(chr(92)+"$", "").count("$")) % 2)
    if bad: rules.append("R7_odd_dollar_lines_%d" % bad)
    if BAD2PT in body: rules.append("R8_bad_2pt")
    elif BR in body: rules.append("R8_bracket_resid")
    if len(d) < 1200: rules.append("R11_short_%d" % len(d))
    if not any(t in d for t in TAGS): rules.append("R12_no_tags")
    low = body.lower()
    for en, zh in TERMS.items():
        n_zh = sum(body.count(z) for z in zh)
        if n_zh >= 5 and low.count(en) == 0: rules.append("R13_term_" + en.replace(" ", "_"))
    return rules

if __name__ == "__main__":
    root = sys.argv[1]
    files = []
    for dp, dn, fn in os.walk(root):
        if ".reasonix" in dp: continue
        for f in fn:
            if f.endswith(".bilingual.md"): files.append(os.path.join(dp, f))
    res = {}
    for p in files:
        try: r = audit(p)
        except Exception as e: r = ["ERR_" + str(e)]
        if r: res[p] = r
    print("AUDITJSON:" + json.dumps(res, ensure_ascii=False))
    print(chr(10) + "审计 %d 份，%d 份命中至少一条" % (len(files), len(res)), file=sys.stderr)
    cnt = collections.Counter()
    for v in res.values():
        for r in v: cnt[r.split("_")[0]] += 1
    print("按规则命中份数: " + str(dict(sorted(cnt.items()))), file=sys.stderr)
    detail = collections.Counter()
    for v in res.values():
        for r in v: detail[r] += 1
    print(chr(10) + "Top 细则:", file=sys.stderr)
    for k, v in detail.most_common(18): print("  %-26s %d" % (k, v), file=sys.stderr)
    bydir = collections.Counter(os.path.dirname(p) for p in res)
    print(chr(10) + "问题集中目录:", file=sys.stderr)
    for k, v in bydir.most_common(12): print("  %-58s %d" % (k[-58:], v), file=sys.stderr)
