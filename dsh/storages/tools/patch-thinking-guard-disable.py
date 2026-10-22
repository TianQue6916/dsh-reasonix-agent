#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch-thinking-guard-disable.py — 暂停 thinking-guard 熔断机制。

背景（2026-10-03）：
  @ethanwong-hk/dsh-thinking-guard 在 desktop/web 两侧都挂了，包内
  cordis.patch.yml 的 config.enabled = true。它挂在 agent/assistant-stream 上，
  thinking-only-timeout = 45000ms 触发后：
    agent.cancel({kind:'thinking-guard'})  +  notifyContinue() 注入
    「继续。上一回合因思考空转被熔断中止（thinking-only-timeout）。…」
  取证（全库 220 session 精确搜该文案 + turn/end reason）：
    · 注入文案只以「agent 讨论它」的形式存在，插件真正的注入消息**从未落盘**；
    · turn/end 里**从无** reason={kind:'aborted', reason:{kind:'thinking-guard'}}；
  ⇒ UI 能看见它的提示，但 cancel 没有留下任何 durable 痕迹 ⇒ 用户判断
    「熔断有bug」。且上游偶发 180s 不吐首 chunk 时，45s 的 thinking-only 阈值
    会先把回合判成「空转」，注入「继续」→ 新 attempt → 45s → 再熔断 ⇒ 死循环。

处置：把两处包内 cordis.patch.yml 的 enabled 改成 false（保留挂载，不删 bundle，
      因此不触发 requires-a-process-restart）。

用法：python patch-thinking-guard-disable.py [--check|--apply|--verify|--restore]
"""
import io
import os
import glob
import shutil
import sys
import datetime
import re

PROFILES = ["desktop", "web"]
REL = os.path.join("node_modules", "@ethanwong-hk", "dsh-thinking-guard", "cordis.patch.yml")
ROOT = os.path.join(os.path.expanduser("~"), ".dsh", "profiles")
RX = re.compile(r"^(\s*)enabled:\s*(true|false)\s*$")


def files():
    out = []
    for p in PROFILES:
        f = os.path.join(ROOT, p, REL)
        if os.path.exists(f):
            out.append((p, f))
    return out


def scan(text):
    hits = []
    for i, ln in enumerate(text.split("\n")):
        m = RX.match(ln)
        if m:
            hits.append((i, m.group(1), m.group(2)))
    return hits


def report(tag, prof, text, expect=None):
    hits = scan(text)
    vals = [v for _i, _ind, v in hits]
    ok = len(hits) == 1 and (expect is None or vals == [expect])
    print("[%-6s] %-8s enabled 命中=%d 值=%s -> %s"
          % (tag, prof, len(hits), vals, "OK" if ok else "MISMATCH"))
    return ok


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--check"
    allok = True
    for prof, f in files():
        with io.open(f, encoding="utf-8", newline="") as fh:
            text = fh.read()
        if mode == "--check":
            report("check", prof, text)
        elif mode == "--apply":
            if len(scan(text)) != 1:
                print("[ABORT] %s: enabled 出现 %d 次（期望 1）" % (prof, len(scan(text))))
                allok = False
                continue
            ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
            bak = f + ".bak-%s-pre-guard-disable" % ts
            shutil.copy2(f, bak)
            new = "\n".join(RX.sub(lambda m: m.group(1) + "enabled: false", ln)
                            if RX.match(ln) else ln
                            for ln in text.split("\n"))
            with io.open(f, "w", encoding="utf-8", newline="") as fh:
                fh.write(new)
            print("[apply] %s 备份=%s" % (prof, os.path.basename(bak)))
            with io.open(f, encoding="utf-8", newline="") as fh:
                allok = report("verify", prof, fh.read(), expect="false") and allok
        elif mode == "--restore":
            baks = sorted(glob.glob(f + ".bak-*-pre-guard-disable"))
            if not baks:
                print("[restore] %s 无备份" % prof)
                allok = False
                continue
            shutil.copy2(baks[-1], f)
            print("[restore] %s <- %s" % (prof, os.path.basename(baks[-1])))
            with io.open(f, encoding="utf-8", newline="") as fh:
                report("verify", prof, fh.read())
        elif mode == "--verify":
            allok = report("verify", prof, text, expect="false") and allok
        else:
            print(__doc__)
            return 2
    print("RESULT:", "PASS" if allok else "FAIL")
    return 0 if allok else 1


if __name__ == "__main__":
    sys.exit(main())
