#!/usr/bin/env python3
"""compaction-audit v2 — fix the two measurement errors in v1 that caused misdiagnosis.

WHAT v1 GOT WRONG (verified against session-a0d5fbf8, 2026-10-04)
  1. `realBefore`: v1 took the last `assistant/message` seen *anywhere earlier* in the log.
     A compaction is preceded by `step/start -> user/message* -> assistant/attempt -> step/end
     -> turn/end -> command/run -> compaction/start` — there is usually **no** assistant/message
     between the last request's usage and the trigger. So v1 reported a stale sample from an
     arbitrary earlier turn (155,353) rather than the prompt that tripped the threshold.
  2. Consequence: v1's "%window" column is not the trigger's occupancy and must not be read as
     "compaction fired at 15% of the window". The real cycle peak for that session is ~168K.

WHAT IS ACTUALLY TRUSTWORTHY
  * `spec.thresholdTokens = floor(min(W*thresholdRatio, (W - reserved) - headroom))`
    with DEFAULT_THRESHOLD_RATIO=0.8 and headroomTokens default 65536
    -> for W=1e6, reserved=65536: 800,000.
  * `compaction/summary.data.usage` is the summarizer's own request. Its `inputTokens` +
    cacheRead + cacheWrite is the exact size of the text being compacted. cacheRead≈0 proves
    the summarizer builds a fresh prompt from the shadowed range.
  * `shadowedTokenCount` is the char/4 estimate of the shadowed nodes (NOT the trigger ledger).
    Comparing it against the summarizer usage gives the heuristic's own error (~0.73 for CJK).
  * `measure().totalTokens` (the actual trigger value) is NEVER persisted in the event log.
    To observe it you must log it from inside the running host (see --emit-probe).

USAGE
  python compaction-audit2.py --session a0d5fbf8            # per-compaction table + cycle peaks
  python compaction-audit2.py --session a0d5fbf8 --since 2026-10-04T18:30
  python compaction-audit2.py --session a0d5fbf8 --probe-json <path>   # merge live probe data
"""
from __future__ import annotations
import argparse, datetime, io, json, pathlib, sys

SESS_ROOT = pathlib.Path.home() / ".dsh/sessions"
W_DEFAULT = 1_000_000
RESERVED_DEFAULT = 65536
HEADROOM_DEFAULT = 65536
THRESHOLD_RATIO_DEFAULT = 0.8


def streams() -> list[pathlib.Path]:
    return sorted(SESS_ROOT.glob("*/session-*/session.v4.jsonl.zstd"), key=lambda p: p.stat().st_mtime, reverse=True)


def events(path: pathlib.Path):
    import zstandard
    with open(path, "rb") as fh:
        with zstandard.ZstdDecompressor().stream_reader(fh, read_across_frames=True) as raw:
            for line in io.TextIOWrapper(raw, encoding="utf-8"):
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue


def prompt_of(usage) -> int | None:
    """Provider prompt side = uncached input + cache read + cache write."""
    if not isinstance(usage, dict) or "inputTokens" not in usage:
        return None
    return (usage.get("inputTokens") or 0) + (usage.get("cacheReadTokens") or 0) + (usage.get("cacheWriteTokens") or 0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session")
    ap.add_argument("--window", type=int, default=W_DEFAULT)
    ap.add_argument("--threshold-ratio", type=float, default=THRESHOLD_RATIO_DEFAULT)
    ap.add_argument("--headroom", type=int, default=HEADROOM_DEFAULT)
    ap.add_argument("--reserved", type=int, default=RESERVED_DEFAULT)
    ap.add_argument("--since")
    ap.add_argument("--probe-json", help="json dumped from the live host tokenMeter probe")
    args = ap.parse_args()

    path = None
    if args.session:
        path = next((p for p in streams() if args.session in p.parent.name), None)
        if path is None:
            sys.exit(f"no session matching {args.session!r}")
    else:
        path = streams()[0]

    threshold = int(min(args.window * args.threshold_ratio, (args.window - args.reserved) - args.headroom))
    print(f"session : {path.parent.name}")
    print(f"window  : {args.window:,}  reserved {args.reserved:,}  headroom {args.headroom:,}  ratio {args.threshold_ratio}")
    print(f"THRESHOLD (computed from dsh-compaction-basic defaults): {threshold:,} tokens\n")

    rows = []
    last_assistant = None           # (seq, prompt)
    peak_since_last = (0, None)     # max prompt seen since previous compaction
    for ev in events(path):
        t = ev.get("type")
        if t == "assistant/message":
            pr = prompt_of((ev.get("data") or {}).get("usage"))
            if pr is not None:
                last_assistant = (ev.get("seq"), pr)
                if pr > peak_since_last[0]:
                    peak_since_last = (pr, ev.get("seq"))
        elif t == "compaction/summary":
            d = ev.get("data") or {}
            u = d.get("usage") or {}
            rows.append({
                "seq": ev.get("seq"),
                "time": ev.get("time"),
                "shadowed": d.get("shadowedTokenCount"),
                "range": d.get("shadowedRange") or {},
                "sum_in": u.get("inputTokens"),
                "sum_cache_read": u.get("cacheReadTokens"),
                "sum_cache_write": u.get("cacheWriteTokens"),
                "sum_prompt": prompt_of(u),
                "last_assistant": last_assistant,
                "peak": peak_since_last,
            })
            last_assistant = None
            peak_since_last = (0, None)

    if args.since:
        try:
            since_ms = int(datetime.datetime.fromisoformat(args.since).timestamp() * 1000)
        except ValueError:
            sys.exit(f"--since must be ISO-8601 (got {args.since!r})")
        rows = [r for r in rows if isinstance(r.get("time"), int) and r["time"] >= since_ms]

    if not rows:
        print("no compaction/summary events in scope")
        return 0

    for i, r in enumerate(rows, 1):
        when = datetime.datetime.fromtimestamp(r["time"] / 1000).strftime("%m-%d %H:%M:%S") if isinstance(r.get("time"), int) else "?"
        rng = r["range"]
        print(f"[{i}] seq={r['seq']} {when}  shadowed {rng.get('start')}-{rng.get('end')}")
        print(f"    shadowedTokenCount(char/4 est) : {r['shadowed']:,}")
        print(f"    summarizer prompt (real, fresh) : {r['sum_prompt']:,}"
              f"   [input {r['sum_in']:,} + cacheRead {r['sum_cache_read']:,} + cacheWrite {r['sum_cache_write']}]")
        if r["shadowed"] and r["sum_prompt"]:
            print(f"    heuristic error vs real         : {r['shadowed']/r['sum_prompt']:.2f}  "
                  f"({'under' if r['shadowed'] < r['sum_prompt'] else 'OVER'}-estimates the compacted text)")
        if r["peak"][0]:
            print(f"    cycle peak prompt before trigger: {r['peak'][0]:,} at seq {r['peak'][1]}"
                  f"  = {r['peak'][0]/args.window*100:.1f}% of window  (threshold {threshold:,})")
        print(f"    last assistant/message in log   : {r['last_assistant']}")
        print()

    print("NOTE: `totalTokens` that actually tripped the threshold is not in the log;")
    print("      only a live probe can show it. cycle peak above is a lower bound (cacheRead may be null).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
