import io, json, pathlib, zstandard
p = pathlib.Path.home() / ".dsh/sessions/--C-Users-27063--/session-a0d5fbf8-0fb1-419e-9baf-d95df0190144/session.v4.jsonl.zstd"
ev = []
with open(p, "rb") as fh:
    with zstandard.ZstdDecompressor().stream_reader(fh, read_across_frames=True) as rd:
        for line in io.TextIOWrapper(rd, encoding="utf-8"):
            line = line.strip()
            if line:
                try: ev.append(json.loads(line))
                except json.JSONDecodeError: pass

# last 3 compaction/summary full payloads, minus the giant summary text
sums = [e for e in ev if e.get("type") == "compaction/summary"]
print(f"=== {len(sums)} compaction/summary events; showing last 2 (summary text truncated) ===")
for e in sums[-2:]:
    d = dict(e.get("data") or {})
    if isinstance(d.get("summary"), str):
        d["summary"] = d["summary"][:200] + f"...<{len(e['data']['summary'])} chars>"
    for k in ("checkpointMessage",):
        if k in d: d[k] = "<omitted>"
    print(json.dumps({"seq": e.get("seq"), "time": e.get("time"), "data": d}, ensure_ascii=False, indent=1)[:2500])
    print("-" * 60)

# char mass of the seq range shadowed by the last compaction
last = sums[-1]
rng = (last["data"].get("shadowedRange") or {})
s, en = rng.get("start"), rng.get("end")
print(f"\n=== char mass of seq {s}..{en} (what got shadowed) ===")
tot = 0; per = []
for e in ev:
    q = e.get("seq")
    if isinstance(q, int) and s is not None and s <= q <= en:
        n = len(json.dumps(e.get("data") or {}, ensure_ascii=False))
        tot += n; per.append((n, q, e.get("type")))
per.sort(reverse=True)
print(f"events in range: {len(per)}  total json chars: {tot:,}  (char/4 -> {tot//4:,} tokens)")
print("top 12 by json size:")
for n, q, t in per[:12]:
    print(f"  {n:>10,} chars  seq={q}  {t}")
