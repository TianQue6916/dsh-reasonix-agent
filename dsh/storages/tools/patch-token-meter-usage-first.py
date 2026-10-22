#!/usr/bin/env python3
"""Patch dsh-token-meter so measure() prefers provider-reported usage unconditionally.

WHY
---
dsh-compaction-basic decides auto-compaction from `tokenMeter.measure(session).totalTokens`
(lib/index.js:940-941). In dsh-token-meter, the usage branch was gated:

    baseline = usage !== void 0 && usageTokens(usage) >= estimatedAnchorTokens ? {kind:"usage",...}
                                                                              : {kind:"estimated",...}

That guard treats the char-based surface estimate (CHARS_PER_TOKEN = 4) as a LOWER BOUND,
so real provider usage is only trusted when it is >= the estimate.

With per-step snapshot injection (plan-anchor / git-context / thinking-anchor, appended
every step via dsh-agent-loop/lib/index.js:1061) the estimate inflates ~10x, so real usage
never qualifies -> the baseline stays "estimated" -> totalTokens is pure heuristic.

Forensic evidence (session a0d5fbf8-0fb1-419e-9baf-d95df0190144, 13 compactions):
  shadowedTokenCount(heuristic) / summarization-call real prompt
    compactions 1-10  (seq 1401..16134): ratio 0.60-0.76  (heuristic underestimates CJK, healthy)
    compactions 11-13 (seq 19010/20717/23225): ratio 9.50 / 9.75 / 10.56
  => auto-compaction fired at ~10-17% of true provider occupancy.

FIX
---
Trust provider usage whenever it exists; keep the estimate only for the truly headerless
case. totalTokens then becomes  usageTokens(usage) + surfaceDeltaTokens, i.e. the same
real-usage anchor the UI's contextPressure.projectedTokens already uses.

NOTE
----
Target lives in the shared layer (~/.dsh/profiles/node_modules/), same as the
dsh-tool-subagent patch: `pnpm install` overwrites it, re-run this script afterwards.
"""
from __future__ import annotations
import datetime, pathlib, shutil, subprocess, sys

TARGET = pathlib.Path.home() / ".dsh/profiles/node_modules/@deepseek-ai/dsh-token-meter/lib/index.js"
MARKER = "[patch:usage-first-baseline]"
OLD = "\t\t\tbaseline = usage !== void 0 && usageTokens(usage) >= estimatedAnchorTokens ? {"
NEW = (
    "\t\t\t// " + MARKER + " Prefer provider-reported usage whenever it exists. Upstream gated this\n"
    "\t\t\t// on `usageTokens(usage) >= estimatedAnchorTokens`, treating the char-based (CHARS_PER_TOKEN=4)\n"
    "\t\t\t// surface estimate as a lower bound; per-step snapshot injection inflates that estimate ~10x,\n"
    "\t\t\t// so real usage never qualified and compaction fired at ~10-17% of true occupancy. See PLAN.md.\n"
    "\t\t\tbaseline = usage !== void 0 ? {"
)


def die(msg: str, code: int = 1):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def read() -> str:
    if not TARGET.is_file():
        die(f"target not found: {TARGET}")
    return TARGET.read_text(encoding="utf-8")


def count(text: str, needle: str) -> int:
    return text.count(needle)


def node_check() -> bool:
    r = subprocess.run(["node", "--check", str(TARGET)], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr.strip())
    return r.returncode == 0


def do_check() -> int:
    t = read()
    patched = MARKER in t
    print(f"target     : {TARGET}")
    print(f"patched    : {patched}")
    print(f"OLD hits   : {count(t, OLD)}   (expect 1 when unpatched, 0 when patched)")
    print(f"MARKER hits: {count(t, MARKER)}   (expect 0 when unpatched, 1 when patched)")
    return 0 if (patched or count(t, OLD) == 1) else 1


def do_apply() -> int:
    t = read()
    if MARKER in t:
        print("already patched (idempotent no-op)")
        return 0
    n = count(t, OLD)
    if n != 1:
        die(f"expected exactly 1 anchor line, found {n}")
    bak = TARGET.with_name(
        TARGET.name + ".bak-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S") + "-pre-usage-first"
    )
    shutil.copy2(TARGET, bak)
    TARGET.write_text(t.replace(OLD, NEW, 1), encoding="utf-8")
    print(f"backup : {bak.name}")
    print("applied: baseline now prefers provider usage unconditionally")
    if not node_check():
        die("node --check FAILED after patch; restore with --restore", 2)
    print("node --check: SYNTAX OK")
    return do_verify()


def do_verify() -> int:
    t = read()
    ok = True
    checks = [
        ("marker present", MARKER in t),
        ("OLD anchor gone", count(t, OLD) == 0),
        ("usage-first line present", "\t\t\tbaseline = usage !== void 0 ? {" in t),
        ("estimated fallback intact", 'kind: "estimated"' in t),
        ("usage branch intact", 'kind: "usage"' in t),
    ]
    for name, passed in checks:
        print(f"  [{'PASS' if passed else 'FAIL'}] {name}")
        ok = ok and passed
    print(f"  [{'PASS' if node_check() else 'FAIL'}] node --check")
    return 0 if ok else 1


def do_restore() -> int:
    baks = sorted(TARGET.parent.glob(TARGET.name + ".bak-*-pre-usage-first"))
    if not baks:
        die("no backup found")
    shutil.copy2(baks[-1], TARGET)
    print(f"restored from {baks[-1].name}")
    return do_verify()


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "--check"
    if cmd == "--check":
        return do_check()
    if cmd == "--apply":
        return do_apply()
    if cmd == "--verify":
        return do_verify()
    if cmd == "--restore":
        return do_restore()
    die(f"unknown command: {cmd}  (use --check | --apply | --verify | --restore)")


if __name__ == "__main__":
    sys.exit(main())
