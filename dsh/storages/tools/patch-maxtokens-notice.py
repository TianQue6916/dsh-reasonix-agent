# -*- coding: utf-8 -*-
"""隐藏 dsh UI 的「已达到输出 token 上限」通知（turn-max-tokens 节点）。

背景：该通知唯一触发条件是 `turn/end` 事件 reason.kind === "max-tokens"，而 provider 常在
未真正耗尽 maxTokens 的情况下回来 `stopReason:"length"`（实测 completion 仅 ~2900 / 预算 262144），
于是这条通知变成噪声。用户明确要求去掉。

做法：只改 **UI 判定** 的两处带引号字面量 `"max-tokens"` -> `"max-tokenz"`（12 B -> 12 B，纯 ASCII
等长），使 UI 的两个 guard 永不命中 —— 聊天流里不再生成该 notice 节点。
harness 内部语义（`finish.kind === "max-tokens"`、session 里的 `turn/end` reason）**一律不动**，
所以截断事实仍然完整记录在 session 事件里，只是不再弹这条提示。

targets（两份都要打，desktop 走 asar 内核心插件，web 走 npm-js）：
  1) npm-js  : @deepseek-ai/dsh-client-ui-chat/lib/client.js
  2) asar    : DeepSeek Harness/resources/app.asar

用法：
  python patch-maxtokens-notice.py --check | --apply | --verify | --restore
"""
import io
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(os.path.dirname(HERE), "maxtokens-notice-patch.json")

OLD = "max-tokens"
NEW = "max-tokenz"          # 同为 10 字符，纯 ASCII ⇒ 字节等长

# 两个 UI guard（含 reason.kind 前缀，才能与 asar 里 harness 内部的 finish.kind 区分）
ANCHORS = [
    'reason.kind !== "%s") return void 0;' % OLD,
    'reason.kind === "%s") return {' % OLD,
]

TARGETS = [
    ("npm-js",
     r"C:\Users\27063\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules"
     r"\@deepseek-ai\dsh-client-ui-chat\lib\client.js"),
    ("desktop-asar",
     r"C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\resources\app.asar"),
]


def read(path):
    with open(path, "rb") as fh:
        return fh.read()


def write(path, data):
    with open(path, "wb") as fh:
        fh.write(data)


def load_state():
    if not os.path.exists(STATE):
        return None
    with io.open(STATE, encoding="utf-8") as fh:
        return json.load(fh)


def save_state(obj):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    with io.open(STATE, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def report():
    st = load_state()
    print("STATE %s" % ("(有)" if st else "(无)"))
    for label, path in TARGETS:
        if not os.path.exists(path):
            print("  %-13s MISSING %s" % (label, path))
            continue
        data = read(path)
        b_old = data.count(("reason.kind !== \"%s\") return void 0;" % OLD).encode())
        b_new = data.count(("reason.kind !== \"%s\") return void 0;" % NEW).encode())
        d_old = data.count(("reason.kind === \"%s\") return {" % OLD).encode())
        d_new = data.count(("reason.kind === \"%s\") return {" % NEW).encode())
        print("  %-13s %s B  guard(state)=%s/%s  guard(def)=%s/%s  patched=%s"
              % (label, len(data), b_old, b_new, d_old, d_new, b_new == 1 and d_new == 1))


def cmd_check():
    print("CHECK")
    ok = True
    for label, path in TARGETS:
        if not os.path.exists(path):
            print("  %-13s MISSING" % label)
            ok = False
            continue
        data = read(path)
        for a in ANCHORS:
            n = data.count(a.encode())
            print("  %-13s anchor count=%s  %r" % (label, n, a))
            if n != 1:
                ok = False
    print("RESULT: %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


def cmd_apply():
    if load_state():
        print("已打过（state 存在）；先 --restore 再 apply")
        return 1
    stamp = time.strftime("%Y%m%d-%H%M%S")
    rec = {"stamp": stamp, "old": OLD, "new": NEW, "targets": []}
    plan = []
    for label, path in TARGETS:
        data = read(path)
        for a in ANCHORS:
            if data.count(a.encode()) != 1:
                print("拒绝写入：%s anchor count != 1 -> %r" % (label, a))
                return 1
        new_data = data
        offsets = []
        for a in ANCHORS:
            off = new_data.find(a.encode())
            offsets.append(off)
            new_data = new_data[:off] + a.replace('"%s"' % OLD, '"%s"' % NEW).encode() + new_data[off + len(a):]
        plan.append((label, path, data, new_data, offsets))
    for label, path, old_data, new_data, offsets in plan:
        assert len(old_data) == len(new_data)
        if label == "npm-js":
            bak = "%s.bak-%s-pre-maxtokens-notice" % (path, stamp)
            if not os.path.exists(bak):
                write(bak, old_data)
            print("  backup %s (%s B)" % (bak, len(old_data)))
        write(path, new_data)
        rec["targets"].append({"label": label, "path": path, "offsets": offsets,
                               "size": len(new_data)})
        print("  wrote %-13s %s B (offsets %s)" % (label, len(new_data), offsets))
    save_state(rec)
    print("APPLY DONE stamp=%s" % stamp)
    return 0


def cmd_verify():
    st = load_state()
    if not st:
        print("no state")
        return 1
    ok = True
    for t in st["targets"]:
        data = read(t["path"])
        for a in ANCHORS:
            old_n = data.count(a.encode())
            new_n = data.count(a.replace('"%s"' % OLD, '"%s"' % NEW).encode())
            if old_n != 0 or new_n != 1:
                print("  FAIL %-13s old=%s new=%s" % (t["label"], old_n, new_n))
                ok = False
            else:
                print("  ok   %-13s old=0 new=1  size=%s" % (t["label"], len(data)))
        if t["label"] == "npm-js":
            r = subprocess.run(["node", "--check", t["path"]], capture_output=True, text=True)
            print("  node --check npm-js: %s" % ("OK" if r.returncode == 0 else r.stderr[:400]))
            if r.returncode != 0:
                ok = False
            bak = "%s.bak-%s-pre-maxtokens-notice" % (t["path"], st["stamp"])
            if os.path.exists(bak):
                a = read(bak)
                b = read(t["path"])
                if len(a) != len(b):
                    print("  FAIL npm-js 长度变了 %s -> %s" % (len(a), len(b)))
                    ok = False
                else:
                    diffs = [i for i in range(len(a)) if a[i] != b[i]]
                    win = [(t["offsets"][k], t["offsets"][k] + len(ANCHORS[k])) for k in (0, 1)]
                    inside = all(any(lo <= i < hi for lo, hi in win) for i in diffs)
                    # 每处只差 1 个字节：\"max-tokens\" -> \"max-tokenz\" 的 s->z，两处共 2
                    print("  npm-js 与备份逐字节 diff：%s 处不同（应 2：s->z x2），全部落在两 anchor 内 = %s"
                          % (len(diffs), inside))
                    if len(diffs) != 2 or not inside:
                        ok = False
        if t["label"] == "desktop-asar":
            import struct
            data = read(t["path"])
            n_int = data.count(b'finish.kind === "max-tokens") return { kind: "max-tokens" }')
            n_def = data.count(b'kind: "turn-max-tokens"')
            n_new = data.count(b'"max-tokenz"')
            print("  asar 内部 finish.kind=%s  turn-max-tokens 定义=%s  新 token 总数=%s" % (n_int, n_def, n_new))
            if n_int != 1 or n_new != 2:
                ok = False
            json_len = struct.unpack("<4I", data[:16])[3]
            hdr = json.loads(data[16:16 + json_len].decode("utf-8"))
            print("  asar header JSON 解析 OK：%s 个顶层条目，header %s B，文件 %s B"
                  % (len(hdr.get("files", {})), json_len, len(data)))
    print("RESULT: %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


def cmd_restore():
    st = load_state()
    if not st:
        print("no state")
        return 1
    for t in st["targets"]:
        if t["label"] == "npm-js":
            bak = "%s.bak-%s-pre-maxtokens-notice" % (t["path"], st["stamp"])
            if os.path.exists(bak):
                write(t["path"], read(bak))
                print("  restored from backup %s" % bak)
                continue
        data = read(t["path"])
        for a in ANCHORS:
            new_a = a.replace('"%s"' % OLD, '"%s"' % NEW)
            off = data.find(new_a.encode())
            if off < 0:
                print("  WARN anchor not found in %s: %r" % (t["label"], new_a))
                continue
            data = data[:off] + a.encode() + data[off + len(new_a):]
        write(t["path"], data)
        print("  restored %-13s by offset" % t["label"])
    os.remove(STATE)
    print("RESTORE DONE")
    return 0


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "--check"
    report()
    sys.exit({"--check": cmd_check, "--apply": cmd_apply,
              "--verify": cmd_verify, "--restore": cmd_restore}.get(arg, cmd_check)())
