#!/usr/bin/env python3
# Objective 1: is the thinking chain actually Chinese (including during tool-calling steps)?
# Method: pull every `reasoning` block out of recent assistant/message events and measure the
# CJK character share. Split the sample into "steps that called a tool" vs "steps that did not",
# because the complaint was specifically about tool-calling steps.
# usage: python reasoning-language-audit.py [YYYY-MM-DDTHH:MM] [maxSessions]
import datetime, io, json, pathlib, sys, zstandard

cutoff_iso = sys.argv[1] if len(sys.argv) > 1 else "2026-10-04T18:36"
maxsess = int(sys.argv[2]) if len(sys.argv) > 2 else 6
cutoff_ms = int(datetime.datetime.fromisoformat(cutoff_iso).timestamp() * 1000)
print("cutoff: %s" % cutoff_iso)

def cjk_ratio(s: str):
    if not s:
        return None
    cjk = sum(1 for ch in s if "\u4e00" <= ch <= "\u9fff")
    letters = sum(1 for ch in s if ch.isalpha() or ("\u4e00" <= ch <= "\u9fff"))
    return (cjk, letters, cjk / letters if letters else 0.0)

root = pathlib.Path.home() / ".dsh/sessions"
cands = []
for d in root.glob("*/session-*"):
    f = d / "session.v4.jsonl.zstd"
    if f.exists():
        cands.append((f.stat().st_mtime, d, f))
cands.sort(reverse=True)

print("")
print("%-40s %6s %8s %10s %10s" % ("session", "steps", "withtool", "cjk(no-tool)", "cjk(with-tool)"))
print("-" * 82)
for _mt, d, f in cands[:maxsess]:
    acc = {"notool": [0, 0], "tool": [0, 0]}   # [cjk, letters]
    steps = 0
    withtool = 0
    pending_reasoning = None
    saw_toolcall = False
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
                typ = ev.get("type")
                if typ == "tool/call":
                    saw_toolcall = True
                elif typ == "assistant/message":
                    if saw_toolcall:
                        withtool += 1
                    steps += 1
                    content = ((ev.get("data") or {}).get("message") or {}).get("content") or []
                    text = "".join(b.get("text", "") for b in content
                                   if isinstance(b, dict) and b.get("type") == "reasoning")
                    r = cjk_ratio(text)
                    if r:
                        key = "tool" if saw_toolcall else "notool"
                        acc[key][0] += r[0]
                        acc[key][1] += r[1]
                    saw_toolcall = False
    except Exception as e:
        print("%-40s  ERROR %s" % (d.name[:38], e))
        continue
    def pc(k):
        c, l = acc[k]
        return ("%.1f%% (n=%d)" % (100.0 * c / l, c)) if l else "n/a"
    print("%-40s %6d %8d %10s %10s" % (d.name[:38], steps, withtool, pc("notool"), pc("tool")))
print("")
print("cjk% = CJK chars / (CJK + latin letters), summed over that bucket's reasoning text.")
print("A healthy Chinese thinking chain should sit well above ~70% in BOTH buckets.")
