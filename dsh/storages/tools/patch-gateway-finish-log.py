#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给 goat-gateway 的 OK 行加上 `finish=<上游 finish_reason>`（诊断设施，非修复）。

WHY：`session-b65a9a67` 有 5 个 turn 以 `turn/end reason={"kind":"max-tokens"}` 结束，但
每步 outputTokens 只有 1103-6438（预算 262144）。pi-ai 的 mapStopReason 只把上游
`finish_reason=="length"` 映成 length，所以「假 max-tokens」只能来自上游主动发 length。
gateway 原先只记 usage、不记 finish_reason ⇒ 无法证明。本补丁只加日志字段，不改任何
转发语义（纯插入 + 模板串加一段），失败零影响。

用法：
  python patch-gateway-finish-log.py --check
  python patch-gateway-finish-log.py --apply
  python patch-gateway-finish-log.py --verify
  python patch-gateway-finish-log.py --restore
  python patch-gateway-finish-log.py --file <path>
"""
import argparse, hashlib, io, json, os, re, shutil, subprocess, sys, time

DEFAULT = r"D:\Toolbox\goat-gateway\gateway.mjs"
STATE = os.path.join(os.path.expanduser("~"), ".dsh", "storages", "gateway-finish-log-patch.json")

HELPER_ANCHOR = "function extractLastUsage(text) {"
HELPER_BLOCK = (
    "// finish-log-start\r\n"
    "// 从 SSE tail 里取最后一个非 null 的 finish_reason（上游为何收流）。\r\n"
    "// tail 是末尾 64KiB 滑动窗口，而 finish_reason 只在流的最后几帧 ⇒ 一定在窗口内。\r\n"
    "function extractFinishReason(text) {\r\n"
    "  const key = '\"finish_reason\"';\r\n"
    "  let idx = text.lastIndexOf(key);\r\n"
    "  while (idx >= 0) {\r\n"
    "    const colon = text.indexOf(':', idx + key.length);\r\n"
    "    if (colon < 0) return '';\r\n"
    "    let i = colon + 1;\r\n"
    "    while (i < text.length && /\\s/.test(text[i])) i += 1;\r\n"
    "    if (text[i] === '\"') {\r\n"
    "      const end = text.indexOf('\"', i + 1);\r\n"
    "      if (end > i) {\r\n"
    "        const v = text.slice(i + 1, end);\r\n"
    "        if (v && v !== 'null') return v;\r\n"
    "      }\r\n"
    "    }\r\n"
    "    idx = text.lastIndexOf(key, idx - 1);\r\n"
    "  }\r\n"
    "  return '';\r\n"
    "}\r\n"
    "// finish-log-end\r\n"
)

CALL_OLD = (
    "          const usage = extractLastUsage(tail);\r\n"
    "          log(\r\n"
)
CALL_NEW = (
    "          const usage = extractLastUsage(tail);\r\n"
    "          const finishReason = extractFinishReason(tail);\r\n"
    "          log(\r\n"
)

TAIL_OLD = "`${usage ? ' usage=' + usage : ''}`,\r\n"
TAIL_NEW = "`${usage ? ' usage=' + usage : ''}${finishReason ? ' finish=' + finishReason : ''}`,\r\n"


def rd(path):
    with open(path, "rb") as fh:
        return fh.read().decode("utf-8")


def wr(path, text):
    with open(path, "wb") as fh:
        fh.write(text.encode("utf-8"))


def once(text, sub, label, expect=1):
    n = text.count(sub)
    if n != expect:
        raise SystemExit(f"FAIL [{label}]: count={n}, expected {expect}")
    return text


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def node_check(path):
    r = subprocess.run(["node", "--check", path], capture_output=True, text=True)
    return r.returncode, (r.stderr or "").strip()


def state_of(path):
    text = rd(path)
    return {
        "helper": "// finish-log-start" in text,
        "call": "const finishReason = extractFinishReason(tail);" in text,
        "log": " finish=' + finishReason" in text,
    }


def cmd_check(path):
    s = state_of(path)
    print(f"file      : {path} ({os.path.getsize(path)} B, md5 {md5(path)})")
    print(f"applied   : helper={s['helper']} call={s['call']} log={s['log']}")
    text = rd(path)
    for sub, label in ((HELPER_ANCHOR, "helper-anchor"), (CALL_OLD, "call-anchor"), (TAIL_OLD, "tail-anchor")):
        print(f"anchor {label:14s}: count={text.count(sub)}")
    if all(s.values()):
        print("=> 已打补丁（幂等）")
    elif any(s.values()):
        print("=> 半打状态，需 --restore 后重来")
    else:
        print("=> 未打补丁")
    return 0


def cmd_apply(path):
    s = state_of(path)
    if all(s.values()):
        print("already applied (idempotent); nothing to do")
        return 0
    if any(s.values()):
        raise SystemExit("half-applied state; run --restore first")
    bak = path + ".bak-" + time.strftime("%Y%m%d-%H%M%S") + "-pre-finish-log"
    shutil.copy2(path, bak)
    text = rd(path)
    text = once(text, HELPER_ANCHOR, "helper-anchor")
    text = text.replace(HELPER_ANCHOR, HELPER_BLOCK + HELPER_ANCHOR, 1)
    text = once(text, CALL_OLD, "call-anchor")
    text = text.replace(CALL_OLD, CALL_NEW, 1)
    text = once(text, TAIL_OLD, "tail-anchor")
    text = text.replace(TAIL_OLD, TAIL_NEW, 1)
    wr(path, text)
    rc, err = node_check(path)
    if rc != 0:
        shutil.copy2(bak, path)
        raise SystemExit(f"node --check FAILED, rolled back:\n{err}")
    with io.open(STATE, "w", encoding="utf-8") as fh:
        json.dump({"file": path, "backup": bak, "appliedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
                   "sizeBefore": os.path.getsize(bak), "sizeAfter": os.path.getsize(path),
                   "md5After": md5(path)}, fh, ensure_ascii=False, indent=1)
    print(f"applied: {os.path.getsize(bak)} -> {os.path.getsize(path)} B")
    print(f"md5    : {md5(path)}")
    print(f"backup : {bak}")
    print(f"state  : {STATE}")
    return 0


def cmd_verify(path):
    rc, err = node_check(path)
    print(f"node --check : {'OK' if rc == 0 else 'FAIL ' + err}")
    s = state_of(path)
    print(f"helper/call/log: {s}")
    text = rd(path)
    print(f"helper-anchor count now = {text.count(HELPER_ANCHOR)} (expect 1)")
    probe = " finish=' + finishReason"
    print(f"tail-anchor  count now = {text.count(probe)} (expect 1)")
    # 抽出 helper 与 tail 行的实际内容做肉眼复核
    m = re.search(r"// finish-log-start\r?\n.*?// finish-log-end", text, re.S)
    print("--- helper verbatim ---")
    print(m.group(0) if m else "(missing)")
    for line in text.split("\n"):
        if "finish=" in line and "finishReason" in line:
            print("--- log line ---")
            print(line.rstrip())
    ok = rc == 0 and all(s.values())
    print("VERIFY", "PASS" if ok else "FAIL")
    return 0 if ok else 1


def cmd_restore(path):
    if not os.path.exists(STATE):
        raise SystemExit(f"no state file {STATE}; cannot restore")
    with io.open(STATE, encoding="utf-8") as fh:
        st = json.load(fh)
    bak = st["backup"]
    if not os.path.exists(bak):
        raise SystemExit(f"backup missing: {bak}")
    shutil.copy2(bak, path)
    print(f"restored {path} from {bak} ({os.path.getsize(path)} B, md5 {md5(path)})")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default=DEFAULT)
    g = ap.add_mutually_exclusive_group(required=True)
    for f in ("check", "apply", "verify", "restore"):
        g.add_argument("--" + f, action="store_true")
    a = ap.parse_args()
    if a.check:
        return cmd_check(a.file)
    if a.apply:
        return cmd_apply(a.file)
    if a.verify:
        return cmd_verify(a.file)
    return cmd_restore(a.file)


if __name__ == "__main__":
    sys.exit(main())
