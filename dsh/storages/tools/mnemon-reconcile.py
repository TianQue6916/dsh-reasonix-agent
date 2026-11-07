#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""mnemon-reconcile — vault（reasonix memory md）与其 mnemon 投影的对账报告。

为什么需要它：`memory-to-mnemon.py` 靠状态文件里的 hash 判「未变则跳过」，
一旦 vault 里发生**改名**（常见：`工具-网络与远程.md` → `dsh-gate-双机路由铁律.md`），
旧名对应的 insight 会留在 mnemon 里成为孤儿，状态文件却认为一切已同步。

判据（不依赖 tag，tag 会随标题漂移）：拿 vault 文件正文的「特征片段」去 insight.content 里找。
  * synced  ：特征片段命中某条 insight
  * missing ：vault 有、mnemon 里找不到（同步漏了）
  * orphan  ：mnemon 有、但没有任何 vault 文件的特征片段命中（改名/删除残留）

用法:
  python mnemon-reconcile.py                 # 报告
  python mnemon-reconcile.py --json out.json # 附带机器可读清单
  python mnemon-reconcile.py --orphans-md out.md   # 把孤儿清单写成 md（供人工确认后再 forget）
"""
import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys

DB = os.path.expanduser("~/.mnemon/data/default/mnemon.db")
VAULT = os.path.expanduser("~/.reasonix/memory")
SKIP = {"MEMORY.md"}


def norm(s):
    """归一化：去 markdown 标记、全角标点、折叠空白 —— 让特征片段比对不因排版差异失败。"""
    s = re.sub(r"[#*`>\-\|\s]+", "", s)
    s = s.replace("，", ",").replace("：", ":").replace("（", "(").replace("）", ")")
    return s.lower()


def read_fact(path):
    """解析 vault fact：YAML front-matter(name/description) + 正文首行。"""
    raw = open(path, encoding="utf-8", errors="replace").read()
    name = desc = ""
    body = raw
    if raw.startswith("---"):
        end = raw.find(chr(10) + "---", 3)
        fm, body = (raw[3:end], raw[end + 4:]) if end > 0 else ("", raw)
        for ln in fm.splitlines():
            if ln.startswith("name:"):
                name = ln[5:].strip().strip('"')
            elif ln.startswith("description:"):
                desc = ln[12:].strip().strip('"')
    head = ""
    for ln in body.splitlines():
        ln = ln.strip()
        if ln and not ln.startswith("#") and not ln.startswith(">") and not ln.startswith("**Why"):
            head = ln
            break
    return name, desc, head


def fingerprint(path):
    """特征片段 = description（最稳，insight.content 第 2 行就是它）∪ 正文首行。"""
    name, desc, head = read_fact(path)
    fp = norm(desc) if len(norm(desc)) >= 20 else norm(desc + head)
    if len(fp) < 20:
        fp = norm(open(path, encoding="utf-8", errors="replace").read())[:120]
    return fp[:160]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    ap.add_argument("--orphans-md")
    ap.add_argument("--db", default=DB)
    a = ap.parse_args()

    conn = sqlite3.connect("file:%s?mode=ro" % a.db.replace("\\", "/"), uri=True)
    rows = conn.execute(
        "select id, content, tags, stored_at, access_count from insights where deleted_at is null"
    ).fetchall()
    conn.close()

    facts = []
    for scope in sorted(os.listdir(VAULT)):
        d = os.path.join(VAULT, scope)
        if not os.path.isdir(d) or scope.startswith("."):
            continue
        for f in sorted(os.listdir(d)):
            if f.endswith(".md") and f not in SKIP and ".bak" not in f and ".conflict." not in f:
                facts.append((scope, f[:-3], os.path.join(d, f)))

    ins_norm = [(i, norm(c), len(c), t, s, ac) for i, c, t, s, ac in rows]
    # tag[0] 通常是 fact 的 name（同步时写入），拿它做精确兜底，避免指纹匹配的假阴性
    by_tag = {}
    for i, c, clen, t, st, ac in ins_norm:
        try:
            tl = json.loads(t) if t else []
        except Exception:
            tl = []
        if tl:
            by_tag.setdefault(str(tl[0]).strip(), i)
    synced, missing = [], []
    hit = set()
    for scope, name, path in facts:
        fp = fingerprint(path)
        found = by_tag.get(name) or by_tag.get(name + '.md')   # 旧版写入时 name 带 .md 后缀
        if not found and fp:
            for i, c, clen, t, st, ac in ins_norm:
                if fp in c:
                    found = i
                    break
        if found:
            synced.append((scope, name, found))
            hit.add(found)
        else:
            missing.append((scope, name, fp[:60]))
    orphans = [(i, c[:70], clen, t, st, ac) for i, c, clen, t, st, ac in ins_norm if i not in hit]

    print("vault fact %d · mnemon 存活 %d" % (len(facts), len(rows)))
    print("  synced  %d" % len(synced))
    print("  missing %d  （vault 有、mnemon 无）" % len(missing))
    print("  orphan  %d  （mnemon 有、vault 无 → 改名/删除残留）" % len(orphans))
    for m in missing[:10]:
        print("   MISSING  %s/%s  fp=%s" % m)
    for o in orphans[:10]:
        print("   ORPHAN   %s | %d B | access=%s" % (o[1].replace("\n", " "), o[2], o[5]))

    if a.json:
        json.dump({"synced": [{"scope": s, "name": n, "insight": i} for s, n, i in synced],
                   "missing": [{"scope": s, "name": n, "fp": fp} for s, n, fp in missing],
                   "orphans": [{"id": i, "head": h, "bytes": b, "tags": t, "stored_at": s,
                                "access_count": ac} for i, h, b, t, s, ac in orphans]},
                  open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("→ json: %s" % a.json)

    if a.orphans_md and orphans:
        with open(a.orphans_md, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("# mnemon 孤儿清单（%d 条）\n\n> 由 `mnemon-reconcile.py` 生成；"
                     "确认后可逐条 `mnemon forget <id>` 软删。\n\n" % len(orphans))
            for i, h, b, t, s, ac in orphans:
                fh.write("- `%s` · %d B · access=%s · %s\n  - tags: %s\n" % (i, b, ac, s, (t or "")[:100]))
        print("→ orphans md: %s" % a.orphans_md)


if __name__ == "__main__":
    main()
