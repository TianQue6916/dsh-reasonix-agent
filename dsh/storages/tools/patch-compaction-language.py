#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 dsh 的 compaction（上下文压缩）摘要指令从「写英文」改成「写中文」。

背景（2026-10-03 取证）：
  `@deepseek-ai/dsh-compaction-basic` 的 COMPACTION_INSTRUCTION 里有一条规则：
    "- Write concise English engineering prose. Preserve exact file paths, commands, ..."
  它作为「最后一条 user message」在回放对话之后下发，模型据此生成的 checkpoint 是
  英文的。checkpoint 是 post-compaction 上下文里最新、最权威的一大块（本机实测
  `compact-checkpoint` 投影单元 = 7449 tokens，占当步 prompt 约 8%），
  而语言契约要求中文（英文技术术语保留原词）。

做法 = **等长字节替换**，因此对 app.asar 也安全（asar 头里存的是条目 offset/size，
改长度会让后续所有条目错位）：
    b"English engineering prose"  ->  b"Chinese engineering prose"   (23 -> 23 B)
两个 target：web profile 用的 npm 全局 dsh；desktop app 用的 resources/app.asar。
恢复靠 state 文件里记录的 (offset, 原字节)，不需要备份 121 MB 的 asar。

用法:
  python patch-compaction-language.py --check     # 只报告命中数与是否已打补丁
  python patch-compaction-language.py --apply     # 打补丁（幂等）
  python patch-compaction-language.py --verify    # 复核：命中数 + JS 语法
  python patch-compaction-language.py --restore   # 按 offset 逆替换回英文
"""
import argparse
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys

NPM_JS = (r"C:\Users\27063\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh"
          r"\node_modules\@deepseek-ai\dsh-compaction-basic\lib\index.js")
ASAR = (r"C:\Users\27063\AppData\Local\Programs\DeepSeek Harness"
        r"\resources\app.asar")
STATE = r"C:\Users\27063\.dsh\storages\compaction-language-patch.json"

BEFORE = b"English engineering prose"
AFTER = b"Chinese engineering prose"
assert len(BEFORE) == len(AFTER), "等长替换是本脚本对 asar 安全的前提"

TARGETS = [("npm-js", NPM_JS), ("desktop-asar", ASAR)]


def ts():
    return datetime.datetime.now().strftime("%Y%m%d-%H%M%S")


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def scan(path):
    """返回 [(offset, 命中那一行的前后缀)]，只做统计用。"""
    with open(path, "rb") as fh:
        data = fh.read()
    hits = []
    start = 0
    while True:
        i = data.find(BEFORE, start)
        if i < 0:
            break
        hits.append(i)
        start = i + len(BEFORE)
    return len(data), hits, data


def load_state():
    if os.path.exists(STATE):
        with open(STATE, encoding="utf-8") as fh:
            return json.load(fh)
    return {"version": 1, "applied": []}


def save_state(st):
    with open(STATE, "w", encoding="utf-8") as fh:
        json.dump(st, fh, ensure_ascii=False, indent=2)


def cmd_check():
    st = load_state()
    for name, path in TARGETS:
        if not os.path.exists(path):
            print("%-14s 缺失: %s" % (name, path))
            continue
        size, before_hits, data = scan(path)
        after_hits = data.count(AFTER)
        done = any(e["target"] == name for e in st["applied"])
        print("%-14s %12d B  'English' x%d  'Chinese' x%d  已打补丁=%s"
              % (name, size, len(before_hits), after_hits, done))
    return 0


def cmd_apply():
    st = load_state()
    for name, path in TARGETS:
        if not os.path.exists(path):
            print("%-14s 缺失，跳过" % name)
            continue
        size, hits, data = scan(path)
        if not hits:
            print("%-14s 没有命中 'English engineering prose'（已打补丁或版本已变）" % name)
            continue
        if name == "npm-js":
            bak = path + ".bak-%s-pre-zh-compaction" % ts()
            if not os.path.exists(bak):
                shutil.copy2(path, bak)
            print("%-14s 备份 -> %s" % (name, os.path.basename(bak)))
        buf = bytearray(data)
        for off in hits:
            buf[off:off + len(BEFORE)] = AFTER
        assert len(buf) == size
        with open(path, "r+b") as fh:
            fh.seek(0)
            fh.write(bytes(buf))
            fh.truncate()
        st["applied"] = [e for e in st["applied"] if e["target"] != name]
        st["applied"].append({
            "target": name,
            "path": path,
            "at": datetime.datetime.now().isoformat(timespec="seconds"),
            "offsets": hits,
            "before": BEFORE.decode(),
            "after": AFTER.decode(),
            "sha256_before": sha(path) if False else None,
        })
        print("%-14s 已替换 %d 处（等长 %d B）" % (name, len(hits), len(BEFORE)))
    save_state(st)
    return 0


def cmd_verify():
    bad = 0
    for name, path in TARGETS:
        if not os.path.exists(path):
            print("%-14s 缺失" % name)
            bad += 1
            continue
        size, hits, data = scan(path)
        after = data.count(AFTER)
        print("%-14s %12d B  'English' x%d  'Chinese' x%d" % (name, size, len(hits), after))
        if hits:
            bad += 1
        if after == 0:
            bad += 1
    r = subprocess.run(["node", "--check", NPM_JS], capture_output=True, text=True)
    print("node --check npm-js:", "OK" if r.returncode == 0 else r.stderr.strip())
    if r.returncode != 0:
        bad += 1
    print("RESULT:", "PASS" if bad == 0 else "FAIL(%d)" % bad)
    return 0 if bad == 0 else 1


def cmd_restore():
    st = load_state()
    for entry in st["applied"]:
        path = entry["path"]
        before = entry["before"].encode()
        after = entry["after"].encode()
        with open(path, "r+b") as fh:
            for off in entry["offsets"]:
                fh.seek(off)
                cur = fh.read(len(after))
                if cur != after:
                    print("  !! offset %d 内容不是 '%s'，跳过" % (off, entry["after"]))
                    continue
                fh.seek(off)
                fh.write(before)
        print("%-14s 已恢复 %d 处" % (entry["target"], len(entry["offsets"])))
    st["applied"] = []
    save_state(st)
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--restore", action="store_true")
    a = ap.parse_args()
    if a.apply:
        sys.exit(cmd_apply())
    if a.verify:
        sys.exit(cmd_verify())
    if a.restore:
        sys.exit(cmd_restore())
    sys.exit(cmd_check())
