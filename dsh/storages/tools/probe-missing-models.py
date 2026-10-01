#!/usr/bin/env python
"""Probe the models the plan advertises but our model list omits.

WHY A SEPARATE SCRIPT（与 probe-all-models.py 的关键区别）
    probe-all-models.py 的 body 里**硬带 reasoning_effort: "high"**。
    这对不支持该参数的 model 会返回 400 —— 那是**参数不兼容**，不是**连不上**，
    却会被分类成 other/失败，把"其实可用"的 model 静默判死。
    本脚本只发 model + messages + max_tokens，不碰 reasoning_effort。

分类
    ok            200
    plan_403      403 MODEL_NOT_IN_PLAN        → 套餐外，换 key 无效
    auth_403      403 Authentication failed    → 节流伪装成鉴权失败，需降速重试
    endpoint_400  400 提到 endpoint/不支持     → 该 model 不在 /chat/completions 上
    param_400     400 其它参数问题
    other         其它

Usage:
  python probe-missing-models.py <out.json> [spacing_s] [--all]
    默认只测「套餐有、我方 model list 没有」的那些；--all 测全部 86 个。
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request

GW = "http://127.0.0.1:8788/v1/chat/completions"
MODELS_URL = "http://127.0.0.1:8788/v1/models"
KEYS_PATH = r"D:/Toolbox/goat-gateway/keys.json"
DUMP = r"C:/Users/27063/AppData/Local/Temp/dcw.yaml"
PROMPT = "Reply with exactly: OK"

argv = [a for a in sys.argv[1:] if not a.startswith("--")]
out_path = argv[0]
spacing = float(argv[1]) if len(argv) > 1 else 4.0
probe_all = "--all" in sys.argv

_keys = json.load(open(KEYS_PATH, encoding="utf-8"))["keys"]
KEY = next(k["key"] for k in _keys if k.get("enabled"))


def plan_models():
    req = urllib.request.Request(MODELS_URL, headers={"Authorization": "Bearer " + KEY})
    with urllib.request.urlopen(req, timeout=60) as r:
        return [m["id"] for m in json.load(r)["data"]]


def my_models():
    s = open(DUMP, encoding="utf-8").read()
    m = re.search(r"\n(\s*)models:\s*\n", s)
    seg = s[m.end():]
    ids = re.findall(r"^\s*-\s*id:\s*(\S+)\s*$", seg, re.M)
    # model 段只到下一个顶层键；前 N 个是 model，其它是插件 row。
    # 用「是否出现在套餐列表里」来判定，比数数更稳。
    return ids


def classify(status, body):
    if status == 200:
        return "ok"
    text = body or ""
    if status == 403 and "MODEL_NOT_IN_PLAN" in text:
        return "plan_403"
    if status == 403 and "Authentication failed" in text:
        return "auth_403"
    if status == 400:
        if re.search(r"not supported on this endpoint|unsupported_model", text):
            return "endpoint_400"
        return "param_400"
    return "other"


def probe(mid):
    body = {"model": mid, "messages": [{"role": "user", "content": PROMPT}], "max_tokens": 32}
    req = urllib.request.Request(
        GW,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # network / timeout
        return 0, str(e)


plan = plan_models()
mine = set(my_models())
missing = [m for m in plan if m not in mine]
targets = plan if probe_all else missing

print(f"plan={len(plan)}  mine={len(mine)}  missing={len(missing)}  probing={len(targets)}")
print(f"spacing={spacing}s  -> 预计 {len(targets) * spacing / 60:.1f} 分钟\n")

state = {"classified": {}, "raw": {}}
try:
    state = json.load(open(out_path, encoding="utf-8"))
except Exception:
    pass

throttle_streak = 0
for i, mid in enumerate(targets, 1):
    if mid in state["classified"]:
        print(f"[{i}/{len(targets)}] {mid:<44} 已完成({state['classified'][mid]}) 跳过")
        continue
    status, raw = probe(mid)
    kind = classify(status, raw)
    state["classified"][mid] = kind
    state["raw"][mid] = {"status": status, "body": raw[:600]}
    json.dump(state, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    detail = ""
    if kind != "ok":
        try:
            detail = json.loads(raw)["error"]["message"][:110]
        except Exception:
            detail = raw[:110].replace("\n", " ")
    print(f"[{i}/{len(targets)}] {mid:<44} {status:>4}  {kind:<13} {detail}")

    if kind == "auth_403":
        throttle_streak += 1
        if throttle_streak >= 3:
            print("\n⚠ 连续 3 次节流，中止（partial 已保存，稍后 --resume 续跑）")
            break
        time.sleep(spacing * 3)
    else:
        throttle_streak = 0
        time.sleep(spacing)

from collections import Counter
c = Counter(state["classified"].values())
print("\n=== 分类汇总 ===")
for k, v in c.most_common():
    print(f"  {k:<13} {v}")
print(f"\n结果写入 {out_path}")
