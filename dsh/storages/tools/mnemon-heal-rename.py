#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""mnemon-heal-rename — 修复「vault fact 改名后 mnemon 不跟」造成的孤儿与缺条。

背景（2026-11-07 定位）：
  `memory-to-mnemon.py` 把 fact 写成 insight 时 `content = "# <name>\n<description>\n\n<body>"`。
  文件改名而正文几乎不变时，mnemon 的 import 去重（按 content 相似）判为「已存在」→
  新的 name/tag 写不进去，旧名 insight 变成孤儿。`mnemon import --no-diff` 可以绕过该判定。

做的事（默认只报告）：
  1. 取 `mnemon-reconcile.py --json` 的结果；
  2. orphan 里 tag 以 `.md` 结尾（旧版脚本用文件名当 name）或含 `[fixture]` 的 → `mnemon forget`；
  3. missing 的 fact → 生成 draft，`mnemon import --no-diff` 重新写入。

用法:
  python mnemon-reconcile.py --json ./_mnemon-reconcile.json
  python mnemon-heal-rename.py --report ./_mnemon-reconcile.json            # 只看计划
  python mnemon-heal-rename.py --report ./_mnemon-reconcile.json --apply    # 执行
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import datetime

MNEMON = shutil.which("mnemon.cmd") or shutil.which("mnemon") or "mnemon"
DB = os.path.expanduser("~/.mnemon/data/default/mnemon.db")
VAULT = os.path.expanduser("~/.reasonix/memory")
MAXB = 7500


def blen(s):
    return len(s.encode("utf-8"))


def cutb(s, maxb):
    if blen(s) <= maxb:
        return s
    b = s.encode("utf-8")[:maxb]
    while b and (b[-1] & 0xC0) == 0x80:
        b = b[:-1]
    return b.decode("utf-8", "ignore")


def read_fact(path):
    raw = open(path, encoding="utf-8", errors="replace").read()
    name = desc = ""
    body = raw
    if raw.startswith("---"):
        i = raw.find("\n---", 3)
        if i != -1:
            fm = raw[3:i]
            j = raw.find("\n", i + 4)
            body = raw[j + 1:]
            for ln in fm.splitlines():
                if ln.startswith("name:"):
                    name = ln[5:].strip().strip('"')
                elif ln.startswith("description:"):
                    desc = ln[12:].strip().strip('"')
    return name, desc, body


def build_insight(path, name_hint):
    name, desc, body = read_fact(path)
    name = name or name_hint
    head = (f"# {name}\n{desc}\n\n" if desc else f"# {name}\n\n")
    content = cutb(head + body.strip(), MAXB)
    return {"content": content, "category": "fact", "importance": 3,
            "tags": [cutb(name, 100)], "source": "user"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", required=True, help="mnemon-reconcile.py --json 的产物")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--vault", default=VAULT)
    a = ap.parse_args()

    d = json.load(open(a.report, encoding="utf-8"))
    orphans = d.get("orphans", [])
    missing = d.get("missing", [])

    to_forget = []
    for o in orphans:
        tags = o.get("tags") or ""
        try:
            tl = json.loads(tags)
        except Exception:
            tl = []
        first = str(tl[0]) if tl else ""
        head = (o.get("head") or "").lower()
        if first.endswith(".md") or "[fixture]" in head or "fixture" in first:
            to_forget.append((o["id"], o["head"][:60].replace("\n", " ")))

    ins = []
    for m in missing:
        p = os.path.join(a.vault, m["scope"], m["name"] + ".md")
        if os.path.exists(p):
            ins.append(build_insight(p, m["name"]))

    print("forget 计划：%d 条（旧文件名 tag / fixture）" % len(to_forget))
    for i, h in to_forget[:20]:
        print("   %s  %s" % (i[:8], h))
    print("reimport 计划：%d 条（missing fact，--no-diff 强制写入）" % len(ins))
    for x in ins[:20]:
        print("   %s" % x["content"].split("\n")[0])

    if not a.apply:
        print("\n（只报告。加 --apply 执行）")
        return

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = os.path.join(os.path.expanduser("~/backups"), "mnemon-before-heal-%s.db" % stamp)
    os.makedirs(os.path.dirname(bak), exist_ok=True)
    shutil.copy2(DB, bak)
    print("db 备份 → %s" % bak)

    ok = fail = 0
    for i, h in to_forget:
        r = subprocess.run([MNEMON, "forget", i], capture_output=True, text=True)
        if r.returncode == 0:
            ok += 1
        else:
            fail += 1
            print("  !! forget %s 失败: %s" % (i[:8], (r.stderr or r.stdout).strip()[:120]))
    print("forget: ok %d / fail %d" % (ok, fail))

    if ins:
        draft = os.path.join(os.path.expanduser("~/.dsh/storages"), "mnemon-heal-draft.json")
        json.dump({"schema_version": "1", "insights": ins}, open(draft, "w", encoding="utf-8"),
                  ensure_ascii=False)
        r = subprocess.run([MNEMON, "import", draft, "--no-diff"], capture_output=True, text=True)
        print("import --no-diff rc=%d" % r.returncode)
        out = (r.stdout or "") + (r.stderr or "")
        print(out[-600:])


if __name__ == "__main__":
    main()
