#!/usr/bin/env python3
# Objective 8 (second half): make desktop's reasoningEfforts reflect MEASURED capability
# instead of the hand-written 4-level guess (off/low/high/max) it carries today.
#
# Why this tool exists instead of just running rewrite-model-list.py twice:
#   rewrite-model-list.py REBUILDS the whole models block (it also drops models) and hard-codes
#   the web patch path. For desktop the model SET is already identical to web (verified by
#   desktop-model-audit.py: 61 == 61, zero not-in-allowlist), so the only thing left to fix is
#   the reasoningEfforts sub-block. This tool touches NOTHING else -- every other byte of the
#   YAML is preserved verbatim, including blank lines and indentation.
#
# Mapping (identical to rewrite-model-list.py, for consistency):
#   verdict ok_thinking                        -> the 6 levels the relay accepts
#   verdict ok_non_thinking / other / missing  -> reasoningEfforts: false
#   (plan_blocked / model_unavailable are NOT deleted here: the model set is out of scope for
#    this tool and was verified separately.)
#
# Modes:
#   --check   report current vs proposed, write nothing  (default)
#   --apply   back up, rewrite in place, then re-check
#   --restore restore from the newest backup
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

PROBE = pathlib.Path("C:/Users/27063/AppData/Local/Temp/all-models.json")
TARGET = pathlib.Path.home() / ".dsh/profiles/desktop/cordis.patch.yml"

LEVELS = ["off", "low", "medium", "high", "xhigh", "max"]
THINKING_BLOCK = ["            reasoningEfforts:"] + [
    ("              off: null" if lv == "off" else "              %s: %s" % (lv, lv)) for lv in LEVELS
]
FLAT_BLOCK = ["            reasoningEfforts: false"]


def verdicts():
    if not PROBE.exists():
        return None
    return {k: v.get("verdict") for k, v in json.load(io.open(PROBE, encoding="utf-8"))["models"].items()}


def split_blocks(lines):
    """Return (start, end, blocks) for the models: block, mirroring rewrite-model-list.py."""
    start = next(i for i, l in enumerate(lines) if l == "        models:")
    end = next(i for i in range(start + 1, len(lines)) if lines[i].startswith("- id: "))
    blocks = []
    cur = None
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


def current_efforts(block_lines):
    for l in block_lines:
        m = re.match(r"^            reasoningEfforts:(.*)$", l)
        if m:
            rest = m.group(1).strip()
            if rest in ("false", "true"):
                return rest
            lv = []
            idx = block_lines.index(l) + 1
            while idx < len(block_lines) and re.match(r"^              \S", block_lines[idx]):
                lv.append(block_lines[idx].strip().split(":")[0])
                idx += 1
            return "levels:" + ",".join(lv)
    return "(absent)"


def rebuilt(block_lines, want_thinking):
    out, skipping = [], False
    for l in block_lines:
        if re.match(r"^            reasoningEfforts:", l):
            skipping = True
            continue
        if skipping:
            if re.match(r"^              \S", l):
                continue
            skipping = False
        out.append(l)
    out.extend(THINKING_BLOCK if want_thinking else FLAT_BLOCK)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", action="store_true")
    ap.add_argument("--probe", default=str(PROBE))
    args = ap.parse_args()

    global PROBE
    PROBE = pathlib.Path(args.probe)

    if args.restore:
        baks = sorted(glob.glob(str(TARGET) + ".bak-*-pre-efforts-sync"))
        if not baks:
            sys.exit("no backup found")
        shutil.copy2(baks[-1], TARGET)
        print("restored from %s" % baks[-1])
        return 0

    v = verdicts()
    if v is None:
        sys.exit("probe result not found at %s -- run probe-all-models.py first" % PROBE)

    text = io.open(TARGET, encoding="utf-8", newline="").read()
    lines = text.split("\n")
    start, end, blocks = split_blocks(lines)
    print("target : %s" % TARGET)
    print("probe  : %s (%d verdicts)" % (PROBE, len(v)))
    print("blocks : %d" % len(blocks))
    print("")

    changes, missing = [], []
    new_blocks = []
    for b in blocks:
        verdict = v.get(b["id"])
        if verdict is None:
            missing.append(b["id"])
        want = verdict == "ok_thinking"
        now = current_efforts(b["lines"])
        after = "levels:" + ",".join(LEVELS) if want else "false"
        if now != after:
            changes.append((b["id"], now, after, verdict))
        new_blocks.append(rebuilt(b["lines"], want))

    print("verdicts missing for %d model(s): %s" % (len(missing), ", ".join(missing[:8]) or "(none)"))
    print("")
    print("would change %d of %d blocks:" % (len(changes), len(blocks)))
    for mid, now, after, verdict in changes[:60]:
        print("  %-42s %-30s -> %-34s [%s]" % (mid, now, after, verdict))

    if not args.apply:
        print("")
        print("(check only -- nothing written; pass --apply to rewrite)")
        return 0

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = "%s.bak-%s-pre-efforts-sync" % (TARGET, stamp)
    shutil.copy2(TARGET, bak)
    print("")
    print("backup -> %s" % bak)

    new_lines = lines[: start + 1]
    for nb in new_blocks:
        new_lines.extend(nb)
    new_lines.extend(lines[end:])
    io.open(TARGET, "w", encoding="utf-8", newline="").write("\n".join(new_lines) + "\n")
    print("wrote %s (%d -> %d bytes)" % (TARGET, len(text), os.path.getsize(TARGET)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
