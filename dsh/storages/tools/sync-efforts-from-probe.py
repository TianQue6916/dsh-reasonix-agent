#!/usr/bin/env python3
# Rebuild reasoningEfforts in BOTH profile patches from a real probe result.
#
# Background (2026-10-04): web and desktop disagreed on reasoningEfforts for 47 of 61 models.
# Two different probe scripts had been used over time:
#   * probe-all-models.py  -- only inspects choices[0].message.reasoning_content
#   * probe-reasoning-all.py -- inspects reasoning_content AND reasoning_details
# The second exists because the first systematically misclassifies every model that reports
# thinking through `reasoning_details` (e.g. google/gemini-*, gpt-6-*, gpt-5.6-*) as
# "no reasoning". web's block was built from the FIRST script's verdicts, so web is the one
# that is wrong for those families -- verified live: gpt-6-luna / gpt-5.6-sol / gpt-5.6-luna
# all answer 200 + reasoning_details, while web declared reasoningEfforts: false.
#
# So: neither side is authoritative. This tool rebuilds both from one fresh probe.
#
# Verdict mapping (fail-safe: never guess):
#   ok_thinking | levels_ok                       -> the 6 levels the relay accepts
#   ok_non_thinking | no_reason | rejected        -> reasoningEfforts: false
#   err_403 | throttled | other | absent          -> LEAVE UNCHANGED (unknown, do not guess)
#
# Only the reasoningEfforts sub-block is touched; every other byte of the YAML, including
# blank lines and indentation, is preserved verbatim. Idempotent. Backs up before writing.
#
# Usage:
#   python sync-efforts-from-probe.py --probe <result.json>            # check only (default)
#   python sync-efforts-from-probe.py --probe <result.json> --apply
#   python sync-efforts-from-probe.py --restore                        # newest backup, both files
# No backslash characters in this file on purpose.
import argparse
import datetime
import glob
import io
import json
import os
import pathlib
import re
import shutil
import sys

LEVELS = ["off", "low", "medium", "high", "xhigh", "max"]
THINKING = ["            reasoningEfforts:"] + [
    ("              off: null" if lv == "off" else "              %s: %s" % (lv, lv)) for lv in LEVELS
]
FLAT = ["            reasoningEfforts: false"]

TRUE_V = {"ok_thinking", "levels_ok"}
FALSE_V = {"ok_non_thinking", "no_reason", "rejected"}
UNKNOWN_V = {"err_403", "throttled", "other"}

HOME = pathlib.Path.home()
PATCHES = {
    "web": HOME / ".dsh/profiles/web/cordis.patch.yml",
    "desktop": HOME / ".dsh/profiles/desktop/cordis.patch.yml",
}


def load_verdicts(path):
    d = json.load(io.open(path, encoding="utf-8"))
    models = d.get("models") if isinstance(d, dict) and "models" in d else d
    out = {}
    for mid, val in models.items():
        if isinstance(val, dict):
            out[mid] = val.get("verdict")
    return out


def split_blocks(lines):
    """Bound the commandcode-goat provider's OWN models list.

    Two traps, both of which corrupted BOTH patches on 2026-10-04 (dump-config exit=1, rows=0):
      1. The file contains TWO '        models:' lines -- commandcode-goat-anthropic has one
         first, and it is only 6 lines long. Anchoring on the provider key is required.
      2. The old end-finder looked for the next line starting with '- id: ' at column 0, but the
         block is followed by a 2-space-indented sibling far below, so the supposed block
         swallowed 421 extra lines.
    A models block ends at the first non-blank line indented less than 10 spaces.
    """
    prov = next(i for i, l in enumerate(lines) if l == "      commandcode-goat:")
    start = next(i for i in range(prov + 1, len(lines)) if lines[i] == "        models:")
    end = next(i for i in range(start + 1, len(lines))
               if lines[i].strip() and not lines[i].startswith("          "))
    blocks, cur = [], None
    for i in range(start + 1, end):
        l = lines[i]
        m = re.match(r"^          - id: (.+)$", l)
        if m:
            if cur:
                blocks.append(cur)
            cur = {"id": m.group(1).strip(), "lines": [l]}
        elif cur is not None:
            cur["lines"].append(l)
    if cur:
        blocks.append(cur)
    return start, end, blocks


def current_efforts(block):
    for idx, l in enumerate(block):
        m = re.match(r"^            reasoningEfforts:(.*)$", l)
        if m:
            rest = m.group(1).strip()
            if rest in ("false", "true"):
                return rest
            lv, j = [], idx + 1
            while j < len(block) and re.match(r"^              \S", block[j]):
                lv.append(block[j].strip().split(":")[0])
                j += 1
            return "levels:" + ",".join(lv)
    return "(absent)"


def rebuilt(block, want):
    out, skipping = [], False
    for l in block:
        if re.match(r"^            reasoningEfforts:", l):
            skipping = True
            continue
        if skipping:
            if re.match(r"^              \S", l):
                continue
            skipping = False
        out.append(l)
    out.extend(THINKING if want else FLAT)
    return out


def process(name, path, verdicts, apply):
    text = io.open(path, encoding="utf-8", newline="").read()
    lines = text.split("\n")
    start, end, blocks = split_blocks(lines)
    changes, unknown, absent = [], [], []
    new_blocks = []
    for b in blocks:
        v = verdicts.get(b["id"])
        now = current_efforts(b["lines"])
        if v is None or v in UNKNOWN_V:
            unknown.append((b["id"], v or "absent"))
            new_blocks.append(b["lines"])
            continue
        want = v in TRUE_V
        after = "levels:" + ",".join(LEVELS) if want else "false"
        if now != after:
            changes.append((b["id"], now, after, v))
        new_blocks.append(rebuilt(b["lines"], want))
        if v not in TRUE_V and v not in FALSE_V:
            absent.append((b["id"], v))
    print("== %s ==" % name)
    print("   %s" % path)
    print("   blocks=%d  would-change=%d  left-unknown=%d" % (len(blocks), len(changes), len(unknown)))
    for mid, now, after, v in changes:
        print("     %-42s %-30s -> %-30s [%s]" % (mid, now, after, v))
    if unknown:
        print("   unknown (UNCHANGED): %s" % ", ".join("%s(%s)" % u for u in unknown[:10]))
    print("")
    if not apply or not changes:
        return 0, len(changes)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = "%s.bak-%s-pre-efforts-sync" % (path, stamp)
    shutil.copy2(path, bak)
    new_lines = lines[: start + 1]
    for nb in new_blocks:
        new_lines.extend(nb)
    new_lines.extend(lines[end:])
    io.open(path, "w", encoding="utf-8", newline="").write("\n".join(new_lines) + "\n")
    print("   backup -> %s" % os.path.basename(bak))
    print("   wrote %s (%d -> %d bytes)" % (os.path.basename(str(path)), len(text), os.path.getsize(path)))
    print("")
    return 0, len(changes)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", action="store_true")
    ap.add_argument("--profiles", default="web,desktop")
    args = ap.parse_args()

    if args.restore:
        for name, p in PATCHES.items():
            baks = sorted(glob.glob(str(p) + ".bak-*-pre-efforts-sync"))
            if baks:
                shutil.copy2(baks[-1], p)
                print("restored %s from %s" % (name, os.path.basename(baks[-1])))
            else:
                print("no backup for %s" % name)
        return 0

    if not args.probe:
        sys.exit("--probe <result.json> is required (or --restore)")
    verdicts = load_verdicts(args.probe)
    import collections
    print("probe  : %s" % args.probe)
    print("verdicts: %d  %s" % (len(verdicts), dict(collections.Counter(verdicts.values()))))
    print("")
    total = 0
    for name in args.profiles.split(","):
        name = name.strip()
        if name in PATCHES:
            _, n = process(name, PATCHES[name], verdicts, args.apply)
            total += n
    print("TOTAL would-change/patched: %d" % total)
    if not args.apply:
        print("(check only -- pass --apply to rewrite; backups are automatic)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
