#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch-flash-maxtokens.py — 收敛 deepseek/deepseek-v4.1-flash 的输出上限。

背景（2026-10-03 排查 dsh 桌面端「对话莫名其妙断开」）：
  网关日志 D:\\Toolbox\\goat-gateway\\logs\\gateway-2026-10-03.log（UTC）显示
  · 当天 732 次请求里 prompt 已达 20 万 token（15 分钟内 12.1 万 → 20.3 万，单调）；
  · 本 profile 给 flash 设的 maxTokens = 262144（= contextWindow 的声明值）；
  · 上游偶发建连后 180 秒不吐首 chunk：
      NETWORK id=82 upstream first-chunk timeout after 180000ms
      STREAM-IDLE id=82 idle=180000ms where=waiting-first-chunk
  · dsh 的 step() 只在「流结束」时判定 ⇒ turn 永不闭合 ⇒ UI 看着像卡死；
    用户重启后 turn 未落盘，下次打开被补记 turn/end interrupted（=「上下文消失」）。

  本脚本是**降风险**动作（非已确诊修复）：把输出预留从 26 万降到 13 万。
  代价已知：输出被截断（turn/end reason=max-tokens）会变多——但比 32768 温和得多。

只改一条：commandcode-goat 段内 id = deepseek/deepseek-v4.1-flash 的 maxTokens。
其它模型（claude-sonnet-5-5 / gpt-5.6-sol / v4-pro / Kimi-K3 …）的 262144 一律不碰。

用法：python patch-flash-maxtokens.py [--check|--apply|--verify|--restore]
"""
import io
import os
import re
import shutil
import sys
import datetime

PROFILES = ["desktop", "web"]
ROOT = os.path.join(os.path.expanduser("~"), ".dsh", "profiles")
TARGET_ID = "deepseek/deepseek-v4.1-flash"
OLD, NEW = "262144", "131072"
ID_RX = re.compile(r"^(\s*)- id:\s*(\S+)\s*$")
MAX_RX = re.compile(r"^(\s*)maxTokens:\s*(\d+)\s*$")


def paths():
    out = []
    for p in PROFILES:
        f = os.path.join(ROOT, p, "cordis.patch.yml")
        if os.path.exists(f):
            out.append((p, f))
    return out


def scan(text):
    """返回 [(行号0基, 缩进, 原值)] —— 命中 TARGET_ID block 内的 maxTokens。"""
    lines = text.split("\n")
    hits = []
    in_block = False
    indent = None
    for i, ln in enumerate(lines):
        m = ID_RX.match(ln)
        if m:
            ind, ident = m.group(1), m.group(2)
            if in_block and len(ind) <= len(indent):
                in_block = False
            if ident == TARGET_ID:
                in_block, indent = True, ind
            continue
        if in_block:
            mm = MAX_RX.match(ln)
            if mm and len(mm.group(1)) > len(indent):
                hits.append((i, mm.group(1), mm.group(2)))
    return hits


def rewrite(text, newval):
    lines = text.split("\n")
    hits = scan(text)
    for i, ind, _old in hits:
        lines[i] = "%smaxTokens: %s" % (ind, newval)
    return "\n".join(lines), hits


def count_id(text):
    return sum(1 for ln in text.split("\n")
               if (m := ID_RX.match(ln)) and m.group(2) == TARGET_ID)


def report(tag, text, f, expect=None):
    hits = scan(text)
    total_max = len([1 for ln in text.split("\n") if MAX_RX.match(ln)])
    vals = [v for _i, _ind, v in hits]
    ok = len(hits) == 1 and (expect is None or vals == [expect])
    print("[%s] %-8s id出现=%d 命中maxTokens=%d 值=%s 全文件maxTokens总数=%d -> %s"
          % (tag, os.path.basename(os.path.dirname(f)), count_id(text),
             len(hits), vals, total_max, "OK" if ok else "MISMATCH"))
    return ok, hits


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--check"
    allok = True
    for prof, f in paths():
        with io.open(f, encoding="utf-8", newline="") as fh:
            text = fh.read()
        n_id = count_id(text)
        if n_id != 1:
            print("[ABORT] %s: id=%s 出现 %d 次（期望 1），不修改" % (prof, TARGET_ID, n_id))
            allok = False
            continue
        if mode == "--check":
            _ok, _ = report("check", text, f)
        elif mode in ("--apply", "--restore"):
            if mode == "--apply":
                ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
                bak = f + ".bak-%s-pre-flash-maxtokens" % ts
                shutil.copy2(f, bak)
                new_text, hits = rewrite(text, NEW)
                if len(hits) != 1:
                    print("[ABORT] %s: 命中 %d 条，不写入" % (prof, len(hits)))
                    allok = False
                    continue
                with io.open(f, "w", encoding="utf-8", newline="") as fh:
                    fh.write(new_text)
                print("[apply] %s 备份=%s" % (prof, os.path.basename(bak)))
                with io.open(f, encoding="utf-8", newline="") as fh:
                    report("verify", fh.read(), f, expect=NEW)
            else:
                import glob
                baks = sorted(glob.glob(f + ".bak-*-pre-flash-maxtokens"))
                if not baks:
                    print("[restore] %s 无备份" % prof)
                    allok = False
                    continue
                shutil.copy2(baks[-1], f)
                print("[restore] %s <- %s" % (prof, os.path.basename(baks[-1])))
                with io.open(f, encoding="utf-8", newline="") as fh:
                    report("verify", fh.read(), f)
        elif mode == "--verify":
            ok, _ = report("verify", text, f, expect=NEW)
            allok = allok and ok
        else:
            print(__doc__)
            return 2
    print("RESULT:", "PASS" if allok else "FAIL")
    return 0 if allok else 1


if __name__ == "__main__":
    sys.exit(main())
