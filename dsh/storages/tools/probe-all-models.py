#!/usr/bin/env python
"""Full connectivity + reasoning probe over every model the plan advertises.

The relay answers 403 on a rapid burst of distinct-model requests with
{"message":"Authentication failed. Please check your credentials."} -- which is
throttling dressed as an auth failure, and used to put both keys into a 30-minute
cooldown. So this probe is deliberately slow and resumable:

  * one request per model, spacing configurable (default 5s)
  * the outcome of every model is written after EACH request, so a long run can
    be resumed (`--resume`) instead of restarted
  * three consecutive throttles abort the run and keep the partial results

Classifications written per model:
  ok_thinking     200 with reasoning_content  -> declare the 5 relay levels
  ok_non_thinking 200 without reasoning_content -> declare reasoningEfforts: false
  plan_blocked    403 MODEL_NOT_IN_PLAN        -> model is outside the plan
  throttled       403 Authentication failed    -> retry later
  other           anything else (400/5xx/...)

Never prints the API key.

Usage:
  python probe-all-models.py <out.json> [spacing_seconds] [--resume]
"""
import json
import sys
import time
import urllib.error
import urllib.request

GW = "http://127.0.0.1:8788/v1/chat/completions"
MODELS_URL = "http://127.0.0.1:8788/v1/models"
KEYS_PATH = r"D:/Toolbox/goat-gateway/keys.json"
PROMPT = "A farmer has 17 sheep, all but 9 run away. How many are left? Answer in one short sentence."

argv = [a for a in sys.argv[1:] if not a.startswith("--")]
resume = "--resume" in sys.argv
out_path = argv[0]
spacing = float(argv[1]) if len(argv) > 1 else 5.0

_keys = json.load(open(KEYS_PATH, encoding="utf-8"))["keys"]
KEY = next(k["key"] for k in _keys if k.get("enabled"))


def get(url):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + KEY})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def classify(raw, status):
    if status == 200:
        return "throttled"
    if "MODEL_NOT_IN_PLAN" in raw or "gateway_model_not_in_plan" in raw:
        return "plan_blocked"
    # 2026-09-29: 实测同一 key 对 deepseek 得 200、对 google/gemini-3.7-flash 得
    #   403 {"message":"Authentication failed. Please check your credentials."}
    # 所以这是「该 model 的后端 provider 没绑定」，是 model 级结论而不是限流，
    # 不应中止整轮探测。
    if "Authentication failed" in raw:
        return "model_unavailable"
    if "所有 key 均失败" in raw:
        return "throttled"
    return "other"


listing = get(MODELS_URL)["data"]
all_ids = [m["id"] for m in listing]
# Only models reachable through the route's wire protocol.
ids = [m["id"] for m in listing if "/chat/completions" in (m.get("supported_endpoints") or [])]
skipped = [m for m in all_ids if m not in ids]
print(f"advertised={len(all_ids)}  chat/completions-capable={len(ids)}  skipped={len(skipped)}")

state = {"models": {}, "skipped_no_chat_endpoint": skipped}
if resume:
    try:
        prev = json.load(open(out_path, encoding="utf-8"))
        state["models"] = prev.get("models", {})
        done = [k for k, v in state["models"].items()
                if v.get("verdict") in ("ok_thinking", "ok_non_thinking", "plan_blocked", "model_unavailable")]
        print(f"resumed: {len(done)} already classified")
    except FileNotFoundError:
        pass


def save():
    json.dump(state, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


consecutive_throttle = 0
for i, mid in enumerate(ids, 1):
    if state["models"].get(mid, {}).get("verdict") in ("ok_thinking", "ok_non_thinking", "plan_blocked", "model_unavailable"):
        continue
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
        rc = len(msg.get("reasoning_content") or "")
        verdict = "ok_thinking" if rc > 0 else "ok_non_thinking"
        state["models"][mid] = {"verdict": verdict, "reasoning_chars": rc,
                                "content_chars": len(msg.get("content") or ""),
                                "finish": ch.get("finish_reason"), "at": time.strftime("%H:%M:%S")}
        consecutive_throttle = 0
        print(f"[{i:2d}/{len(ids)}] {mid:45s} {verdict:16s} reasoning={rc:5d}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        verdict = classify(raw, e.code)
        state["models"][mid] = {"verdict": verdict, "status": e.code,
                                "error": raw[:300], "at": time.strftime("%H:%M:%S")}
        print(f"[{i:2d}/{len(ids)}] {mid:45s} {verdict:16s} HTTP {e.code} {raw[:70]}")
        if verdict == "throttled":
            consecutive_throttle += 1
            if consecutive_throttle >= 3:
                save()
                print("\nABORT: 3 consecutive throttles -- relax spacing, then rerun with --resume")
                break
    except Exception as e:
        state["models"][mid] = {"verdict": "other", "status": None,
                                "error": f"{type(e).__name__}: {str(e)[:160]}", "at": time.strftime("%H:%M:%S")}
        print(f"[{i:2d}/{len(ids)}] {mid:45s} other            {type(e).__name__}")
    save()
    time.sleep(spacing)

save()
import collections
print("\n" + str(collections.Counter(v.get("verdict") for v in state["models"].values())))
print("wrote", out_path)
