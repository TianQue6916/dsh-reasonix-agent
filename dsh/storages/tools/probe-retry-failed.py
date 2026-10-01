#!/usr/bin/env python
"""Re-probe only the models that failed in the previous full sweep.

The full sweep got rate-limited by the relay after ~45 rapid distinct-model
requests: it then answers 403 {"message":"Authentication failed. Please check
your credentials.","type":"permission_error"} -- which carries none of the
Cloudflare markers, so isCloudflareBlock() cannot recognise it and the gateway
treats it as a genuine credential failure. Slowing down is the fix; the probe
itself was at fault, not the configuration.

Usage: python probe-retry-failed.py <prev.json> <out.json> [delay_seconds]
"""
import json
import sys
import time
import urllib.error
import urllib.request

GW = "http://127.0.0.1:8788/v1/chat/completions"
KEYS_PATH = r"D:/Toolbox/goat-gateway/keys.json"
PROMPT = "A farmer has 17 sheep, all but 9 run away. How many are left? Answer in one short sentence."

prev_path = sys.argv[1]
out_path = sys.argv[2]
delay = float(sys.argv[3]) if len(sys.argv) > 3 else 1.5

_keys = json.load(open(KEYS_PATH, encoding="utf-8"))["keys"]
KEY = next(k["key"] for k in _keys if k.get("enabled"))
prev = json.load(open(prev_path, encoding="utf-8"))
results = prev["results"]

todo = [m for m, v in results.items() if not v.get("ok")]
print(f"retrying {len(todo)} models with {delay}s spacing")
for i, mid in enumerate(todo, 1):
    body = {"model": mid, "max_tokens": 400, "reasoning_effort": "high",
            "messages": [{"role": "user", "content": PROMPT}]}
    req = urllib.request.Request(
        GW, data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.load(r)
        ch = (d.get("choices") or [{}])[0]
        msg = ch.get("message") or {}
        rc = msg.get("reasoning_content") or ""
        results[mid] = {"ok": True, "reasoning_chars": len(rc),
                        "content_chars": len(msg.get("content") or ""),
                        "finish": ch.get("finish_reason")}
        tag = "THINK   " if len(rc) > 0 else "nothink "
        print(f"[{i:2d}/{len(todo)}] {mid:45s} {tag} reasoning={len(rc):5d}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")[:200]
        isplan = "gateway_model_not_in_plan" in raw or "MODEL_NOT_IN_PLAN" in raw
        results[mid] = {"ok": False, "status": e.code, "error": raw, "plan_blocked": isplan}
        print(f"[{i:2d}/{len(todo)}] {mid:45s} HTTP {e.code} {'PLAN-BLOCKED' if isplan else raw[:80]}")
    except Exception as e:
        results[mid] = {"ok": False, "status": None, "error": f"{type(e).__name__}: {str(e)[:160]}"}
        print(f"[{i:2d}/{len(todo)}] {mid:45s} ERR {type(e).__name__}")
    time.sleep(delay)

json.dump(prev, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
think = sum(1 for v in results.values() if v.get("ok") and v.get("reasoning_chars", 0) > 0)
noth = sum(1 for v in results.values() if v.get("ok") and v.get("reasoning_chars", 0) == 0)
plan = sum(1 for v in results.values() if v.get("plan_blocked"))
still = sum(1 for v in results.values() if not v.get("ok") and not v.get("plan_blocked"))
print(f"\nTOTALS thinking={think} non-thinking={noth} plan-blocked={plan} other-fail={still}")
print("wrote", out_path)
