#!/usr/bin/env python
"""复查全部 model 的 reasoning 能力 —— 同时识别两种字段名。

WHY（2026-09-30 发现的误判）
    旧脚本 probe-model-reasoning.py 只看 `choices[0].message.reasoning_content`。
    但 google/gemini-* 用的是 **`reasoning_details`**（type: reasoning.encrypted），
    于是 `google/gemini-3.8-flash` 被标成 reasoningEfforts: false ——
    而实测它接受 reasoning_effort=low/high/max 且确实返回思考内容。
    ⇒ 只看一个字段名会系统性漏判，这里两种都认。

判定
    levels_ok   200：该 model 接受 reasoning_effort，且响应含思考内容 → 应配五档
    no_reason   200，但既无 reasoning_content 也无 reasoning_details → 配 false
    rejected    400：不接受 reasoning_effort → 配 false
    err_403     403：套餐外/认证失败（与 reasoning 无关）
    other       其它

用法：python probe-reasoning-all.py <out.json> [spacing]
"""
import json, re, sys, time, urllib.error, urllib.request

GW = "http://127.0.0.1:8788/v1/chat/completions"
KEYS = json.load(open(r"D:/Toolbox/goat-gateway/keys.json", encoding="utf-8"))["keys"]
KEY = next(k["key"] for k in KEYS if k.get("enabled"))
DUMP = r"C:/Users/27063/AppData/Local/Temp/dcw.yaml"

argv = [a for a in sys.argv[1:] if not a.startswith("--")]
OUT = argv[0]
SPACING = float(argv[1]) if len(argv) > 1 else 5.0

# 从白名单读，而不是从 dump-config 抓 —— 后者会连带抓到 llm-pi-ai 之后所有段的
# `- id:`（实测抓到 122 个，把插件 row 也当成了 model），范围错得离谱。
ALLOWLIST = json.load(open(r"D:/Toolbox/goat-gateway/model-allowlist.json", encoding="utf-8"))
MODELS = ALLOWLIST["models"]
print(f"待测 {len(MODELS)} 个 model，间隔 {SPACING}s，预计 {len(MODELS)*SPACING/60:.1f} 分钟\n")

def probe(mid):
    body = {"model": mid, "messages": [{"role": "user", "content": "What is 17*23? Think it through."}],
            "max_tokens": 300, "reasoning_effort": "high"}
    req = urllib.request.Request(
        GW, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=150) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)

res = {}
try:
    res = json.load(open(OUT, encoding="utf-8"))
except Exception:
    pass

for n, mid in enumerate(MODELS, 1):
    if mid in res:
        print(f"[{n}/{len(MODELS)}] {mid:<38} 已有({res[mid]['verdict']}) 跳过")
        continue
    st, raw = probe(mid)
    verdict, detail = "other", ""
    if st == 200:
        try:
            msg = json.loads(raw)["choices"][0]["message"]
            has_rc = bool(msg.get("reasoning_content"))
            has_rd = bool(msg.get("reasoning_details"))
            verdict = "levels_ok" if (has_rc or has_rd) else "no_reason"
            detail = ("reasoning_content" if has_rc else "") + ("+reasoning_details" if has_rd else "")
            if not detail: detail = "(none)"
        except Exception as e:
            detail = f"parse:{e}"
    elif st == 400:
        verdict = "rejected"; detail = raw[:110]
    elif st == 403:
        verdict = "err_403"; detail = raw[:110]
    res[mid] = {"status": st, "verdict": verdict, "detail": detail}
    json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"[{n}/{len(MODELS)}] {mid:<38} {st}  {verdict:<10} {detail[:70]}")
    sys.stdout.flush()
    if n < len(MODELS):
        time.sleep(SPACING)

from collections import Counter
print("\n=== 汇总 ===")
for k, v in Counter(x["verdict"] for x in res.values()).most_common():
    print(f"  {k:<10} {v}")
print(f"\n写入 {OUT}")
