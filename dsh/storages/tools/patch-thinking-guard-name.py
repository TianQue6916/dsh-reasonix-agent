#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""补 `~/.dsh/profiles/web/cordis.patch.yml` 里 thinking-guard row 缺失的 `name:`。

根因（2026-10-03 实测）：
  profile 的 row 只有
      - id: thinking-guard
        config: {...}
  没有 `name:`。dsh 于是在 profile 目录下 resolve 裸包名 `dsh-thinking-guard`
  —— 而该包的真名是 `@ethanwong-hk/dsh-thinking-guard`。
  证据（在 profiles/web 下跑）：
      node -e "import('dsh-thinking-guard')"             -> ERR_MODULE_NOT_FOUND
      node -e "import('@ethanwong-hk/dsh-thinking-guard')" -> OK ['apply','detectDegenerate','inject','name']
      node -e "import('dsh-mnemon')"                      -> OK（对照：无 scope 的包用裸名是对的）
  resolve 失败 => fiber 建不起来 => boot 日志
      thinking-guard (dsh-thinking-guard): failed to import
  该文案的产出点是 …/@deepseek-ai/dsh-app-boot/lib/index.js:3910，
  触发条件 `entry.fiber === undefined`（错误详情被这个分支吞掉，所以只看到一行）。

注意 `--dump-config` 能过 ≠ 能 import：dump 只做配置合成，不加载模块。
包自带的 cordis.patch.yml 里写的 `name: 'dsh-thinking-guard'` 同样是裸名，
但 dsh 消费 bundle 自带 patch 时按包内相对位置解析，所以那份"看着能跑"。

用法：
  python patch-thinking-guard-name.py --check
  python patch-thinking-guard-name.py --apply
  python patch-thinking-guard-name.py --verify
  python patch-thinking-guard-name.py --restore
  python patch-thinking-guard-name.py --dumpconfig      # 跑 dsh --dump-config 并 grep 该 row
可选 --file 指定别的 cordis.patch.yml（默认 profiles/web）。
"""
import argparse
import difflib
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import time

DSH_HOME = os.path.expanduser("~/.dsh")
DEFAULT_TARGET = os.path.join(DSH_HOME, "profiles", "web", "node_modules",
                              "@ethanwong-hk", "dsh-thinking-guard", "cordis.patch.yml")
STATE = os.path.join(DSH_HOME, "storages", "thinking-guard-name-patch.json")

OLD = "- id: thinking-guard\n  config:\n"
NEW = '- id: thinking-guard\n  name: "@ethanwong-hk/dsh-thinking-guard"\n  config:\n'

# --- 2026-10-03 retarget：改包内那份 bundle patch ----------------
# 改 profile 的 cordis.patch.yml 会被 dsh 直接拒掉：
#   patch: name mismatch for "thinking-guard" (expected "dsh-thinking-guard",
#          got "@ethanwong-hk/dsh-thinking-guard"), skipping
# 因为 profile patch 是按 (id, name) 匹配已有 entry 的，而那个 entry 的 name
# 来自 dsh.bundle.patch 指向的那份文件 —— 所以必须修源头。下面两行覆盖上面的定义。
# 副作用：target 在 node_modules 里，任何 pnpm install 都会覆盖它，需重跑 --apply。
OLD = "name: 'dsh-thinking-guard'"
NEW = "name: '@ethanwong-hk/dsh-thinking-guard'"


def md5(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


def read_text(path: str):
    """返回 (text, newline)。统一成 \\n 处理，写回时还原。"""
    with io.open(path, "r", encoding="utf-8", newline="") as f:
        raw = f.read()
    nl = "\r\n" if "\r\n" in raw else "\n"
    return raw.replace("\r\n", "\n"), nl


def write_text(path: str, text: str, nl: str):
    out = text.replace("\n", nl) if nl != "\n" else text
    with io.open(path, "w", encoding="utf-8", newline="") as f:
        f.write(out)


def load_state():
    if os.path.exists(STATE):
        with io.open(STATE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_state(d):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    with io.open(STATE, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")


def status_of(text: str) -> str:
    n_new = text.count(NEW)
    n_old = text.count(OLD)
    if n_new == 1 and n_old == 0:
        return "applied"
    if n_new == 0 and n_old == 1:
        return "pristine"
    return "ambiguous(new=%d old=%d)" % (n_new, n_old)


def cmd_check(args):
    path = args.file
    text, nl = read_text(path)
    st = status_of(text)
    n_id = text.count("- id: thinking-guard")
    print("[check] %s" % path)
    print("        newline      = %s" % ("CRLF" if nl == "\r\n" else "LF"))
    print("        bytes        = %d" % os.path.getsize(path))
    print("        '- id: thinking-guard' 出现 %d 次" % n_id)
    print("        OLD anchor   = %d 次" % text.count(OLD))
    print("        NEW anchor   = %d 次" % text.count(NEW))
    print("        status       = %s" % st)
    print("        state file   = %s" % ("存在" if os.path.exists(STATE) else "不存在"))
    return 0 if st in ("applied", "pristine") else 1


def cmd_apply(args):
    path = args.file
    text, nl = read_text(path)
    st = status_of(text)
    if st == "applied":
        print("[apply] 已是目标状态，跳过（幂等）")
        return 0
    if st != "pristine":
        print("[apply] 中止：锚点不唯一 -> %s" % st)
        return 2
    ts = time.strftime("%Y%m%d-%H%M%S")
    bak = "%s.bak-%s-pre-tg-name" % (path, ts)
    shutil.copy2(path, bak)
    before = text
    write_text(path, text.replace(OLD, NEW, 1), nl)
    after_t, _ = read_text(path)
    if status_of(after_t) != "applied":
        write_text(path, before, nl)
        print("[apply] 写后校验失败，已回滚")
        return 3
    rec = load_state()
    rec[path] = {
        "backup": bak,
        "appliedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "bytesBefore": os.path.getsize(bak),
        "bytesAfter": os.path.getsize(path),
        "md5Before": md5(io.open(bak, "rb").read()),
        "md5After": md5(io.open(path, "rb").read()),
        "old": OLD,
        "new": NEW,
    }
    save_state(rec)
    print("[apply] OK")
    print("        backup      = %s" % bak)
    print("        bytes       = %d -> %d (+%d)"
          % (rec[path]["bytesBefore"], rec[path]["bytesAfter"],
             rec[path]["bytesAfter"] - rec[path]["bytesBefore"]))
    print("        md5         = %s -> %s" % (rec[path]["md5Before"], rec[path]["md5After"]))
    print("        state       = %s" % STATE)
    return 0


def cmd_verify(args):
    path = args.file
    text, _ = read_text(path)
    st = status_of(text)
    ok = st == "applied"
    print("[verify] status = %s" % st)
    # 1) 只差一行
    if ok:
        i = text.find(NEW)
        print("        该 row 原文:")
        for ln in text[i:i + len(NEW) + 200].split("\n")[:8]:
            print("          " + ln)
    # 2) 逐字节 diff（去 CR 后按行比）
    rec = load_state().get(path)
    if rec and os.path.exists(rec["backup"]):
        # 用 SequenceMatcher：逐行比会把「1 行插入/替换」误报成「N 行差异」（踩过这个坑）。
        b = io.open(rec["backup"], "r", encoding="utf-8", newline="").read().replace("\r\n", "\n").split("\n")
        a = text.split("\n")
        ops = [o for o in difflib.SequenceMatcher(None, b, a, autojunk=False).get_opcodes()
               if o[0] != "equal"]
        print("        行数 %d -> %d；非 equal opcode %d 个" % (len(b), len(a), len(ops)))
        for tag, i1, i2, j1, j2 in ops:
            print("          %-8s old L%d-%d (%d) -> new L%d-%d (%d)"
                  % (tag, i1 + 1, i2, i2 - i1, j1 + 1, j2, j2 - j1))
            for ln in a[j1:j2][:4]:
                print("             + %s" % ln)
        ok = ok and len(ops) == 1 and ops[0][0] in ("insert", "replace") \
            and (ops[0][2] - ops[0][1]) <= 1 and (ops[0][4] - ops[0][3]) == 1 \
            and a[ops[0][3]] == NEW
    else:
        print("        (无备份可比)")
    print("[verify] %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


def cmd_restore(args):
    path = args.file
    rec = load_state().get(path)
    if not rec or not os.path.exists(rec["backup"]):
        print("[restore] 找不到备份记录")
        return 2
    shutil.copy2(rec["backup"], path)
    text, _ = read_text(path)
    print("[restore] 已还原 -> %s" % path)
    print("          status = %s (期望 pristine)" % status_of(text))
    d = load_state()
    d.pop(path, None)
    save_state(d)
    return 0 if status_of(text) == "pristine" else 3


def cmd_dumpconfig(args):
    """跑 dsh --profile web --dump-config，把 thinking-guard row 摘出来。"""
    env = dict(os.environ)
    exe = shutil.which("dsh")
    if not exe:
        print("[dumpconfig] 找不到 dsh")
        return 2
    p = subprocess.run([exe, "--profile", "web", "--dump-config"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    print("[dumpconfig] exit=%d  stdout=%d chars  stderr=%d chars"
          % (p.returncode, len(p.stdout or ""), len(p.stderr or "")))
    if p.stderr and p.stderr.strip():
        print("--- stderr ---")
        print(p.stderr.strip()[:2000])
    lines = (p.stdout or "").split("\n")
    for i, ln in enumerate(lines):
        if "thinking-guard" in ln:
            print("--- stdout L%d 起 ---" % (i + 1))
            for j in range(i, min(i + 9, len(lines))):
                print("  " + lines[j])
            print("---")
    return 0 if p.returncode == 0 else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default=DEFAULT_TARGET)
    g = ap.add_mutually_exclusive_group(required=True)
    for name in ("check", "apply", "verify", "restore", "dumpconfig"):
        g.add_argument("--" + name, action="store_true")
    args = ap.parse_args()
    if not os.path.exists(args.file):
        print("目标不存在: %s" % args.file)
        return 2
    fn = {"check": cmd_check, "apply": cmd_apply, "verify": cmd_verify,
          "restore": cmd_restore, "dumpconfig": cmd_dumpconfig}
    for k, v in fn.items():
        if getattr(args, k):
            return v(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
