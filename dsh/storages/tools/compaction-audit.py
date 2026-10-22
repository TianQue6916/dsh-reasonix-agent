#!/usr/bin/env python3
"""Audit dsh auto-compaction: was each compaction triggered at a sane share of the window?

WHY: dsh-compaction-basic fires when `tokenMeter.measure(session).totalTokens` crosses
`floor(min(W*thresholdRatio, W-O-B))`. That number used to be a pure char-based estimate
(CHARS_PER_TOKEN=4) and could drift far above the real provider prompt.

This tool reads the raw event stream (session.v4.jsonl.zstd) and, for every
`compaction/summary` event, prints:
  * shadowedTokenCount  -- the heuristic ledger the trigger relied on
  * summary prompt       -- real usage of the summarization LLM call (input+cacheRead)
  * pre-compaction real prompt -- last assistant/message usage before the compaction
  * ratio                -- ledger / real  (>=1 means the ledger inflated)

Healthy looks like ratio ~0.6-0.8 (CJK is underestimated by chars/4).
After the usage-first patch, the trigger should land near thresholdRatio * W of REAL prompt.

Usage:
  python compaction-audit.py                 # newest session under ~/.dsh/sessions
  python compaction-audit.py --session a0d5fbf8
  python compaction-audit.py --list
"""
from __future__ import annotations
import argparse, datetime, json, pathlib, sys

SESS_ROOT = pathlib.Path.home() / ".dsh/sessions"


def find_streams() -> list[pathlib.Path]:
    return sorted(SESS_ROOT.glob("*/session-*/session.v4.jsonl.zstd"), key=lambda p: p.stat().st_mtime, reverse=True)


def pick(session_prefix: str | None) -> pathlib.Path:
    streams = find_streams()
    if not streams:
        sys.exit(f"no session streams under {SESS_ROOT}")
    if session_prefix:
        hits = [p for p in streams if session_prefix in p.parent.name]
        if not hits:
            sys.exit(f"no session matching {session_prefix!r}")
        return hits[0]
    return streams[0]


def read_events(path: pathlib.Path):
    """Yield parsed events from a multi-frame zstd JSONL stream."""
    try:
        import zstandard
    except ImportError:
        sys.exit("pip install zstandard")
    import io
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


def real_prompt(usage) -> int | None:
    if not isinstance(usage, dict):
        return None
    if "inputTokens" not in usage:
        return None
    return usage["inputTokens"] + (usage.get("cacheReadTokens") or 0) + (usage.get("cacheWriteTokens") or 0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", help="session id prefix (e.g. a0d5fbf8)")
    ap.add_argument("--list", action="store_true", help="list recent session streams")
    ap.add_argument("--window", type=int, default=1_000_000, help="context window for %% (default 1e6)")
    ap.add_argument("--since", help="only audit compaction events at/after this ISO timestamp (e.g. 2026-10-04T06:00)")
    ap.add_argument("--assert-usage-first", action="store_true", dest="assert_usage_first",
                    help="FAIL (exit 1) unless every audited compaction looks usage-first: ratio<=1.5 and real prompt>=55%% of window")
    ap.add_argument("--assert-legacy-inflation", action="store_true", dest="assert_legacy",
                    help="PASS only if at least one audited compaction shows the legacy inflation (ratio>=3); regression control")
    args = ap.parse_args()
    assert not (args.assert_usage_first and args.assert_legacy), "--assert-usage-first and --assert-legacy-inflation are mutually exclusive"

    if args.list:
        for p in find_streams()[:20]:
            print(f"{p.stat().st_size:>12,}  {p.parent.name}")
        return 0

    path = pick(args.session)
    print(f"session stream: {path}")
    print(f"context window: {args.window:,}\n")

    rows = []
    pending_assistant: list[tuple[int, int]] = []  # (seq, real prompt)
    for ev in read_events(path):
        seq = ev.get("seq")
        typ = ev.get("type")
        if typ == "assistant/message":
            rp = real_prompt((ev.get("data") or {}).get("usage"))
            if rp is not None:
                pending_assistant.append((seq, rp))
                del pending_assistant[:-3]
        elif typ == "compaction/summary":
            d = ev.get("data") or {}
            rng = d.get("shadowedRange") or {}
            rows.append({
                "time": ev.get("time"),
                "seq": seq,
                "heuristic": d.get("shadowedTokenCount"),
                "summary_prompt": real_prompt(d.get("usage")),
                "real_before": pending_assistant[-1][1] if pending_assistant else None,
                "range": f"{rng.get('start')}-{rng.get('end')}" if rng else "?",
                "max_tokens": d.get("maxTokens"),
            })

    if args.since:
        # event["time"] is an int epoch-millisecond stamp; parse the ISO filter to ms
        # first (an int >= str compare raises TypeError).
        try:
            since_ms = int(datetime.datetime.fromisoformat(args.since).timestamp() * 1000)
        except ValueError:
            sys.exit(f"--since must be ISO-8601, e.g. 2026-10-04T14:08 (got {args.since!r})")
        rows = [r for r in rows if isinstance(r.get("time"), int) and r["time"] >= since_ms]
        print(f"filter: keeping compaction events at/after {args.since} ({since_ms} ms) -> {len(rows)} row(s)")
    if not rows:
        print("no compaction/summary events found")
        return 0

    hdr = f"{'#':>3} {'seq':>7} {'shadowedRange':>16} {'ledger(heur)':>13} {'summaryPrompt':>14} {'realPrompt@trigger':>19} {'ratio':>7} {'%window':>8}"
    print(hdr)
    print("-" * len(hdr))
    for i, r in enumerate(rows, 1):
        ratio = (r["heuristic"] / r["summary_prompt"]) if (r["heuristic"] and r["summary_prompt"]) else None
        pct = (r["real_before"] / args.window * 100) if r["real_before"] else None
        print(
            f"{i:>3} {r['seq']:>7} {r['range']:>16} "
            f"{(r['heuristic'] or 0):>13,} {(r['summary_prompt'] or 0):>14,} "
            f"{(r['real_before'] or 0):>19,} "
            f"{(f'{ratio:.2f}' if ratio else 'n/a'):>7} "
            f"{(f'{pct:.1f}%' if pct else 'n/a'):>8}"
        )
    print()
    tail = rows[-1]
    if tail["real_before"]:
        print(f"verdict: last compaction fired at {tail['real_before']/args.window*100:.1f}% of the window "
              f"({tail['real_before']:,} real prompt tokens).")
        print("         healthy target after the usage-first patch: ~80% (thresholdRatio 0.8).")
    print()

    RATIO_MAX = 1.5
    MIN_WINDOW_SHARE = 0.55
    LEGACY_RATIO = 3.0
    bad_ratio = [r for r in rows if r["heuristic"] and r["summary_prompt"] and r["heuristic"] / r["summary_prompt"] > RATIO_MAX]
    thin = [r for r in rows if r["real_before"] and r["real_before"] / args.window < MIN_WINDOW_SHARE]
    inflated = [r for r in rows if r["heuristic"] and r["summary_prompt"] and r["heuristic"] / r["summary_prompt"] >= LEGACY_RATIO]

    if args.assert_usage_first:
        print(f"assert usage-first: {len(rows)} compaction(s) audited "
              f"(ratio<={RATIO_MAX}, real prompt>={MIN_WINDOW_SHARE*100:.0f}% of window)")
        for r in bad_ratio:
            print(f"  FAIL ratio {r['heuristic']/r['summary_prompt']:.2f} at seq {r['seq']} "
                  f"(ledger {r['heuristic']:,} vs summary prompt {r['summary_prompt']:,})")
        for r in thin:
            pct = r["real_before"] / args.window * 100
            print(f"  FAIL fired early at {pct:.1f}% of window, seq {r['seq']} ({r['real_before']:,} real prompt tokens)")
        if bad_ratio or thin:
            print("RESULT: FAIL -- the trigger is still reading the inflated ledger (patch not loaded?)")
            return 1
        print("RESULT: PASS -- every audited compaction read provider usage, not the char-based ledger")
        return 0

    if args.assert_legacy:
        print(f"assert legacy-inflation: need >=1 compaction with ratio>={LEGACY_RATIO}")
        if not inflated:
            print("RESULT: FAIL -- expected at least one inflated compaction; suspect the ledger was already healthy")
            return 1
        for r in inflated:
            print(f"  ok ratio {r['heuristic']/r['summary_prompt']:.2f} at seq {r['seq']}")
        print("RESULT: PASS -- legacy inflation reproduced (regression control holds)")
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
