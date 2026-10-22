import io, json, pathlib, zstandard, sys
p = pathlib.Path.home() / ".dsh/sessions/--C-Users-27063--/session-a0d5fbf8-0fb1-419e-9baf-d95df0190144/session.v4.jsonl.zstd"
lo, hi = int(sys.argv[1]), int(sys.argv[2])
with open(p, "rb") as fh:
    with zstandard.ZstdDecompressor().stream_reader(fh, read_across_frames=True) as rd:
        for line in io.TextIOWrapper(rd, encoding="utf-8"):
            line = line.strip()
            if not line: continue
            try: e = json.loads(line)
            except json.JSONDecodeError: continue
            q = e.get("seq")
            if not (isinstance(q, int) and lo <= q <= hi): continue
            d = e.get("data") or {}
            extra = []
            so = e.get("surfaceOp")
            if so is not None: extra.append("surfaceOp=" + json.dumps(so, ensure_ascii=False))
            u = d.get("usage")
            if isinstance(u, dict):
                extra.append("usage in=%s cacheR=%s cacheW=%s out=%s" % (u.get("inputTokens"), u.get("cacheReadTokens"), u.get("cacheWriteTokens"), u.get("outputTokens")))
            for k in ("turn", "step", "shadowedRange", "shadowedTokenCount"):
                if k in d and not isinstance(d[k], dict): extra.append(f"{k}={d[k]}")
            if isinstance(d.get("shadowedRange"), dict): extra.append("shadowedRange=" + json.dumps(d["shadowedRange"]))
            print(f"seq={q:<6} {e.get('type'):<22} " + "  ".join(str(x) for x in extra))
