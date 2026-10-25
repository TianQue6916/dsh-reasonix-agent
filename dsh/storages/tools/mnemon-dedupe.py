#!/usr/bin/env python3
"""mnemon 记忆库去重：按 content 首行标题分组，组内保留最长一条，其余软删。

成因（2026-10-26 定论）：vault → mnemon 的同步路径（memory-to-mnemon.py）按 name upsert 且脚本自带去重；
但 **auto-capture / idle checkpoint review 直接写 mnemon**（绕过 vault），每次 idle 检查就 append 一条新 insight。
同一会话反复 idle 检查 ⇒ 同标题多版本堆积（实测 discrete-math ×22）。本脚本负责周期性收口。

用法：
  python mnemon-dedupe.py              # 只报告（默认，不删）
  python mnemon-dedupe.py --apply      # 执行软删（mnemon forget，可回滚：deleted_at 字段）
  python mnemon-dedupe.py --min-group 3 --json-out out.json
判据（fail 条件）：存活条数 == 唯一标题数。
"""
import argparse, collections, datetime, json, os, sqlite3, subprocess, sys

DB = os.path.expanduser("~/.mnemon/data/default/mnemon.db")
CLI = "mnemon"

def load(db):
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    rows = c.execute(
        "select id, content, length(content), updated_at from insights where deleted_at is null"
    ).fetchall()
    c.close()
    return rows

def plan(rows, min_group):
    by = collections.defaultdict(list)
    for r in rows:
        by[r[1].split("\n", 1)[0].strip()].append(r)
    out = []
    for title, v in by.items():
        if len(v) < min_group:
            continue
        v2 = sorted(v, key=lambda r: (r[2], r[3] or ""), reverse=True)
        out.append({
            "title": title, "group_size": len(v),
            "keep": {"id": v2[0][0], "len": v2[0][2]},
            "drops": [{"id": d[0], "len": d[2]} for d in v2[1:]],
        })
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="执行软删（默认只报告）")
    ap.add_argument("--min-group", type=int, default=2, help="组内至少几条才算重复（默认 2）")
    ap.add_argument("--json-out", default="", help="把计划写到 json")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()

    rows = load(DB)
    p = plan(rows, a.min_group)
    drop_n = sum(len(x["drops"]) for x in p)
    titles = len({r[1].split("\n", 1)[0].strip() for r in rows})
    print(f"[{datetime.datetime.now():%Y-%m-%d %H:%M:%S}] 存活 {len(rows)} / 唯一标题 {titles} / 重复组 {len(p)} / 待删 {drop_n}")

    if a.json_out:
        json.dump(p, open(a.json_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"  计划已写入 {a.json_out}")

    if not a.apply:
        for x in sorted(p, key=lambda y: -y["group_size"])[:8]:
            print(f"  {x['title'][:44]:46s} ×{x['group_size']:<3d} keep={x['keep']['len']}B drop={len(x['drops'])}")
        if p:
            print("  （只报告模式；加 --apply 执行软删）")
        return 0

    ok = fail = 0
    for x in p:
        for d in x["drops"]:
            r = subprocess.run([CLI, "forget", d["id"]], capture_output=True, text=True, timeout=30)
            if r.returncode == 0:
                ok += 1
            elif r.returncode == 1:      # 已删过 = 幂等，不算失败
                ok += 1
            else:
                fail += 1
                print(f"  FAIL {d['id']} rc={r.returncode} {r.stderr[:80]}")
    after = load(DB)
    atitles = len({r[1].split("\n", 1)[0].strip() for r in after})
    print(f"  软删 ok={ok} fail={fail} → 存活 {len(after)} / 唯一标题 {atitles}")
    print(f"  判据: {'PASS (存活==唯一标题)' if len(after) == atitles else 'FAIL (仍有重复组)'}")
    return 0 if fail == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
