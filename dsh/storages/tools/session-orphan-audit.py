#!/usr/bin/env python3
# Objective 9: quantify the gap between the dsh-context panel source
# (storages/session_projcache/sessions/*.json) and what is really on disk
# (sessions/<slug>/session-<uuid>/session.v4.jsonl.zstd).
#
# BUGFIX vs the first draft: projcache files are named "session-<uuid>.json" and the
# disk dirs are "session-<uuid>". The first draft kept the prefix on one side and
# stripped it on the other, so the intersection came out as a nonsense 0.
# Both sides are normalised to the bare <uuid> here.
# No backslashes in this file on purpose (see memory: python-windows-backslash-heredoc-trap).
import json
import pathlib
import collections

HOME = pathlib.Path.home()
PROJ = HOME / ".dsh/storages/session_projcache/sessions"
SESS = HOME / ".dsh/sessions"

def bare(name: str) -> str:
    return name[len("session-"):] if name.startswith("session-") else name

proj_ids = {bare(p.stem) for p in PROJ.glob("*.json")}
disk_ids = set()
no_stream = []
records = {}
for d in SESS.glob("*/session-*"):
    sid = bare(d.name)
    disk_ids.add(sid)
    if not (d / "session.v4.jsonl.zstd").exists():
        no_stream.append(d.name)

both = proj_ids & disk_ids
only_proj = proj_ids - disk_ids
only_disk = disk_ids - proj_ids

print("projcache entries (panel source) : %d" % len(proj_ids))
print("disk session dirs                : %d" % len(disk_ids))
print("  -> dir WITHOUT stream file     : %d" % len(no_stream))
print("")
print("MATCHED (panel + disk)           : %d" % len(both))
print("panel-only  (record lost on disk): %d" % len(only_proj))
print("disk-only   (panel never saw it) : %d" % len(only_disk))
print("")
per_slug = collections.Counter()
slug_ids = collections.defaultdict(set)
for d in SESS.glob("*/session-*"):
    per_slug[d.parent.name] += 1
    slug_ids[d.parent.name].add(bare(d.name))
print("top slugs by disk session count:")
for slug, n in per_slug.most_common(6):
    matched = len(slug_ids[slug] & proj_ids)
    print("  %5d dirs  (%4d in panel)  %s" % (n, matched, slug))
print("")
# a projcache record holds the panel's view; show what it keys on
sample = next(iter(PROJ.glob("*.json")), None)
if sample:
    rec = json.loads(sample.read_text(encoding="utf-8"))
    r = rec.get("record", {})
    print("sample record keys: %s" % ", ".join(sorted(r.keys())[:14]))
    for k in ("sessionId", "cwd", "workspace", "createdAt", "updatedAt"):
        if k in r:
            print("  %s = %s" % (k, str(r[k])[:110]))
    tu = r.get("tokenUsage", {})
    if isinstance(tu, dict):
        print("  tokenUsage.val.totals = %s" % json.dumps((tu.get("val") or {}).get("totals"), ensure_ascii=False)[:200])
