#!/usr/bin/env python
"""Probe which reasoning_effort wire values our route (gateway -> commandcode.ai,
openai-completions + thinkingFormat=deepseek) actually accepts, and whether the
value influences the amount of thinking.

Why: pi-ai's builtin catalog gives authoritative thinkingLevelMap for 59 of our 84
model ids, but 25 have no catalog entry at all (deepseek-v4.1-*, claude-*-5-5,
gpt-6-*, xiaomi/mimo-v2.6-*, Qwen/Qwen3.8-Max, ...). For those we must measure.

Never prints the API key.
"""
import json
import time
import urllib.error
import urllib.request

GW = "http://127.0.0.1:8788/v1/chat/completions"
KEYS_PATH = r"D:/Toolbox/goat-gateway/keys.json"
EFFORTS = ["<none>", "none", "minimal", "low", "medium", "high", "xhigh", "max"]
MODELS = [
    "deepseek/deepseek-v4.1-flash",   # our live model, MISS in pi-ai catalog
    "deepseek/deepseek-v4-flash",     # catalog says: off/high/xhigh only
    "claude-sonnet-5",                # catalog says: xhigh/max only
]
PROMPT = "Reply with the single word OK."

_keys = json.load(open(KEYS_PATH, encoding="utf-8"))["keys"]
KEY = next(k["key"] for k in _keys if k.get("enabled"))


def call(model, effort, timeout=120):
    body = {"model": model, "max_tokens": 256,
            "messages": [{"role": "user", "content": PROMPT}]}
    if effort != "<none>":
        body["reasoning_effort"] = effort
    req = urllib.request.Request(
        GW, data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY},
    )
    t = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")[:220]
        return e.code, None, raw, time.time() - t
    except Exception as e:
        return None, None, f"{type(e).__name__}: {str(e)[:200]}", time.time() - t
    ch = (d.get("choices") or [{}])[0]
    msg = ch.get("message") or {}
    rc = msg.get("reasoning_content") or ""
    return 200, {"reasoning_chars": len(rc),
                 "content": (msg.get("content") or "")[:40].replace("\n", " "),
                 "finish": ch.get("finish_reason")}, "", time.time() - t


for model in MODELS:
    print(f"\n===== {model}")
    for effort in EFFORTS:
        status, info, err, el = call(model, effort)
        if status == 200 and info:
            print(f"  {effort:8s}  200  reasoning={info['reasoning_chars']:5d} chars"
                  f"  finish={info['finish']}  {el:.1f}s  {info['content']!r}")
        else:
            print(f"  {effort:8s}  {status}  {el:.1f}s  {err}")
