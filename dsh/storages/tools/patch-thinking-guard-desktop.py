#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给 desktop profile 的 `dsh.profile.bundles` 补上 @ethanwong-hk/dsh-thinking-guard。

背景（2026-10-03）：
  web profile 的 bundles 里显式列了 `@ethanwong-hk/dsh-thinking-guard`，desktop 的没有
  ⇒ thinking-guard 在 desktop 上**从未加载过**。

关键事实（读过 dsh-app-boot/lib/index.js 后的结论）：
  - `loadProfileDirectory(binName, dir, installAnchor)` 只遍历
    `manifest.dsh.profile.bundles`，**没有**扫 node_modules 的 auto-discovery。
    ⇒ 想让 desktop 加载它，只能往这个数组里加一项。
  - `resolveBundleDir` → `packageDirFromAnchor` 用
    `createRequire(anchor).resolve.paths(pkg)` 在 node_modules 里找目录，
    **不读 `dependencies`** ⇒ 只要包在 `profiles/desktop/node_modules/` 下就能解析到，
    不必同时写进 `dependencies`（也不该写：写了以后 `pnpm install` 会把它按 registry 版本重装，
    把我们对 cordis.patch.yml 的 scope 名修复冲掉）。
  - `dsh/lib/bin.js:36` 对 profile=desktop 直接 `program.error(...)`
    ⇒ CLI 永远无法 boot/dump desktop profile，验证只能靠重启 Electron App。
  - TypeError/读不到的 bundle 会被 `loadProfileDirectory` **跳过**（记在 skippedBundles），
    所以最坏失败模式是静默退回「没装」，不会让 App 起不来。

target：`~/.dsh/profiles/desktop/package.json`（LF、2 空格缩进）
配套：包实物已从 web profile 复制到 `profiles/desktop/node_modules/@ethanwong-hk/dsh-thinking-guard`
      （其 cordis.patch.yml 已修成 scope 名，见 patch-thinking-guard-name.py）
"""

import argparse
import difflib
import io
import json
import os
import shutil
import sys
from datetime import datetime

PKG = r"C:\Users\27063\.dsh\profiles\desktop\package.json"
NM_DIR = r"C:\Users\27063\.dsh\profiles\desktop\node_modules\@ethanwong-hk\dsh-thinking-guard"
STATE = r"C:\Users\27063\.dsh\storages\thinking-guard-desktop-patch.json"

BUNDLE = "@ethanwong-hk/dsh-thinking-guard"


def ts():
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def die(msg):
    print("[error] " + msg)
    sys.exit(2)


def load_state():
    if os.path.exists(STATE):
        with io.open(STATE, "r", encoding="utf-8") as fh:
            return json.load(fh)
    return {}


def save_state(**kw):
    st = load_state()
    st.update(kw)
    st["updatedAt"] = datetime.now().isoformat(timespec="seconds")
    with io.open(STATE, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(st, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def read_pkg():
    with io.open(PKG, "r", encoding="utf-8", newline="") as fh:
        raw = fh.read()
    crlf = "\r\n" in raw
    return json.loads(raw.replace("\r\n", "\n")), crlf


def dump_pkg(d, crlf):
    text = json.dumps(d, indent=2, ensure_ascii=False) + "\n"
    return text.replace("\n", "\r\n") if crlf else text


def bundles_of(d):
    return d.get("dsh", {}).get("profile", {}).get("bundles")


def diagnose(d):
    ok = True
    print("        node_modules 包目录 : %s" % ("存在" if os.path.isdir(NM_DIR) else "**不存在**"))
    if not os.path.isdir(NM_DIR):
        ok = False
    bl = bundles_of(d)
    if bl is None:
        print("        dsh.profile.bundles : **缺失**")
        return False
    print("        dsh.profile.bundles : %d 项，%s %s" % (
        len(bl), BUNDLE, "已在其中" if BUNDLE in bl else "**不在其中**"))
    print("        dependencies        : %s" % (
        "含它（会触发 pnpm 重装，不建议）" if BUNDLE in (d.get("dependencies") or {}) else "不含它（正确）"))
    return ok


def cmd_check():
    d, _ = read_pkg()
    bl = bundles_of(d) or []
    print("[check] %s" % PKG)
    print("        字节 %d / 换行 LF" % len(io.open(PKG, "rb").read()))
    diagnose(d)
    print("        status = %s" % ("applied" if BUNDLE in bl else "pristine"))
    print("        state  = %s" % ("存在" if os.path.exists(STATE) else "不存在"))
    return 0


def cmd_apply():
    d, crlf = read_pkg()
    bl = bundles_of(d)
    if bl is None:
        die("package.json 里没有 dsh.profile.bundles，拒绝猜测")
    if BUNDLE in bl:
        print("[apply] 已是目标状态，跳过（幂等）")
        rec = load_state()
        if rec.get("backup") and os.path.exists(rec["backup"]):
            pass
        else:
            save_state(target=PKG, backup=rec.get("backup"), status="applied")
        if not os.path.isdir(NM_DIR):
            print("        ⚠️ 注意：bundles 已声明，但 node_modules 里没有包目录 —— bundle 会被静默跳过")
        return 0
    if not os.path.isdir(NM_DIR):
        die("node_modules 里没有 %s；先把包复制过去再加 bundles" % NM_DIR)
    backup = PKG + ".bak-" + ts() + "-pre-thinking-guard"
    shutil.copy2(PKG, backup)
    bl.append(BUNDLE)
    with io.open(PKG, "w", encoding="utf-8", newline="") as fh:
        fh.write(dump_pkg(d, crlf))
    save_state(target=PKG, backup=backup, status="applied", bundle=BUNDLE,
               oldCount=len(bl) - 1, newCount=len(bl))
    print("[apply] 已插入 %s（bundles %d -> %d）" % (BUNDLE, len(bl) - 1, len(bl)))
    print("        备份 %s" % backup)
    return 0


def cmd_verify():
    ok = True
    d, _ = read_pkg()
    bl = bundles_of(d) or []
    if BUNDLE not in bl:
        print("        bundles 里没有 %s" % BUNDLE)
        ok = False
    if BUNDLE in (d.get("dependencies") or {}):
        print("        dependencies 里也写进去了 —— 不该（pnpm install 会重装并冲掉 name 修复）")
        ok = False
    if not diagnose(d):
        ok = False
    rec = load_state()
    if rec.get("backup") and os.path.exists(rec["backup"]):
        old_text = io.open(rec["backup"], "r", encoding="utf-8", newline="").read().replace("\r\n", "\n")
        new_text = io.open(PKG, "r", encoding="utf-8", newline="").read().replace("\r\n", "\n")
        a, b = old_text.split("\n"), new_text.split("\n")
        ops = [o for o in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes()
               if o[0] != "equal"]
        print("        与备份 diff：行 %d -> %d，非 equal opcode %d 个" % (len(a), len(b), len(ops)))
        for tag, i1, i2, j1, j2 in ops:
            print("          %-8s old L%d-%d (%d) -> new L%d-%d (%d)"
                  % (tag, i1 + 1, i2, i2 - i1, j1 + 1, j2, j2 - j1))
            for ln in b[j1:j2][:3]:
                print("             + %s" % ln)
        # 判据 = 语义，不是 diff 形态：原末尾项无尾逗号，插入后要补 ','，文本层必然是 replace。
        try:
            o2, n2 = json.loads(old_text), json.loads(new_text)
        except Exception as exc:
            print("        JSON 解析失败：%s" % exc)
            o2 = n2 = None
        if o2 is not None:
            ob, nb = bundles_of(o2), bundles_of(n2)
            if nb != (ob or []) + [BUNDLE]:
                print("        bundles 不是「旧 + [%s]」：%s -> %s" % (BUNDLE, ob, nb))
                ok = False
            else:
                print("        bundles 语义 OK：%d -> %d，末项 = %s" % (len(ob), len(nb), nb[-1]))
            o2["dsh"]["profile"].pop("bundles", None)
            n2["dsh"]["profile"].pop("bundles", None)
            if o2 != n2:
                print("        除 bundles 外还有字段被改动（不该）")
                ok = False
            else:
                print("        除 bundles 外其余字段逐字不变 ✓")
            if (len(b) - len(a)) != 1:
                print("        行数变化 %+d（期望 +1）" % (len(b) - len(a)))
                ok = False
    else:
        print("        (无备份可比)")
    print("[verify] %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


def cmd_restore():
    rec = load_state()
    if not rec.get("backup") or not os.path.exists(rec["backup"]):
        die("state 里没有可用备份")
    shutil.copy2(rec["backup"], PKG)
    save_state(status="pristine")
    print("[restore] 已从 %s 还原" % rec["backup"])
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--restore", action="store_true")
    a = ap.parse_args()
    if a.check:
        return cmd_check()
    if a.apply:
        return cmd_apply()
    if a.verify:
        return cmd_verify()
    if a.restore:
        return cmd_restore()
    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
