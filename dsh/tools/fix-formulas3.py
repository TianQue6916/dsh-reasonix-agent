# -*- coding: utf-8 -*-
"""v3 = v1 的安全修复 + 三条定点规则（不做 aligned 包裹、不删引用符）"""
import os, sys, json, re, shutil
BS = chr(92)
CJK = re.compile("[一-鿿＀-￯]")
SAFE_CMD = ["lg", "ln", "log", "Theta", "tau", "lambda", "sigma", "Omega", "sin", "cos", "max", "min", "le", "ge", "neq", "in", "sum"]

def fix_text_cmds(d, log):
    def rep(m):
        inner = m.group(1); o = inner
        for c in sorted(SAFE_CMD, key=len, reverse=True):
            inner = inner.replace(BS + c, c)
        if inner != o: log.append("text{}: degraded safe command")
        return BS + "text{" + inner + "}"
    return re.sub(re.escape(BS) + r"text\{([^{}]*)\}", rep, d)

def fix_inline_cjk(d, log):
    out = []
    for i, line in enumerate(d.split(chr(10))):
        if line.count("$") >= 2:
            parts = line.split("$")
            for j in range(1, len(parts) - 1, 2):
                if CJK.search(parts[j]):
                    a = parts[j]; m = CJK.search(a)
                    parts[j] = a[:m.start()]; parts[j + 1] = a[m.start():] + parts[j + 1]
                    log.append("inline L%d: CJK moved out of math" % (i + 1))
            line = "$".join(parts)
        out.append(line)
    return chr(10).join(out)

if __name__ == "__main__":
    report = json.load(open(sys.argv[1], encoding="utf-8"))
    srcroot, work = sys.argv[2], sys.argv[3]
    if os.path.isdir(work): shutil.rmtree(work)
    os.makedirs(work, exist_ok=True)
    summary = []
    for f in report["bad"]:
        rel = os.path.relpath(f, srcroot); dst = os.path.join(work, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(f, dst)
        d = open(dst, encoding="utf-8", errors="replace").read(); log = []
        # v1 安全规则
        def blk(m):
            inner = m.group(1)
            if "$" in inner: inner = inner.replace("$", ""); log.append("block: removed $")
            TAG = BS + "tag"
            tags = list(re.finditer(re.escape(TAG) + r"\{[^}]*\}", inner))
            if len(tags) > 1:
                for t in reversed(tags[1:]): inner = inner[:t.start()] + inner[t.end():]
                log.append("block: dropped extra tag")
            if "<span" in inner:
                inner = inner[:inner.index("<span")].rstrip() + chr(10); log.append("block: truncated at span")
            return "```math" + chr(10) + inner + "```"
        d = re.sub("```math" + chr(10) + "(.*?)```", blk, d, flags=re.S)
        d = d.replace(BS + "*", "*").replace(BS + "hfill", "")
        d = d.replace(BS + "SigmaV", BS + "Sigma V")
        # v3 定点
        d = fix_text_cmds(d, log)
        d = fix_inline_cjk(d, log)
        d = re.sub("(?<!" + re.escape(BS) + ")inom" + re.escape("{"), BS + "binom{", d)
        if d != open(f, encoding="utf-8", errors="replace").read():
            open(dst, "w", encoding="utf-8").write(d)
        summary.append({"file": rel, "actions": log})
    json.dump(summary, open(os.path.join(work, "_fixlog.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("files %d" % len(summary))
    print("total actions", sum(len(s["actions"]) for s in summary))
