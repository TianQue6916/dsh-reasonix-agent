#!/usr/bin/env python3
# Objective 2 follow-up: session-a0d5fbf8 showed 7 guard-err hits after the 18:36 cutoff.
# Print their timestamps + payloads to decide whether the guard is still acting or whether
# these are just historical text (e.g. this conversation quoting the old error strings).
import datetime, io, json, pathlib, zstandard

f = pathlib.Path.home() / ".dsh/sessions/--C-Users-27063--/session-a0d5fbf8-0fb1-419e-9baf-d95df0190144/session.v4.jsonl.zstd"
cutoff = int(datetime.datetime.fromisoformat("2026-10-04T18:36").timestamp() * 1000)
rows = []
with open(f, "rb") as fh, zstandard.ZstdDecompressor().stream_reader(fh, read_across_frames=True) as rd:
    for line in io.TextIOWrapper(rd, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        t = ev.get("time")
        if not isinstance(t, int) or t < cutoff:
            continue
        blob = json.dumps(ev, ensure_ascii=False)
        if "thinking-guard" in blob and ("degenerate" in blob or "unreachable variant" in blob):
            when = datetime.datetime.fromtimestamp(t / 1000).strftime("%m-%d %H:%M:%S")
            d = ev.get("data") or {}
            kind = d.get("source", {}).get("plugin") if isinstance(d.get("source"), dict) else None
            rows.append((when, ev.get("seq"), ev.get("type"), kind, blob[:220]))
print("hits: %d" % len(rows))
for when, seq, typ, kind, snip in rows:
    print("")
    print("%s  seq=%s  type=%s  source.plugin=%s" % (when, seq, typ, kind))
    print("   " + snip.replace(chr(10), " ")[:200])
