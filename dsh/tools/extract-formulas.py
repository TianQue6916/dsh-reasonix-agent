# -*- coding: utf-8 -*-
"""抽取 md 里的公式（行内 $...$ 与 ```math 块），输出 JSON 供 KaTeX 校验。
v2（2026-10-28）：改为行级状态机，修掉 v1 的致命缺陷——v1 用 re.sub("```.*?```","",d,flags=S)
剥围栏，在真实讲义上会把大段正文一起吞掉（实测某份 126 个 $ 只剩 10 个，漏检 82% 公式）。
"""
import os, sys, json, re
BS = chr(92)
FENCE = chr(96) * 3

def extract(path):
    lines = open(path, encoding="utf-8", errors="replace").read().split(chr(10))
    out = []
    infence = False
    kind = None
    buf = []
    for i, line in enumerate(lines, 1):
        s = line.strip()
        if s.startswith(FENCE):
            if not infence:
                infence = True
                kind = s[len(FENCE):].strip().lower()
                buf = []
            else:
                if kind.startswith("math"):
                    body = chr(10).join(buf)
                    if body.strip():
                        out.append({"kind": "block", "tex": body, "line": i})
                infence = False
                kind = None
                buf = []
            continue
        if infence:
            buf.append(line)
            continue
        s2 = re.sub(FENCE, "", line)
        s2 = re.sub(chr(96) + "[^" + chr(96) + chr(10) + "]*" + chr(96), "", s2)
        s2 = re.sub("<[a-zA-Z/!][^>]*>", "", s2)
        s2 = s2.replace(BS + "$", "")
        parts = s2.split("$")
        for j in range(1, len(parts) - 1, 2):
            t = parts[j]
            if t.strip():
                out.append({"kind": "inline", "tex": t, "line": i})
    return out

if __name__ == "__main__":
    root = sys.argv[1]; dst = sys.argv[2]
    files = []
    for dp, dn, fn in os.walk(root):
        if ".reasonix" in dp: continue
        for f in fn:
            if f.endswith(".bilingual.md"): files.append(os.path.join(dp, f))
    allf = {}
    for p in files:
        try: e = extract(p)
        except Exception: e = []
        if e: allf[p] = e
    json.dump(allf, open(dst, "w", encoding="utf-8"), ensure_ascii=False)
    n = sum(len(v) for v in allf.values())
    print("files %d, formulas %d" % (len(allf), n))
