#!/usr/bin/env python
"""Probe every chat/completions-capable model on our route for real reasoning
support, so each model's reasoningEfforts can be declared from measurement
instead of a blanket copy.

Relay facts already established by the earlier probe:
  * legal reasoning_effort wire values are exactly low|medium|high|xhigh|max
    (none and minimal are rejected with HTTP 400 by the relay itself)
  * omitting the field is accepted and still produces reasoning_content

So the per-model question is: does this model produce reasoning at all?
  reasoning_content present  -> declare the 5 legal levels
  no reasoning_content       -> declare reasoningEfforts: false (non-reasoning)

Never prints the API key. Writes JSON to argv[1].
"""
import json
import sys
import time
import urllib.error
import urllib.request

GW = "http://127.0.0.1:8788/v1/chat/completions"
KEYS_PATH = r"D:/Toolbox/goat-gateway/keys.json"
MODELS_URL = "http://127.0.0.1:8788/v1/models"
PROMPT = "A farmer has 17 sheep, all but 9 run away. How many are left? Answer in one short sentence."
PROBE_EFFORT = "high"

_keys = json.load(open(KEYS_PATH, encoding="utf-8"))["keys"]
KEY = next(k["key"] for k in _keys if k.get("enabled"))


def post(url, body, timeout=120):
    req = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


models = post(MODELS_URL, None) if False else None
req = urllib.request.Request(MODELS_URL, headers={"Authorization": "Bearer " + KEY})
with urllib.request.urlopen(req, timeout=90) as r:
    listing = json.load(r)["data"]

usable = [m["id"] for m in listing
          if "/chat/completions" in (m.get("supported_endpoints") or [])]
skipped = [m["id"] for m in listing
           if "/chat/completions" not in (m.get("supported_endpoints") or [])]
print(f"models total={len(listing)} usable={len(usable)} skipped={len(skipped)}")
print("skipped:", ", ".join(skipped))

results = {}
for i, mid in enumerate(usable, 1):
    body = {"model": mid, "max_tokens": 400, "reasoning_effort": PROBE_EFFORT,
            "messages": [{"role": "user", "content": PROMPT}]}
    try:
        d = post(GW, body)
        ch = (d.get("choices") or [{}])[0]
        msg = ch.get("message") or {}
        rc = msg.get("reasoning_content") or ""
        results[mid] = {"ok": True, "reasoning_chars": len(rc),
                        "content_chars": len(msg.get("content") or ""),
                        "finish": ch.get("finish_reason")}
        print(f"[{i:2d}/{len(usable)}] {mid:45s} reasoning={len(rc):5d} content={len(msg.get('content') or ''):4d} {ch.get('finish_reason')}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")[:200]
        results[mid] = {"ok": False, "status": e.code, "error": raw}
        print(f"[{i:2d}/{len(usable)}] {mid:45s} HTTP {e.code} {raw[:120]}")
    except Exception as e:
        results[mid] = {"ok": False, "status": None, "error": f"{type(e).__name__}: {str(e)[:160]}"}
        print(f"[{i:2d}/{len(usable)}] {mid:45s} ERR {type(e).__name__} {str(e)[:100]}")
    time.sleep(0.2)

out = sys.argv[1] if len(sys.argv) > 1 else "reasoning-probe.json"
json.dump({"results": results, "skipped": skipped}, open(out, "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
think = sum(1 for v in results.values() if v.get("ok") and v.get("reasoning_chars", 0) > 0)
nothink = sum(1 for v in results.values() if v.get("ok") and v.get("reasoning_chars", 0) == 0)
failed = sum(1 for v in results.values() if not v.get("ok"))
print(f"\nthinking={think}  non-thinking={nothink}  failed={failed}  -> {out}")
