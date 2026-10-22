# -*- coding: utf-8 -*-
"""dsh-thinking-guard 参数调优 + 重新启用（2026-10-04）

背景（源码事实，非推测）：
  `lib/index.js:381 if (noProgress && st.reasoningChars > 0) { const heldMs = Date.now() - st.lastProgressAt;
   if (heldMs >= cfg.thinkingOnlyMs) trip(agent, st, 'thinking-only-timeout', { heldMs }); }`
  ⇒ 触发条件要求 `reasoningChars > 0`，即 reasoning 已经**开始流出**，但持续 N 毫秒没有 text / tool-call。
  所以「45s < 上游 180s 首 chunk 超时 ⇒ 死循环」是**错的**（首 chunk 未到时 reasoningChars == 0，判据不触发）。

真 bug = **阈值太短**：本机主力 model `deepseek/deepseek-v4.1-flash` 的 maxTokens 是 262144，
深度思考 45 秒不产可见文本完全正常；一旦 trip，`notifyContinue()` 会注入「继续。上一回合因思考空转被熔断
中止（thinking-only-timeout）…」并 `agent.followup()` 开新 attempt ⇒ 重新计时 ⇒ 再 45s ⇒ 再次 trip，
形成「熔断→继续→空转→再熔断」的消耗循环（用户 22:5x 截图的 notifyContinue 原文即此）。

另：`maxThinkingChars: 80000`（≈20k token）对 262144 预算偏紧。

改法（本脚本）：
  enabled:            false -> true     （用户诉求是「思考空转熔断」，必须启用才有意义）
  thinkingOnlyMs:     45000 -> 300000   （5 min，远大于上游 180s 首 chunk 超时）
  maxThinkingChars:   80000 -> 200000   （≈50k token，留足深度思考空间）
  verbose:            false -> true     （否则 lib/index.js:298 的 log() 为空操作，
                                         `:499 log('已启用：…')` 不会落盘，无「可验证痕迹」）

target 在 node_modules ⇒ `pnpm install` 会覆盖，需重跑本脚本（与 patch-thinking-guard-name.py 同）。
用法：python patch-thinking-guard-tune.py [--check|--apply|--verify|--restore]
"""
import io
import os
import re
import shutil
import sys
from datetime import datetime

DSH = os.path.join(os.environ.get("USERPROFILE", r"C:\Users\27063"), ".dsh")
TARGETS = [
    os.path.join(DSH, "profiles", "web", "node_modules", "@ethanwong-hk",
                 "dsh-thinking-guard", "cordis.patch.yml"),
    os.path.join(DSH, "profiles", "desktop", "node_modules", "@ethanwong-hk",
                 "dsh-thinking-guard", "cordis.patch.yml"),
]

# (旧行片段, 新行, 标签)
RULES = [
    ("        enabled: false", "        enabled: true", "enabled"),
    ("        thinkingOnlyMs: 45000", "        thinkingOnlyMs: 300000", "thinkingOnlyMs"),
    ("        maxThinkingChars: 80000", "        maxThinkingChars: 200000", "maxThinkingChars"),
    ("        verbose: false", "        verbose: true", "verbose"),
]

STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")


def read(path):
    with io.open(path, "r", encoding="utf-8", newline="") as fh:
        return fh.read()


def write(path, text):
    with io.open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def applied(text):
    return ("        enabled: true" in text and "        thinkingOnlyMs: 300000" in text
            and "        maxThinkingChars: 200000" in text and "        verbose: true" in text)


def cmd_check():
    for path in TARGETS:
        if not os.path.exists(path):
            print("MISSING %s" % path)
            continue
        text = read(path)
        print("%s  bytes=%d  tuned=%s" % (path, len(text.encode("utf-8")), applied(text)))
        for old, new, label in RULES:
            print("   %-18s old=%d new=%d" % (label, text.count(old), text.count(new)))
    return 0


def cmd_apply():
    rc = 0
    for path in TARGETS:
        text = read(path)
        if applied(text):
            print("already tuned: %s" % path)
            continue
        new_text = text
        for old, new, label in RULES:
            n = new_text.count(old)
            if n != 1:
                print("FAIL %s: anchor %r count=%d (expect 1)" % (path, label, n))
                rc = 1
                break
            new_text = new_text.replace(old, new)
        else:
            bak = "%s.bak-%s-pre-guard-tune" % (path, STAMP)
            shutil.copy2(path, bak)
            write(path, new_text)
            print("OK %s  %d -> %d bytes  (bak %s)"
                  % (path, len(text.encode("utf-8")), len(new_text.encode("utf-8")), os.path.basename(bak)))
    return rc


def cmd_verify():
    rc = 0
    for path in TARGETS:
        text = read(path)
        ok = applied(text)
        print("%s  tuned=%s" % (path, ok))
        if not ok:
            for old, new, label in RULES:
                print("   %-18s old=%d new=%d" % (label, text.count(old), text.count(new)))
            rc = 1
        else:
            for _old, new, label in RULES:
                if text.count(new.strip()) != 1:
                    print("   WARN %s count=%d" % (label, text.count(new.strip())))
                    rc = 1
    print("RESULT: %s" % ("PASS" if rc == 0 else "FAIL"))
    return rc


def cmd_restore():
    for path in TARGETS:
        cands = sorted(
            [p for p in os.listdir(os.path.dirname(path)) if p.startswith(os.path.basename(path) + ".bak-")],
            reverse=True)
        if not cands:
            print("no backup for %s" % path)
            continue
        bak = os.path.join(os.path.dirname(path), cands[0])
        shutil.copy2(bak, path)
        print("restored %s from %s" % (path, cands[0]))
    return 0


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--check"
    fn = {"--check": cmd_check, "--apply": cmd_apply, "--verify": cmd_verify, "--restore": cmd_restore}.get(mode)
    if fn is None:
        print(__doc__)
        return 2
    return fn()


if __name__ == "__main__":
    sys.exit(main())
