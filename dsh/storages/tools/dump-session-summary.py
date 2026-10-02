#!/usr/bin/env python3
"""dump-session-summary.py — 快速看一个 dsh session 的骨架 + 错误。

dsh 的 session.v4.jsonl.zstd 是 **concatenated-frame container**（header 一个 frame，
之后每个 append batch 一个 frame），所以必须
`ZstdDecompressor().stream_reader(fh, read_across_frames=True)` 外面再包
`io.BufferedReader(...)`，否则只读到第一个 frame（= 只有 header，事件数 0）。

用法:
    python dump-session-summary.py <session.v4.jsonl.zstd> [--errors N] [--tail N] [--types]
"""
import io, json, sys, collections
import zstandard

def open_log(path):
    fh = open(path, "rb")
    reader = zstandard.ZstdDecompressor().stream_reader(fh, read_across_frames=True)
    return fh, io.BufferedReader(reader)

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); return 2
    path = args[0]
    n_err = 30; n_tail = 0
    if "--errors" in args: n_err = int(args[args.index("--errors")+1])
    if "--tail" in args: n_tail = int(args[args.index("--tail")+1])

    ERR_KEYS = ('"error"', "error:", "failed", "exception", "traceback",
                "enoent", "eaddrinuse", "cannot find", "is not a function",
                "undefined is not", "refused", "timeout", "panic")

    fh, r = open_log(path)
    types = collections.Counter()
    hdr = None
    errors = []
    n = 0
    last = collections.deque(maxlen=max(n_tail, 1))
    try:
        for raw in r:
            if not raw.strip(): continue
            text = raw.decode("utf-8", "replace")
            try:
                ev = json.loads(text)
            except Exception:
                n += 1
                types["<unparsable>"] += 1
                continue
            n += 1
            t = ev.get("type")
            types[t] += 1
            if t == "session" and hdr is None:
                hdr = ev.get("data")
            if n_tail:
                last.append((n, t, text))
            low = text.lower()
            if any(k in low for k in ERR_KEYS) and len(errors) < n_err:
                errors.append((n, ev.get("seq"), t, text))
    finally:
        r.close(); fh.close()

    print(f"file : {path}")
    print(f"events: {n}")
    print()
    print("--- session header ---")
    print(json.dumps(hdr, ensure_ascii=False, indent=2)[:1200] if hdr else "(none)")
    print()
    print("--- event types (desc) ---")
    for k, v in types.most_common(50):
        print(f"{v:>7}  {k}")
    print()
    print(f"--- first {len(errors)} error-ish events ---")
    for i, seq, t, blob in errors:
        print(f"[line {i} seq={seq} {t}] {blob[:500]}")
        print()
    if n_tail:
        print(f"--- last {len(last)} events ---")
        for i, t, blob in last:
            print(f"[line {i} {t}] {blob[:300]}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
