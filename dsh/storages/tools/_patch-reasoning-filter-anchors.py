#!/usr/bin/env python3
# Make patch-gateway-reasoning-filter.py able to target the LINUX copy of gateway.mjs.
#
# Why: the script's two insert anchors are
#   HELPER_ANCHOR = "function forward(clientReq, clientRes, keyEntry, body, meta) {"
#   CALL_ANCHOR   = "  // bodylog-end"
# The second one only exists because the WINDOWS gateway already carries the bodylog patch.
# The Linux copy is a different 1642-line build WITHOUT bodylog => count == 0 => the script
# aborts. Rather than guess a replacement anchor for a file this session cannot read
# (tianque is offline), expose both anchors as CLI options. Defaults are unchanged, so the
# Windows behaviour is bit-for-bit identical.
#
# This file itself contains no backslash characters on purpose (see memory:
# python-windows-backslash-heredoc-trap). The strings being matched contain none either.
import pathlib
import sys

TARGET = pathlib.Path.home() / ".dsh/storages/tools/patch-gateway-reasoning-filter.py"
src = TARGET.read_text(encoding="utf-8")
orig = src

EDITS = [
    # 1) cmd_check takes the anchors
    (
        'def cmd_check(path):\n    raw, text = read_text(path)\n',
        'def cmd_check(path, helper_anchor=HELPER_ANCHOR, call_anchor=CALL_ANCHOR):\n    raw, text = read_text(path)\n',
    ),
    (
        '    print(f"  helper 锚点 count = {count(text, HELPER_ANCHOR)}")\n'
        '    print(f"  call   锚点 count = {count(text, CALL_ANCHOR)}")\n',
        '    print(f"  helper 锚点 count = {count(text, helper_anchor)}")\n'
        '    print(f"  call   锚点 count = {count(text, call_anchor)}")\n'
        '    print(f"  helper 锚点原文 = {helper_anchor!r}")\n'
        '    print(f"  call   锚点原文 = {call_anchor!r}")\n',
    ),
    # 2) cmd_apply takes the anchors and uses them
    (
        'def cmd_apply(path):\n    raw, text = read_text(path)\n'
        '    if APPLIED_MARK in text:\n        print("已打过补丁，跳过（幂等）")\n        cmd_check(path)\n        return 0\n',
        'def cmd_apply(path, helper_anchor=HELPER_ANCHOR, call_anchor=CALL_ANCHOR):\n    raw, text = read_text(path)\n'
        '    if APPLIED_MARK in text:\n        print("已打过补丁，跳过（幂等）")\n        cmd_check(path, helper_anchor, call_anchor)\n        return 0\n',
    ),
    (
        '    if count(text, HELPER_ANCHOR) != 1 or count(text, CALL_ANCHOR) != 1:\n'
        '        print(f"锚点不唯一：helper={count(text, HELPER_ANCHOR)} call={count(text, CALL_ANCHOR)}")\n',
        '    if count(text, helper_anchor) != 1 or count(text, call_anchor) != 1:\n'
        '        print(f"锚点不唯一：helper={count(text, helper_anchor)} call={count(text, call_anchor)}")\n',
    ),
    (
        '    new_text = insert_once(text, HELPER_ANCHOR, HELPER_BLOCK, "before", "helper")\n'
        '    new_text = insert_once(new_text, CALL_ANCHOR, CALL_BLOCK, "after", "call")\n',
        '    new_text = insert_once(text, helper_anchor, HELPER_BLOCK, "before", "helper")\n'
        '    new_text = insert_once(new_text, call_anchor, CALL_BLOCK, "after", "call")\n',
    ),
    # 3) CLI options + wiring
    (
        '    ap.add_argument("--file", default=DEFAULT_TARGET)\n',
        '    ap.add_argument("--file", default=DEFAULT_TARGET)\n'
        '    ap.add_argument("--helper-anchor", default=HELPER_ANCHOR,\n'
        '                    help="覆盖 helper 插入锚点；Linux 版 gateway.mjs 行号/内容可能不同")\n'
        '    ap.add_argument("--call-anchor", default=CALL_ANCHOR,\n'
        '                    help="覆盖 call 插入锚点；Linux 版没有 bodylog 补丁，默认锚点会 count=0")\n',
    ),
    (
        '    if args.check:\n        return cmd_check(args.file)\n',
        '    if args.check:\n        return cmd_check(args.file, args.helper_anchor, args.call_anchor)\n',
    ),
    (
        '    return cmd_apply(args.file)\n',
        '    return cmd_apply(args.file, args.helper_anchor, args.call_anchor)\n',
    ),
]

for old, new in EDITS:
    n = src.count(old)
    if n != 1:
        sys.exit("EDIT not uniquely matched (%d): %r" % (n, old[:70]))
    src = src.replace(old, new, 1)

TARGET.write_text(src, encoding="utf-8")
print("patched %s: %d -> %d bytes, %d edits" % (TARGET.name, len(orig), len(src), len(EDITS)))
