# -*- coding: utf-8 -*-
"""v2: 修 KaTeX 失败（保守 + 幂等，每次从源重新复制）"""
import os, sys, json, re, shutil

BS = chr(92)
CJK = re.compile("[一-鿿＀-￯　-〿]")
ENVS = ("aligned", "array", "cases", "matrix", "pmatrix", "bmatrix", "split", "eqnarray", "gathered", "alignedat")
TEXTCMD = {"lg": "lg", "ln": "ln", "log": "log", "Theta": "Theta", "tau": "tau", "lambda": "lambda", "sigma": "sigma", "Omega": "Omega"}

def fix_text_in_math(tex):
    """把 	ext{...} 里的反斜杠命令降级为纯文本"""
    def rep(m):
        inner = m.group(1)
        for k, v in TEXTCMD.items():
            inner = inner.replace(BS + k, v)
        inner = re.sub(BS + r"\?[A-Za-z]+", "", inner)
        return BS + "text{" + inner + "}"
    return re.sub(re.escape(BS) + r"text\{([^{}]*)\}", rep, tex)

def cut_cjk(text, start, end):
    """行内公式含 CJK：在公式内截断，把剩余中文移出 $...$"""
    inner = text[start:end]
    m = CJK.search(inner)
    if not m: return text
    keep = inner[:m.start()]
    rest = inner[m.start():]
    return text[:start] + keep + "$" + rest + "$" + text[end:]

def fix_inline(d, log):
    out = []
    for i, line in enumerate(d.split(chr(10))):
        s = line
        if s.count("$") >= 2:
            parts = s.split("$")
            for j in range(1, len(parts) - 1, 2):
                if CJK.search(parts[j]):
                    a = parts[j]
                    m = CJK.search(a)
                    parts[j] = a[:m.start()]
                    parts[j + 1] = a[m.start():] + parts[j + 1]
                    log.append("inline L%d: moved CJK out of math" % (i + 1))
                if "	ext{" in BS.join([""]) or (BS + "text{") in parts[j]:
                    nv = fix_text_in_math(parts[j])
                    if nv != parts[j]:
                        parts[j] = nv; log.append("inline L%d: degraded command inside text{}" % (i + 1))
            s = "$".join(parts)
        out.append(s)
    return chr(10).join(out)

def fix_block(inner, log):
    o = inner
    if (BS + "text{") in inner:
        ni = fix_text_in_math(inner)
        if ni != inner: inner = ni; log.append("block: degraded command inside text{}")
    has_env = any(BS + "begin{" + e + "}" in inner for e in ENVS)
    if (not has_env) and ("&" in inner):
        inner = BS + "begin{aligned}" + chr(10) + inner + chr(10) + BS + "end{aligned}"
        log.append("block: wrapped in aligned (had & without env)")
    if ">" in inner and re.search(r"^>", inner.strip()):
        lines = [l for l in inner.split(chr(10)) if not l.strip().startswith(">")]
        inner = chr(10).join(lines); log.append("block: dropped markdown quote markers")
    return inner if inner != o else o

def process(d):
    log = []
    def blk(m):
        return "```math" + chr(10) + fix_block(m.group(1), log) + "```"
    d = re.sub("```math" + chr(10) + "(.*?)```", blk, d, flags=re.S)
    d = fix_inline(d, log)
    if re.search("(?<!" + re.escape(BS) + ")inom" + re.escape("{"), d):
        d = re.sub("(?<!" + re.escape(BS) + ")inom" + re.escape("{"), BS + "binom{", d)
        log.append("global: inom{ -> -binom{")
    return d, log

if __name__ == "__main__":
    report = json.load(open(sys.argv[1], encoding="utf-8"))
    srcroot, work = sys.argv[2], sys.argv[3]
    if os.path.isdir(work): shutil.rmtree(work)
    os.makedirs(work, exist_ok=True)
    summary = []
    for f in report["bad"]:
        rel = os.path.relpath(f, srcroot)
        dst = os.path.join(work, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(f, dst)
        orig = open(dst, encoding="utf-8", errors="replace").read()
        nd, log = process(orig)
        if nd != orig: open(dst, "w", encoding="utf-8").write(nd)
        summary.append({"file": rel, "changed": nd != orig, "actions": log})
    json.dump(summary, open(os.path.join(work, "_fixlog.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("files %d changed %d" % (len(summary), sum(1 for s in summary if s["changed"])))
    for s in summary:
        if s["actions"]: print(" ", os.path.basename(s["file"])[:50], s["actions"][:3])
