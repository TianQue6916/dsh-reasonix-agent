#!/usr/bin/env python3
"""connectivity-history — 从**已有** session 日志折叠 provider 连通性时序。

零成本：不发起任何模型请求，只读 ~/.dsh/sessions/**/session.v4.jsonl.zstd。
思路（社区范式，shengbinxu/dsh-llm-latency 同一路线）：
    真实调用已经发生了，延迟/失败就写在地上，再探测一遍是浪费。
字段来源（每条事件都带 seq + time=epoch ms）：
    step/start.time                     -> 本轮请求起始
    assistant/attempt.stream[0].time    -> 首包时刻 => TTFT
    step/end.time                       -> step 墙钟
    request/header.data.header.config   -> provider / model 归属
    llm/retry.data.failure.code         -> 失败分类（TRANSPORT/RATE_LIMIT/TIMEOUT/SERVER/EMPTY_RESPONSE）
用法：python ~/.dsh/tools/connectivity-history.py [--days N] [--json out.json] [--plot out.png]
"""
from __future__ import annotations
import io, json, os, sys, collections, datetime as dt
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor

DSH = Path(os.environ.get("DSH_HOME") or Path.home() / ".dsh")


def fold_one(path_str: str) -> list[dict]:
    import zstandard as zstd
    out: list[dict] = []
    try:
        raw = Path(path_str).read_bytes()
        data = zstd.ZstdDecompressor().stream_reader(io.BytesIO(raw)).read().decode("utf-8", "replace")
    except Exception:
        return out
    cfg = {"provider": None, "model": None}
    step_start = None
    first_chunk = None
    retries: list[dict] = []
    turn_reason = None
    in_step = False

    def flush(end_time):
        nonlocal step_start, first_chunk, retries
        if step_start is None:
            return
        out.append({
            "t": step_start,
            "provider": cfg["provider"],
            "model": cfg["model"],
            "ttft_ms": (first_chunk - step_start) if first_chunk else None,
            "step_ms": (end_time - step_start) if end_time else None,
            "retries": len(retries),
            "failures": [r["code"] for r in retries if r.get("code")],
            "turn_reason": turn_reason,
        })
        step_start, first_chunk, retries = None, None, []

    for line in data.splitlines():
        if not line.strip():
            continue
        try:
            e = json.loads(line)
        except Exception:
            continue
        t = e.get("type")
        tm = e.get("time")
        d = e.get("data") or {}
        if t == "request/header":
            c = ((d.get("header") or {}).get("config") or {})
            if c.get("provider"):
                cfg = {"provider": c.get("provider"), "model": c.get("model")}
        elif t == "step/start":
            flush(None)          # 上一个 step 没收到 end（会话中断），先落盘
            step_start, first_chunk, retries = tm, None, []
            in_step = True
        elif t == "assistant/attempt" and in_step:
            if first_chunk is None:
                for chunk in (d.get("stream") or []):
                    ct = chunk.get("time") or chunk.get("time0")
                    if ct:
                        first_chunk = ct
                        break
        elif t == "llm/retry" and in_step:
            f = d.get("failure") or {}
            retries.append({"code": f.get("code"), "delayMs": d.get("delayMs"),
                            "retry": d.get("retry"), "msg": (f.get("message") or "")[:120]})
        elif t == "step/end":
            flush(tm)
            in_step = False
        elif t == "turn/end":
            turn_reason = ((d.get("reason") or {}).get("kind"))
    flush(None)
    return out


def main(argv: list[str]) -> int:
    days = 7
    if "--days" in argv:
        days = int(argv[argv.index("--days") + 1])
    files = sorted(str(p) for p in DSH.glob("sessions/*/*/session.v4.jsonl.zstd"))
    cutoff = (dt.datetime.now() - dt.timedelta(days=days)).timestamp() * 1000
    rows: list[dict] = []
    with ProcessPoolExecutor(max_workers=4) as ex:      # 本机 CPU 密集 4 路是拐点
        for part in ex.map(fold_one, files, chunksize=16):
            rows.extend(part)
    rows = [r for r in rows if r["t"] and r["t"] >= cutoff]
    rows.sort(key=lambda r: r["t"])
    print(f"scanned {len(files)} session files; steps in last {days}d: {len(rows)}")

    if not rows:
        return 0
    by_provider = collections.Counter((r["provider"] or "?" for r in rows))
    print("\n-- requests by provider --")
    for p, n in by_provider.most_common():
        print(f"  {n:5d}  {p}")

    fails = collections.Counter()
    for r in rows:
        for f in r["failures"]:
            fails[f] += 1
    if fails:
        print("\n-- retry failure codes --")
        for f, n in fails.most_common():
            print(f"  {n:4d}  {f}")
    n_retry = sum(1 for r in rows if r["retries"])
    print(f"\nsteps with >=1 retry: {n_retry}/{len(rows)} = {n_retry/len(rows):.1%}")

    tt = sorted(r["ttft_ms"] for r in rows if r["ttft_ms"])
    if tt:
        def q(p): return tt[min(len(tt)-1, int(len(tt)*p))]
        print(f"TTFT  p50={q(.5)/1000:.1f}s  p90={q(.9)/1000:.1f}s  p99={q(.99)/1000:.1f}s  max={tt[-1]/1000:.1f}s")

    # 按小时聚合
    hourly: dict[str, dict] = {}
    for r in rows:
        k = dt.datetime.fromtimestamp(r["t"]/1000).strftime("%m-%d %H")
        h = hourly.setdefault(k, {"n": 0, "ttft": [], "fail": 0})
        h["n"] += 1
        if r["ttft_ms"]:
            h["ttft"].append(r["ttft_ms"])
        h["fail"] += len(r["failures"])
    print("\n-- hourly (TTFT p50 / failures) --")
    for k in sorted(hourly)[-48:]:
        h = hourly[k]
        v = sorted(h["ttft"])
        p50 = f"{v[len(v)//2]/1000:5.1f}s" if v else "   -- "
        bar = "#" * min(40, int((v[len(v)//2]/1000) if v else 0))
        mark = "!!" if h["fail"] else "  "
        print(f"  {k}  n={h['n']:3d}  p50={p50}  fail={h['fail']:2d} {mark} {bar}")

    if "--json" in argv:
        out = argv[argv.index("--json") + 1]
        Path(out).write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        print(f"\nwrote {out} ({len(rows)} rows)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
