#!/usr/bin/env python3
"""usage-overview.py -- 双机四 agent 用量总视图（读法 A: {Windows,Linux} x {dsh,reasonix}）

数据源（每台机器各自跑一次本脚本）：
  1. dsh      : <DSH_HOME>/storages/session_projcache/sessions/*.json
                每个文件 = 一个 session；记录 record.rows.{tokenUsage,sessionStats,modelSelection,title}
  2. reasonix : <reasonix>/stats/*.jsonl   （Windows %APPDATA%\\reasonix\\stats，Linux ~/.reasonix/stats）
                每行 = 一次请求，自带 cost_amount / cost_currency (CNY)

用法：
  python usage-overview.py                          # 只统计本机，打印表格
  python usage-overview.py --machine win --json out.json
  python usage-overview.py --merge win.json linux.json   # 合并两机产物成四格总视图

口径说明：
  - dsh 侧 session 记录里没有成本字段，价格来自 dsh-context-price-overlay.json（USD / 1M tok）
    + 内置兜底表；CNY = USD / USD_PER_CNY(0.15)。
  - reasonix 侧直接用它自报的 cost_amount（CNY，已含 cache hit/miss 区分）。
  - token bucket 口径：dsh 的 cacheReadTokens = cache hit；uncachedInputTokens = cache miss；
    outputTokens 含 reasoning（dsh 不单列）。reasonix 单列 reasoning。
"""
import argparse
import glob
import io
import json
import os
import sys
from collections import defaultdict

USD_PER_CNY = 0.15

# 兜底价目（USD / 1M tokens）。key = (provider, model)
# 优先读 <dsh_home>/storages/dsh-context-price-overlay.json 的 prices 段。
FALLBACK_PRICES = {
    ("commandcode-goat", "deepseek/deepseek-v4.1-flash"): {"hit": 0.0030285, "miss": 0.151425, "out": 0.6057},
    ("deepseek-official", "deepseek/deepseek-v4-flash"): {"hit": 0.003, "miss": 0.15, "out": 0.6},
    ("deepseek-official", "deepseek/deepseek-v4-pro"): {"hit": 0.003625, "miss": 0.435, "out": 0.87},
}

BUCKETS = ("cacheRead", "uncachedInput", "output", "cacheWrite")


def norm_key(provider, model):
    return (provider or "?", model or "?")


def split_prefixed(model):
    """reasonix 的 model 形如 'commandcode-goat/deepseek/deepseek-v4.1-flash' -> (provider, model)."""
    if not model:
        return ("?", "?")
    if "/" in model:
        p, m = model.split("/", 1)
        return (p, m)
    return ("?", model)


def load_prices(dsh_home):
    path = os.path.join(dsh_home, "storages", "dsh-context-price-overlay.json")
    prices = dict(FALLBACK_PRICES)
    if os.path.isfile(path):
        try:
            with io.open(path, encoding="utf-8") as fh:
                ov = json.load(fh)
            for pid, models in (ov.get("prices") or {}).items():
                for mid, r in models.items():
                    prices[(pid, mid)] = {
                        "hit": r.get("hit"),
                        "miss": r.get("miss"),
                        "write": r.get("write"),
                        "out": r.get("out"),
                    }
        except Exception as exc:  # noqa: BLE001
            print("warn: overlay parse failed: %s" % exc, file=sys.stderr)
    return prices


def price_of(prices, provider, model):
    """精确匹配 -> 同 model 跨 provider -> None。不做兜底猜测。"""
    k = (provider, model)
    if k in prices:
        return prices[k]
    for (p, m), r in prices.items():
        if m == model:
            return r
    return None


def cost_usd(rate, b):
    if rate is None:
        return None
    return (
        b["cacheRead"] * (rate.get("hit") or 0)
        + b["uncachedInput"] * (rate.get("miss") or 0)
        + b["output"] * (rate.get("out") or 0)
        + b["cacheWrite"] * (rate.get("write") or 0)
    ) / 1e6


def blank_bucket():
    return dict.fromkeys(BUCKETS, 0)


def scan_dsh(dsh_home, prices):
    """-> (per_key, per_day, n_sessions, skipped)

    The cost is computed HERE, at collection time, so that --merge only adds up
    numbers and never depends on the other machine's price table.
    """
    root = os.path.join(dsh_home, "storages", "session_projcache", "sessions")
    files = sorted(glob.glob(os.path.join(root, "*.json")))
    per_key = defaultdict(lambda: {"buckets": blank_bucket(), "sessions": 0, "steps": 0,
                                   "llmMs": 0, "cost_cny": 0.0, "priced": False})
    per_day = defaultdict(lambda: {"buckets": blank_bucket(), "sessions": 0})
    skipped = 0
    for fp in files:
        try:
            with io.open(fp, encoding="utf-8") as fh:
                d = json.load(fh)
        except Exception:  # noqa: BLE001
            skipped += 1
            continue
        rec = d.get("record") or {}
        rows = rec.get("rows") or {}
        ident = rec.get("identity") or {}
        ms = ((rows.get("modelSelection") or {}).get("val") or {})
        lu = ms.get("lastUsed") or {}
        key = norm_key(lu.get("provider"), lu.get("model"))
        tu = ((rows.get("tokenUsage") or {}).get("val") or {})
        t = tu.get("totals") or {}
        b = {
            "cacheRead": int(t.get("cacheReadTokens") or 0),
            "uncachedInput": int(t.get("uncachedInputTokens") or 0),
            "output": int(t.get("outputTokens") or 0),
            "cacheWrite": int(t.get("cacheWriteTokens") or 0),
        }
        st = ((rows.get("sessionStats") or {}).get("val") or {})
        e = per_key[key]
        for k in BUCKETS:
            e["buckets"][k] += b[k]
        e["sessions"] += 1
        e["steps"] += int(st.get("steps") or 0)
        e["llmMs"] += int(st.get("llmMs") or 0)
        rate = price_of(prices, *key)
        u = cost_usd(rate, b)
        if u is not None:
            e["cost_cny"] += u / USD_PER_CNY
            e["priced"] = True
        ts = ident.get("createdAt")
        if ts:
            day = __import__("datetime").datetime.fromtimestamp(ts / 1000, __import__("datetime").UTC).strftime("%Y-%m-%d")
            pd = per_day[day]
            pd["sessions"] += 1
            for k in BUCKETS:
                pd["buckets"][k] += b[k]
    return per_key, per_day, len(files), skipped


def reasonix_stats_dir(candidates=None):
    if candidates is None:
        appdata = os.environ.get("APPDATA")
        candidates = []
        if appdata:
            candidates.append(os.path.join(appdata, "reasonix", "stats"))
        candidates.append(os.path.join(os.path.expanduser("~"), ".reasonix", "stats"))
    for c in candidates:
        if os.path.isdir(c):
            return c
    return candidates[0] if candidates else None


def scan_reasonix(stats_dir):
    """-> (per_key, per_day, n_files, n_lines, reported_cny, n_unpriced)"""
    per_key = defaultdict(lambda: {"buckets": blank_bucket(), "requests": 0, "cost_cny": 0.0, "reported_lines": 0})
    per_day = defaultdict(lambda: {"buckets": blank_bucket(), "requests": 0, "cost_cny": 0.0})
    files = sorted(glob.glob(os.path.join(stats_dir, "*.jsonl"))) if stats_dir else []
    n_lines = 0
    unpriced = 0
    for fp in files:
        for line in io.open(fp, encoding="utf-8", errors="replace"):
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except Exception:  # noqa: BLE001
                continue
            n_lines += 1
            key = split_prefixed(d.get("model"))
            b = {
                "cacheRead": int(d.get("cache_hit") or 0),
                "uncachedInput": int(d.get("cache_miss") or 0),
                "output": int(d.get("completion") or 0),
                "cacheWrite": 0,
            }
            e = per_key[key]
            for k in BUCKETS:
                e["buckets"][k] += b[k]
            e["requests"] += int(d.get("requests") or 1)
            amt = d.get("cost_amount")
            if amt is not None and d.get("cost_currency") in (None, "CNY"):
                try:
                    e["cost_cny"] += float(amt)
                    e["reported_lines"] += 1
                except Exception:  # noqa: BLE001
                    pass
            else:
                unpriced += 1
            day = str(d.get("ts") or "")[:10]
            if day:
                pd = per_day[day]
                pd["requests"] += int(d.get("requests") or 1)
                for k in BUCKETS:
                    pd["buckets"][k] += b[k]
                if amt is not None and d.get("cost_currency") in (None, "CNY"):
                    try:
                        pd["cost_cny"] += float(amt)
                    except Exception:  # noqa: BLE001
                        pass
    return per_key, per_day, len(files), n_lines, unpriced


def fmt_int(n):
    return "{:,}".format(int(n))


def print_table(title, per_key, prices, reported=None):
    print()
    print("=" * 108)
    print(title)
    print("=" * 108)
    hdr = "%-46s %9s %11s %11s %11s %13s %12s" % (
        "provider / model", "sessions", "cacheRead", "uncached", "output", "CNY", "source")
    print(hdr)
    print("-" * 108)
    tot = blank_bucket()
    tot_cny = 0.0
    for key in sorted(per_key, key=lambda k: -sum(per_key[k]["buckets"].values())):
        e = per_key[key]
        b = e["buckets"]
        for k in BUCKETS:
            tot[k] += b[k]
        cny = float(e.get("cost_cny") or 0.0)
        if "reported_lines" in e:          # reasonix: cost as reasonix itself reported
            src = "reported"
        elif e.get("priced"):
            src = "priced"
        else:
            src = "NOPRICE"
        tot_cny += cny
        n = e.get("sessions", e.get("requests", 0))
        print("%-46s %9s %11s %11s %11s %13.4f %12s" % (
            (key[0] + " / " + key[1])[:46], fmt_int(n),
            fmt_int(b["cacheRead"]), fmt_int(b["uncachedInput"]), fmt_int(b["output"]),
            cny, src))
    print("-" * 108)
    print("%-46s %9s %11s %11s %11s %13.4f" % (
        "TOTAL", "", fmt_int(tot["cacheRead"]), fmt_int(tot["uncachedInput"]),
        fmt_int(tot["output"]), tot_cny))
    print("  total tokens = %s   (cacheWrite %s)" % (
        fmt_int(sum(tot.values())), fmt_int(tot["cacheWrite"])))
    return tot, tot_cny


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--machine", default=os.environ.get("COMPUTERNAME") or os.uname().nodename)
    ap.add_argument("--dsh-home", default=os.environ.get("DSH_HOME") or os.path.join(os.path.expanduser("~"), ".dsh"))
    ap.add_argument("--reasonix-stats", default=None)
    ap.add_argument("--json", dest="json_out", default=None)
    ap.add_argument("--merge", nargs="+", default=None)
    ap.add_argument("--days", type=int, default=0, help="只显示最近 N 天的日表")
    args = ap.parse_args()

    if args.merge:
        return merge_view(args.merge, args.days)

    prices = load_prices(args.dsh_home)
    dk, dd, dn, dskip = scan_dsh(args.dsh_home, prices)
    rs = args.reasonix_stats or reasonix_stats_dir()
    rk, rd, rn, rl, runp = scan_reasonix(rs)

    print("machine   : %s" % args.machine)
    print("dsh home  : %s" % args.dsh_home)
    print("dsh       : %d session json, %d unreadable" % (dn, dskip))
    print("reasonix  : %s  (%d files, %d lines, %d lines without CNY cost)" % (rs, rn, rl, runp))

    dtot, dcny = print_table("dsh  (cost estimated from overlay prices, CNY)", dk, prices)
    rtot, rcny = print_table("reasonix  (cost as reported by reasonix, CNY)", rk, prices)

    print()
    print("=" * 108)
    print("MACHINE SUMMARY  %s" % args.machine)
    print("=" * 108)
    print("  dsh      tokens %18s   CNY %12.4f" % (fmt_int(sum(dtot.values())), dcny))
    print("  reasonix tokens %18s   CNY %12.4f" % (fmt_int(sum(rtot.values())), rcny))
    print("  TOGETHER tokens %18s   CNY %12.4f" % (
        fmt_int(sum(dtot.values()) + sum(rtot.values())), dcny + rcny))

    if args.json_out:
        payload = {
            "machine": args.machine,
            "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "dsh": {"perKey": {("%s\t%s" % k): v for k, v in dk.items()}, "perDay": dict(dd), "sessions": dn},
            "reasonix": {"perKey": {("%s\t%s" % k): v for k, v in rk.items()}, "perDay": dict(rd), "files": rn},
        }
        with io.open(args.json_out, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, ensure_ascii=False, indent=1))
        print("\nwrote %s" % args.json_out)
    return 0


def merge_view(paths, days=0):
    grid = {}
    for p in paths:
        with io.open(p, encoding="utf-8") as fh:
            d = json.load(fh)
        m = d.get("machine") or p
        for agent in ("dsh", "reasonix"):
            sec = d.get(agent) or {}
            tot = blank_bucket()
            cny = 0.0
            for k, v in (sec.get("perKey") or {}).items():
                b = v.get("buckets") or {}
                for kk in BUCKETS:
                    tot[kk] += int(b.get(kk) or 0)
                cny += float(v.get("cost_cny") or 0)
            grid[(m, agent)] = (tot, cny, sec)
    print()
    print("=" * 100)
    print("DUAL-MACHINE x DUAL-AGENT GRAND TOTAL")
    print("=" * 100)
    print("%-12s %-10s %14s %14s %14s %12s" % ("machine", "agent", "cacheRead", "uncached", "output", "CNY"))
    print("-" * 100)
    gtot = blank_bucket()
    gcny = 0.0
    for (m, agent) in sorted(grid):
        tot, cny, _ = grid[(m, agent)]
        for k in BUCKETS:
            gtot[k] += tot[k]
        gcny += cny
        print("%-12s %-10s %14s %14s %14s %12.4f" % (
            m, agent, fmt_int(tot["cacheRead"]), fmt_int(tot["uncachedInput"]),
            fmt_int(tot["output"]), cny))
    print("-" * 100)
    print("%-23s %14s %14s %14s %12.4f" % (
        "GRAND TOTAL", fmt_int(gtot["cacheRead"]), fmt_int(gtot["uncachedInput"]),
        fmt_int(gtot["output"]), gcny))
    print("  total tokens = %s" % fmt_int(sum(gtot.values())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
