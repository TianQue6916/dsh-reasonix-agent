# -*- coding: utf-8 -*-
"""按 KaTeX 失败报告修 ```math 块与行内公式（保守规则，每处记录 before/after）"""
import os, sys, json, re, shutil

BS = chr(92)
TAG = BS + "tag"
ALL = BS + "*"
HF = BS + "hfill"
SV = BS + "SigmaV"
INOM = "inom{"
SPAN = "<span"

def fix_text(d):
    log = []
    # 1) ```math 块内处理
    def fix_block(m):
        inner = m.group(1)
        orig = inner
        # 块内 $ 一律删（块内不应有行内定界符）
        if "$" in inner:
            inner = inner.replace("$", "")
            log.append("block: removed $ inside math block")
        # 块内 <span> 截断
        if SPAN in inner:
            idx = inner.index(SPAN)
            inner = inner[:idx].rstrip() + chr(10)
            log.append("block: truncated at <span>")
        # 多个 	ag 只留第一个
        tags = list(re.finditer(re.escape(TAG) + r"\{[^}]*\}", inner))
        if len(tags) > 1:
            for t in reversed(tags[1:]):
                inner = inner[:t.start()] + inner[t.end():]
            log.append("block: dropped %d extra tag" % (len(tags) - 1))
        inner = inner.replace(BS + BS + "[2pt]", BS + BS)
        return "```math" + chr(10) + inner + "```"
    d = re.sub("```math" + chr(10) + "(.*?)```", fix_block, d, flags=re.S)
    # 2) 全局安全替换
    if ALL in d:
        d = d.replace(ALL, "*"); log.append("global: -" + ALL + " -> *")
    if HF in d:
        d = d.replace(HF, ""); log.append("global: removed -" + HF)
    if SV in d:
        d = d.replace(SV, BS + "Sigma V"); log.append("global: -SigmaV -> -Sigma V")
    if INOM in d and (BS + "binom{") not in d:
        d = d.replace(INOM, BS + "binom{"); log.append("global: inom{ -> -binom{")
    return d, log

if __name__ == "__main__":
    report = json.load(open(sys.argv[1], encoding="utf-8"))
    srcroot = sys.argv[2]
    work = sys.argv[3]
    os.makedirs(work, exist_ok=True)
    summary = []
    for f in report["bad"]:
        rel = os.path.relpath(f, srcroot)
        dst = os.path.join(work, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(f, dst)
        d = open(dst, encoding="utf-8", errors="replace").read()
        nd, log = fix_text(d)
        if nd != d:
            open(dst, "w", encoding="utf-8").write(nd)
        summary.append({"file": rel, "changed": nd != d, "actions": log})
    json.dump(summary, open(os.path.join(work, "_fixlog.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False, indent=1)[:3000])
