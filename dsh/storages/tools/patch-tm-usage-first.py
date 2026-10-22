#!/usr/bin/env python3
"""Wire the tm-usage-first plugin row into both dsh profiles' cordis.patch.yml.

Why: auto-compaction fires from ctx.tokenMeter.measure(). Upstream only trusts
provider usage when it is >= the char-based estimate (a lower bound), so per-step
snapshot injection makes the ledger ~3.4x too high and compaction wipes
conversation at ~10-16% of the real window. See ~/.dsh/plugins/tm-usage-first.mjs.

The two profiles resolve dsh-token-meter from different roots (CLI copy vs
Electron app.asar copy), so a file patch only fixes one of them. This plugin
wraps the live service instead and therefore covers both.

Usage:
  python patch-tm-usage-first.py --check
  python patch-tm-usage-first.py --apply
  python patch-tm-usage-first.py --verify
  python patch-tm-usage-first.py --restore
"""
import argparse
import io
import pathlib
import shutil
import sys

DSH = pathlib.Path.home() / ".dsh"
TARGETS = [DSH / "profiles" / "web" / "cordis.patch.yml",
           DSH / "profiles" / "desktop" / "cordis.patch.yml"]

MARK = "tm-usage-first"
BLOCK = (
    "\n"
    "# \u2500\u2500 token-meter usage-first \u8865\u4e01\uff082026-10-04 \u52a0\u5165\uff09\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n"
    "# \u4e3a\u4ec0\u4e48\uff1aauto-compaction \u7684\u89e6\u53d1\u5224\u636e\u662f ctx.tokenMeter.measure().totalTokens\uff0c\n"
    "# \u800c\u4e0a\u6e38\u53ea\u5728 usageTokens(usage) >= estimatedAnchorTokens \u65f6\u624d\u91c7\u4fe1 provider usage\n"
    "# \uff08\u628a char/4 \u4f30\u7b97\u5f53\u4e0b\u754c\uff09\u3002per-step snapshot \u6ce8\u5165\u628a\u4f30\u7b97\u6491\u5230\u771f\u5b9e\u503c\u7684 ~3.4 \u500d\uff0c\n"
    "# \u6240\u4ee5\u957f\u4f1a\u8bdd\u91cc usage \u6c38\u8fdc\u4e0d\u5408\u683c \u21d2 \u8d26\u672c\u865a\u9ad8 \u21d2 compaction \u5728\u771f\u5b9e\u5360\u7528 10-16% \u5c31\u89e6\u53d1\uff0c\n"
    "# \u628a\u8fd8\u6ca1\u63a5\u8fd1\u4e0a\u9650\u7684\u5bf9\u8bdd\u538b\u6389\u2014\u2014\u7528\u6237\u770b\u5230\u7684\u300c\u4e0a\u4e0b\u6587\u7a81\u7136\u6d88\u5931\u300d\u3002\n"
    "# \u4e3a\u4ec0\u4e48\u7528 plugin\uff1aweb/headless \u7684 dsh-token-meter \u6765\u81ea ~/.dsh/profiles/node_modules\uff0c\n"
    "# \u800c desktop\uff08Electron App\uff09\u4ece resources/app.asar \u89e3\u6790 core\u2014\u2014\u540c\u4e00\u4efd\u6587\u4ef6\u8865\u4e01\u53ea\u80fd\u4fee\u4e00\u4fa7\u3002\n"
    "# \u8fd9\u4e2a plugin \u76f4\u63a5\u5305\u4f4f ctx.tokenMeter \u670d\u52a1\u5b9e\u4f8b\uff0c\u4e24\u4fa7\u90fd\u7ba1\u7528\uff1b\u5df2\u6253\u8865\u4e01\u7684\u526f\u672c\u8d70 fast path\uff08\u65e0\u526f\u4f5c\u7528\uff09\u3002\n"
    "# \u56de\u6eda\uff1apython ~/.dsh/storages/tools/patch-tm-usage-first.py --restore\n"
    "- insert:\n"
    "    - id: tm-usage-first\n"
    "      name: ../../plugins/tm-usage-first.mjs\n"
)


def load(p):
    return io.open(p, encoding="utf-8", newline="").read()


def save(p, s):
    io.open(p, "w", encoding="utf-8", newline="").write(s)


def applied(s):
    return ("- id: " + MARK) in s


def check():
    ok = True
    for p in TARGETS:
        if not p.exists():
            print(f"  MISSING {p}")
            ok = False
            continue
        s = load(p)
        print(f"  {p}: {len(s.encode('utf-8'))} B, applied={applied(s)}")
    return ok


def apply():
    for p in TARGETS:
        s = load(p)
        if applied(s):
            print(f"  already applied: {p}")
            continue
        bak = p.with_name(p.name + ".bak-20261004-pre-tm-usage-first")
        if not bak.exists():
            shutil.copy2(p, bak)
            print(f"  backup -> {bak.name}")
        if not s.endswith("\n"):
            s += "\n"
        save(p, s + BLOCK)
        print(f"  applied: {p} ({len(s.encode('utf-8'))} -> {len(load(p).encode('utf-8'))} B)")
    return True


def verify():
    ok = True
    for p in TARGETS:
        s = load(p)
        n = s.count("- id: " + MARK)
        print(f"  {p.name}: occurrences={n}")
        if n != 1:
            ok = False
            continue
        if "../../plugins/tm-usage-first.mjs" not in s:
            print("    MISSING plugin path")
            ok = False
        if not (DSH / "plugins" / "tm-usage-first.mjs").exists():
            print("    MISSING plugin file")
            ok = False
    print("RESULT: " + ("PASS" if ok else "FAIL"))
    return ok


def restore():
    for p in TARGETS:
        bak = p.with_name(p.name + ".bak-20261004-pre-tm-usage-first")
        if bak.exists():
            shutil.copy2(bak, p)
            print(f"  restored {p} from {bak.name}")
        else:
            s = load(p)
            i = s.find("# \u2500\u2500 token-meter usage-first")
            if i >= 0:
                save(p, s[:i].rstrip("\n") + "\n")
                print(f"  stripped block from {p}")
            else:
                print(f"  nothing to restore for {p}")
    return True


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true")
    g.add_argument("--apply", action="store_true")
    g.add_argument("--verify", action="store_true")
    g.add_argument("--restore", action="store_true")
    a = ap.parse_args()
    if a.check:
        sys.exit(0 if check() else 1)
    if a.apply:
        sys.exit(0 if apply() else 1)
    if a.verify:
        sys.exit(0 if verify() else 1)
    if a.restore:
        sys.exit(0 if restore() else 1)


if __name__ == "__main__":
    main()
