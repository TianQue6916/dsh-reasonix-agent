#!/usr/bin/env python3
# Objective 2: does thinking-guard still INJECT anything after it was disabled?
# The naive test (does the session JSON contain the string "thinking-guard") is useless:
# it matches 712 accumulated historical records. This restricts to
#   (a) events at/after a cutoff epoch-ms, and
#   (b) user/message events whose structured payload actually came from the plugin
#       (data.source.plugin == 'thinking-guard', or a data.meta/kind marker).
# usage: python guard-trace-audit.py [YYYY-MM-DDTHH:MM]
import datetime
import io
import json
import pathlib
import sys
import zstandard

cutoff_iso = sys.argv[1] if len(sys.argv) > 1 else "2026-10-04T18:36"
cutoff_ms = int(datetime.datetime.fromisoformat(cutoff_iso).timestamp() * 1000)
print("cutoff: %s (=%d ms)" % (cutoff_iso, cutoff_ms))
print("")

root = pathlib.Path.home() / ".dsh/sessions"
cands = []
for d in root.glob("*/session-*"):
    f = d / "session.v4.jsonl.zstd"
    if f.exists():
        cands.append((f.stat().st_mtime, d, f))
cands.sort(reverse=True)

def looks_like_guard_injection(ev) -> str | None:
    d = ev.get("data")
    if not isinstance(d, dict):
        return None
    src = d.get("source")
    if isinstance(src, dict) and src.get("plugin") == "thinking-guard":
        return "source.plugin"
    for key in ("meta", "kind", "reason"):
        v = d.get(key)
        if isinstance(v, str) and "thinking-guard" in v:
            return key
        if isinstance(v, dict) and "thinking-guard" in json.dumps(v, ensure_ascii=False):
            return key
    return None

print("%-42s %10s %10s %10s" % ("session", "post-ev", "guard-inj", "guard-err"))
print("-" * 78)
for _mt, d, f in cands[:8]:
    post = 0
    inj = 0
    errs = 0
    try:
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
                if not isinstance(t, int) or t < cutoff_ms:
                    continue
                post += 1
                if ev.get("type") == "user/message" and looks_like_guard_injection(ev):
                    inj += 1
                blob = json.dumps(ev, ensure_ascii=False)
                if "thinking-guard" in blob and ("degenerate" in blob or "unreachable variant" in blob):
                    errs += 1
    except Exception as e:
        print("%-42s  ERROR %s" % (d.name[:40], e))
        continue
    print("%-42s %10d %10d %10d" % (d.name[:40], post, inj, errs))
print("")
print("VERDICT rule: guard-inj == 0 and guard-err == 0 for every session => the guard is inert.")
