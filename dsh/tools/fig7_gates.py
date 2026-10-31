# -*- coding: utf-8 -*-
"""Three hard gates + zero-diff proof for the p141-160 figure backfill."""
import os
import re
import sys
import difflib

sys.stdout.reconfigure(encoding="utf-8")
BASE = r"C:/Users/27063/Documents/翻译产出/教材/MacKay信息论"
MD = os.path.join(BASE, "MacKay信息论_p141-160.bilingual.md")
BAK = os.path.join(BASE, "_backup_fig", "MacKay信息论_p141-160.bilingual.md.bak")

old = open(BAK, encoding="utf-8").read()
new = open(MD, encoding="utf-8").read()
ol = old.splitlines()
nl = new.splitlines()

print("== gate 1: page markers ==")
marks = re.findall(r"<!-- ===== (p\d+) ===== -->", new)
nums = [int(m[1:]) for m in marks]
print("  count =", len(marks), " set_ok =", set(nums) == set(range(141, 161)),
      " ordered =", nums == list(range(141, 161)))
print("  old count =", len(re.findall(r"<!-- ===== p\d+ ===== -->", old)))

print("== gate 2: placeholders / images ==")
ph = [i + 1 for i, l in enumerate(nl) if re.match(r"^\s*\[Figure", l)]
print("  lines starting with [Figure :", len(ph), ph)
imgs = [l for l in nl if l.startswith("![")]
print("  lines starting with '![' :", len(imgs))
refs = []
for l in imgs:
    m = re.match(r"^!\[[^\]]*\]\(([^)]+)\)$", l)
    assert m, "bad image line: " + l
    refs.append(m.group(1))
missing = [r for r in refs if not os.path.isfile(os.path.join(BASE, r))]
print("  refs =", len(refs), " absent files =", missing)
pngdir = os.path.join(BASE, "_assets")
mine = sorted(f for f in os.listdir(pngdir) if f.startswith("fig_1"))
print("  my pngs in _assets (fig_1*):", len(mine))
for f in mine:
    print("     ", f, os.path.getsize(os.path.join(pngdir, f)), "bytes")
uniq_ref = sorted(set(os.path.basename(r) for r in refs))
print("  unique referenced files:", len(uniq_ref))
print("  referenced but not in my list:", [f for f in uniq_ref if f not in mine])

print("== gate 3: zero-change proof ==")
old_nonempty = [(i + 1, l) for i, l in enumerate(ol) if l.strip()]
# placeholder lines (whole line placeholders) are allowed to disappear
allowed_prefix = "\u005bFigure"   # "[Figure"
skipped = [l for _, l in old_nonempty if l.lstrip().startswith(allowed_prefix)]
kept = [(i, l) for i, l in old_nonempty if not l.lstrip().startswith(allowed_prefix)]
print("  old non-empty lines:", len(old_nonempty), " placeholders skipped:", len(skipped))

# subsequence check
j = 0
missing_lines = []
for idx, line in kept:
    found = False
    while j < len(nl):
        if nl[j] == line:
            j += 1
            found = True
            break
        j += 1
    if not found:
        missing_lines.append((idx, line[:80]))
print("  subsequence missing =", len(missing_lines))
for m in missing_lines[:10]:
    print("     MISSING line", m[0], ":", m[1])

print("== difflib opcodes ==")
sm = difflib.SequenceMatcher(None, ol, nl, autojunk=False)
bad = []
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == "equal":
        continue
    removed = ol[i1:i2]
    nonph = [x for x in removed if x.strip() and not x.lstrip().startswith(allowed_prefix)]
    if tag != "insert" and nonph:
        bad.append((tag, i1 + 1, i2, j1 + 1, j2, nonph[:3]))
    print(f"  {tag:8s} old[{i1+1}:{i2}] new[{j1+1}:{j2}]  rm={len(removed)} add={j2-j1}"
          f"  removed_nonph={len(nonph)}")
print("  BAD opcodes (non-placeholder removals) =", len(bad))
for b in bad:
    print("    ", b)
