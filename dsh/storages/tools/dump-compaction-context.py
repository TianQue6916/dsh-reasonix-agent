#!/usr/bin/env python3
"""Dump the raw payload of compaction/start|summary|end|prune plus the assistant/message
usage immediately preceding each compaction, with every agent/scope discriminator found.
Used to re-check compaction-audit.py's realBefore heuristic (it may be picking up a
subagent or the summarizer call instead of the main session prompt)."""
import io, json, pathlib, zstandard, collections, sys

p = pathlib.Path.home() / ".dsh/sessions/--C-Users-27063--/session-a0d5fbf8-0fb1-419e-9baf-d95df0190144/session.v4.jsonl.zstd"
if len(sys.argv) > 1:
    p = pathlib.Path(sys.argv[1])

def keys_of(d, prefix=""):
    out = []
    if isinstance(d, dict):
        for k, v in d.items():
            out.append(prefix + k + ":" + type(v).__name__)
    return out

events = []
with open(p, "rb") as fh:
    with zstandard.ZstdDecompressor().stream_reader(fh, read_across_frames=True) as rd:
        for line in io.TextIOWrapper(rd, encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass

print(f"total events: {len(events)}")
print()
print("=== compaction/start payload keys & sample ===")
cs = [e for e in events if e.get("type") == "compaction/start"]
if cs:
    e = cs[-1]
    print("top keys:", sorted(e.keys()))
    print("data keys:", keys_of(e.get("data")))
    print(json.dumps(e.get("data"), ensure_ascii=False)[:1200])
print()
print("=== compaction/end payload ===")
ce = [e for e in events if e.get("type") == "compaction/end"]
if ce:
    print(json.dumps(ce[-1].get("data"), ensure_ascii=False)[:900])
print()
print("=== compaction/prune payload ===")
cp = [e for e in events if e.get("type") == "compaction/prune"]
if cp:
    print(json.dumps(cp[-1].get("data"), ensure_ascii=False)[:900])
print()
print("=== assistant/message structure (last one) ===")
am = [e for e in events if e.get("type") == "assistant/message"]
if am:
    e = am[-1]
    print("top keys:", sorted(e.keys()))
    d = e.get("data") or {}
    print("data keys:", keys_of(d))
    for k in d:
        if k in ("content", "stream", "message"):
            print(f"  {k}: <{type(d[k]).__name__} len={len(d[k]) if hasattr(d[k],'__len__') else '?'}>")
        else:
            print(f"  {k}: {json.dumps(d[k], ensure_ascii=False)[:200]}")
