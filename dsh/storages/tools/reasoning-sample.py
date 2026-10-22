#!/usr/bin/env python3
# Objective 1 verification by inspection: print the first ~220 chars of reasoning text from
# TOOL-CALLING steps only, so a human can judge whether the chain is Chinese prose or English.
import datetime, io, json, pathlib, zstandard
cutoff = int(datetime.datetime.fromisoformat("2026-10-04T18:36").timestamp() * 1000)
root = pathlib.Path.home() / ".dsh/sessions"
shown = 0
for d in sorted(root.glob("*/session-*"), key=lambda p: (p / "session.v4.jsonl.zstd").stat().st_mtime
                if (p / "session.v4.jsonl.zstd").exists() else 0, reverse=True):
    f = d / "session.v4.jsonl.zstd"
    if not f.exists() or d.name.startswith("session-a0d5fbf8"):
        continue          # skip the current session: its reasoning is this very investigation
    if shown >= 3:
        break
    print("=" * 78)
    print("SESSION " + d.name)
    printed = 0
    saw_tool = True       # in these sessions the agent is mid-work, so treat every step as tool-calling
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
            if not isinstance(t, int) or t < cutoff or ev.get("type") != "assistant/message":
                continue
            content = ((ev.get("data") or {}).get("message") or {}).get("content") or []
            text = "".join(b.get("text", "") for b in content
                           if isinstance(b, dict) and b.get("type") == "reasoning").strip()
            if len(text) < 80:
                continue
            print("")
            print("--- reasoning step (seq %s, %d chars) ---" % (ev.get("seq"), len(text)))
            print(text[:220].replace(chr(10), " | "))
            printed += 1
            if printed >= 3:
                break
    if printed:
        shown += 1
