#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch-gateway-hb.py -- 给 goat-gateway 的 gateway.mjs 注入 event-loop 延迟心跳。

为什么：host-watchdog 在 10-04 00:04:11 与 00:14:17 两次报 `8788=TIMEOUT`，而 dsh host 自己的
端口（8783/19387）当时全是 ms 级响应 ⇒ 是 gateway 单进程 node 的 event loop 被阻塞了至少 5 秒。
gateway 里 `server.requestTimeout = 0`（整体请求超时禁用）、`headersTimeout` 只在收到首字节后计时
⇒ event loop 一旦卡住，所有在途/新到的上游请求全部排队且**连日志都不写**。这与「turn 卡死时
gateway 侧零记录」的观测完全吻合，因此必须把 gateway 自身的 event-loop 延迟变成可观测事实。

产物：在 `server.listen(...)` 回调末尾插入一个 5 秒心跳，每行写：
    HB elu[ms] p50=… p99=… max=… rss=…MB heap=…MB res=<活跃 resource 数>
`monitorEventLoopDelay` 是 Node 内建（node:perf_hooks），resolution=20ms，每次输出后 reset。

用法：
    python patch-gateway-hb.py                 # apply（默认 D:/Toolbox/goat-gateway/gateway.mjs）
    python patch-gateway-hb.py --file <path>   # 换目标（例如 Linux 侧）
    python patch-gateway-hb.py --check         # 只看状态，不写
    python patch-gateway-hb.py --verify        # 校验插入块 + node --check
    python patch-gateway-hb.py --restore       # 从最近的备份还原
幂等：已含 gateway-hb-start 标记则直接报 skipped。
"""
import argparse
import datetime
import glob
import io
import os
import shutil
import subprocess
import sys

DEFAULT_FILE = "D:/Toolbox/goat-gateway/gateway.mjs"
MARK_START = "// gateway-hb-start"
MARK_END = "// gateway-hb-end"
IMPORT_ANCHOR = "import { createLoopGuard, SseDeltaParser, DEFAULT_LOOP_GUARD } from './loop-guard.mjs';"
IMPORT_NEW = IMPORT_ANCHOR + "\nimport { monitorEventLoopDelay } from 'node:perf_hooks';"
LISTEN_HEAD = "      ` keys=[${keys.map((k) => k.name + (k.enabled ? '' : ':off') + '@' + upstreamLabel(resolveUpstream(k))).join(', ')}]`,\n"
LISTEN_TAIL = "  );\n});\n"
LISTEN_ANCHOR = LISTEN_HEAD + LISTEN_TAIL

HB_BODY = """  // gateway-hb-start (2026-10-04 诊断：gateway event-loop 延迟心跳；见 ~/.dsh/storages/tools/patch-gateway-hb.py)
  try {
    const __hbEld = monitorEventLoopDelay({ resolution: 20 });
    __hbEld.enable();
    const __hbTimer = setInterval(() => {
      try {
        const p50 = __hbEld.percentile(50) / 1e6;
        const p99 = __hbEld.percentile(99) / 1e6;
        const mx = __hbEld.max / 1e6;
        const mem = process.memoryUsage();
        log(
          `HB elu[ms] p50=${p50.toFixed(1)} p99=${p99.toFixed(1)} max=${mx.toFixed(1)}` +
            ` rss=${Math.round(mem.rss / 1048576)}MB heap=${Math.round(mem.heapUsed / 1048576)}MB` +
            ` res=${process.getActiveResourcesInfo().length}`,
        );
        __hbEld.reset();
      } catch {
        /* 诊断代码绝不拖倒 gateway */
      }
    }, 5000);
    if (typeof __hbTimer.unref === 'function') __hbTimer.unref();
  } catch {
    /* monitorEventLoopDelay 不可用时静默 */
  }
  // gateway-hb-end
"""


def read_text(path):
    raw = io.open(path, "r", encoding="utf-8", newline="").read()
    crlf = "\r\n" in raw
    return raw.replace("\r\n", "\n"), crlf


def write_text(path, text, crlf):
    out = text.replace("\n", "\r\n") if crlf else text
    io.open(path, "w", encoding="utf-8", newline="").write(out)


def stamp():
    return datetime.datetime.now().strftime("%Y%m%d-%H%M%S")


def do_check(path):
    text, crlf = read_text(path)
    print("file    : %s (%d bytes, %s)" % (path, len(text.encode("utf-8")), "CRLF" if crlf else "LF"))
    print("marker  : start=%d end=%d" % (text.count(MARK_START), text.count(MARK_END)))
    print("import  : %s" % ("present" if "node:perf_hooks" in text else "absent"))
    print("state   : %s" % ("APPLIED" if MARK_START in text else "NOT-APPLIED"))
    return 0 if MARK_START in text else 1


def do_apply(path):
    text, crlf = read_text(path)
    if MARK_START in text:
        print("skipped : 已含 %s，无需重复注入" % MARK_START)
        return 0
    if MARK_END in text:
        print("ERROR   : 只找到 end 标记没有 start 标记，文件处于半改状态，请人工检查", file=sys.stderr)
        return 2
    n_imp = text.count(IMPORT_ANCHOR)
    n_lsn = text.count(LISTEN_ANCHOR)
    if n_imp != 1 or n_lsn != 1:
        print("ERROR   : 锚点不唯一 import=%d listen=%d" % (n_imp, n_lsn), file=sys.stderr)
        return 2
    backup = "%s.bak-%s-pre-gateway-hb" % (path, stamp())
    shutil.copy2(path, backup)
    print("backup  : %s" % backup)
    text = text.replace(IMPORT_ANCHOR, IMPORT_NEW, 1)
    text = text.replace(LISTEN_ANCHOR, LISTEN_HEAD + "  );\n" + HB_BODY + "});\n", 1)
    write_text(path, text, crlf)
    print("applied : %d bytes" % len(text.encode("utf-8")))
    return 0


def do_verify(path):
    text, crlf = read_text(path)
    if MARK_START not in text:
        print("state   : NOT-APPLIED（无 %s）" % MARK_START)
        tmp = os.path.join(os.environ.get("TEMP", "/tmp"), "gateway-hb-check.mjs")
        shutil.copy2(path, tmp)
        r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
        print("  %-28s %s" % ("node --check", "PASS" if r.returncode == 0 else "FAIL: " + r.stderr.strip()[:200]))
        return 0 if r.returncode == 0 else 1
    ok = True
    for label, cond in [
        ("marker start 恰好 1 处", text.count(MARK_START) == 1),
        ("marker end 恰好 1 处", text.count(MARK_END) == 1),
        ("node:perf_hooks import 恰好 1 处", text.count("import { monitorEventLoopDelay } from 'node:perf_hooks';") == 1),
        ("心跳块在 listen 回调内", text.index(MARK_START) > text.index("server.listen(CFG.listen.port")),
        ("心跳块自身长度合理", 0 < text.index(MARK_END) - text.index(MARK_START) < 1400),
    ]:
        print("  %-28s %s" % (label, "PASS" if cond else "FAIL"))
        ok = ok and cond
    tmp = os.path.join(os.environ.get("TEMP", "/tmp"), "gateway-hb-check.mjs")
    shutil.copy2(path, tmp)
    r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    print("  %-28s %s" % ("node --check", "PASS" if r.returncode == 0 else "FAIL: " + r.stderr.strip()[:200]))
    ok = ok and r.returncode == 0
    print("verify  : %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


def do_restore(path):
    cands = sorted(glob.glob(path + ".bak-*-pre-gateway-hb"))
    if not cands:
        print("ERROR   : 找不到备份", file=sys.stderr)
        return 2
    src = cands[-1]
    shutil.copy2(src, path)
    print("restore : %s -> %s" % (src, path))
    return do_verify(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default=DEFAULT_FILE)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--check", action="store_true")
    g.add_argument("--verify", action="store_true")
    g.add_argument("--restore", action="store_true")
    a = ap.parse_args()
    if not os.path.exists(a.file):
        print("ERROR   : 文件不存在 %s" % a.file, file=sys.stderr)
        return 2
    if a.check:
        return do_check(a.file)
    if a.verify:
        return do_verify(a.file)
    if a.restore:
        return do_restore(a.file)
    rc = do_apply(a.file)
    if rc == 0:
        rc = do_verify(a.file)
    return rc


if __name__ == "__main__":
    sys.exit(main())
