#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-headroom-searchfold.py

修复 `dsh-headroom` 的 search-fold 把「时间戳行」误判成 grep 结果并篡改内容的 bug。

根因
----
~/.dsh/profiles/{web,desktop}/node_modules/dsh-headroom/lib/compress.js:263
    const SEARCH_LINE_RE = /^(.+?):(\\d+)(?::(\\d+))?:(.*)$/

`(.+?)` 允许 file 段**含空格**，于是
    "2026-10-04 23:10:17.521 host wrote file A"
被解析成 file="2026-10-04 23"、line=10、rest="17.521 host wrote file A"，
再在 :296 重组为 `${match.lineNo}${colText}: ${match.rest}` ⇒ 输出变成
    2026-10-04 23 (4 matches)      ← 假的组头，只出现一次
    10: 17.521 host wrote file A   ← 日期与小时被吃掉
并且整段被**按 file 分组重排**（原始行序丢失）。
触发门槛（:284-285）：matched >= 3 且 matched / totalNonEmpty >= 0.5。

修法
----
    (.+?)  →  (\\S+?)        文件段不允许含空格
一个 token，语义精确：真 grep 输出的 file 段（`src/index.ts:12:`、`C:\\Users\\x.js:120:`、
`Makefile:7:`）全部保持原行为；带空格的日志/时间戳行不再误匹配。

幂等 · 自动备份 · 可逆 · pnpm install 会覆盖 node_modules，重跑本脚本即可重新应用。

用法
----
    python patch-headroom-searchfold.py --check
    python patch-headroom-searchfold.py --apply
    python patch-headroom-searchfold.py --verify
    python patch-headroom-searchfold.py --restore
"""
import argparse
import hashlib
import io
import os
import shutil
import sys

TARGETS = [
    r"C:\Users\27063\.dsh\profiles\desktop\node_modules\dsh-headroom\lib\compress.js",
    r"C:\Users\27063\.dsh\profiles\web\node_modules\dsh-headroom\lib\compress.js",
]
BACKUP_SUFFIX = ".bak-pre-searchfold-fix"

OLD = "const SEARCH_LINE_RE = /^(.+?):(\\d+)(?::(\\d+))?:(.*)$/"
NEW = "const SEARCH_LINE_RE = /^(\\S+?):(\\d+)(?::(\\d+))?:(.*)$/"

MARK_OLD = "(.+?)"          # 在 SEARCH_LINE_RE 行内出现
MARK_NEW = "(\\S+?)"


def sha(path):
    h = hashlib.md5()
    with open(path, "rb") as fh:
        h.update(fh.read())
    return h.hexdigest()


def state_of(text):
    """返回 'old' / 'new' / 'unknown'。"""
    if OLD in text:
        return "old"
    if NEW in text:
        return "new"
    # 宽松：只看 SEARCH_LINE_RE 那一行
    for line in text.split("\n"):
        if "SEARCH_LINE_RE" in line and "=" in line:
            if "(.+?)" in line:
                return "old"
            if "(\\S+?)" in line:
                return "new"
    return "unknown"


def cmd_check():
    rc = 0
    for t in TARGETS:
        if not os.path.exists(t):
            print("MISSING  %s" % t)
            rc = 1
            continue
        text = io.open(t, encoding="utf-8", newline="").read()
        st = state_of(text)
        print("%-9s %-8s %s" % (st.upper(), sha(t)[:12], t))
        if st == "unknown":
            rc = 1
    return rc


def cmd_apply():
    for t in TARGETS:
        if not os.path.exists(t):
            print("SKIP (missing) %s" % t)
            continue
        text = io.open(t, encoding="utf-8", newline="").read()
        st = state_of(text)
        if st == "new":
            print("ALREADY-PATCHED %s" % t)
            continue
        if st == "unknown":
            print("FAIL (pattern not found) %s" % t)
            return 1
        bak = t + BACKUP_SUFFIX
        if not os.path.exists(bak):
            shutil.copyfile(t, bak)
            print("BACKUP %s" % bak)
        n = text.count(OLD)
        if n != 1:
            print("FAIL (anchor count=%d, want 1) %s" % (n, t))
            return 1
        out = text.replace(OLD, NEW)
        assert out != text
        io.open(t, "w", encoding="utf-8", newline="").write(out)
        print("PATCHED  %s  (%d -> %d bytes, md5 %s)" % (t, len(text.encode("utf-8")), len(out.encode("utf-8")), sha(t)[:12]))
    return 0


def cmd_verify():
    ok = True
    for t in TARGETS:
        if not os.path.exists(t):
            print("MISSING %s" % t)
            ok = False
            continue
        text = io.open(t, encoding="utf-8", newline="").read()
        st = state_of(text)
        print("[%s] %s  md5=%s" % ("OK" if st == "new" else "BAD", t, sha(t)[:12]))
        if st != "new":
            ok = False
    # 行为验证：拿真实 compress.js 跑一遍
    if ok:
        print("--- 行为验证 ---")
        os.system('node "%s"' % os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                            "repro-headroom-searchfold.mjs"))
    return 0 if ok else 1


def cmd_restore():
    for t in TARGETS:
        bak = t + BACKUP_SUFFIX
        if not os.path.exists(bak):
            print("NO-BACKUP %s" % bak)
            continue
        shutil.copyfile(bak, t)
        print("RESTORED %s  md5=%s" % (t, sha(t)[:12]))
    return 0


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true")
    g.add_argument("--apply", action="store_true")
    g.add_argument("--verify", action="store_true")
    g.add_argument("--restore", action="store_true")
    a = ap.parse_args()
    if a.check:
        return cmd_check()
    if a.apply:
        return cmd_apply()
    if a.verify:
        return cmd_verify()
    return cmd_restore()


if __name__ == "__main__":
    sys.exit(main())
