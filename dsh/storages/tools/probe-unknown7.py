#!/usr/bin/env python
"""Slow probe of the 7 models the earlier run could not classify (they were drowned
in the 503 storm caused by the gzip bug). 40s spacing so the 30s authModel cooldown
always expires first -- otherwise one bad model would poison the next one's verdict."""
import json, re, sys, time, urllib.error, urllib.request

GW = "http://127.0.0.1:8788/v1/chat/completions"
KEYS = json.load(open(r"D:/Toolbox/goat-gateway/keys.json", encoding="utf-8"))["keys"]
KEY = next(k["key"] for k in KEYS if k.get("enabled"))
OUT = r"C:/Users/27063/AppData/Local/Temp/probe-unknown7.json"

TARGETS = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex",
           "sakana/fugu-ultra", "inclusionai/ling-3.1-flash:free", "meta/muse-spark-1.1"]

def probe(mid):
    body = {"model": mid, "messages": [{"role": "user", "content": "reply OK"}], "max_tokens": 32}
    req = urllib.request.Request(
        GW, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)

res = {}
for i, m in enumerate(TARGETS, 1):
    st, raw = probe(m)
    try:
        msg = json.loads(raw)["error"]["message"]
    except Exception:
        msg = raw[:150]
    verdict = "OK" if st == 200 else ("plan" if "MODEL_NOT_IN_PLAN" in raw else
              ("auth" if "Authentication failed" in raw else "other"))
    res[m] = {"status": st, "verdict": verdict, "message": msg[:200]}
    print(f"[{i}/{len(TARGETS)}] {m:<34} HTTP {st}  {verdict:<6} {msg[:120]}")
    sys.stdout.flush()
    json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if i < len(TARGETS):
        time.sleep(40)
print("\n写入", OUT)
