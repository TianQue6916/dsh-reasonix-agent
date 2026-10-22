#!/usr/bin/env python3
# Objective 7: has mnemon's idleReview EVER actually run?
# Decision rule (worked out earlier, recorded in PLAN.md ~line 250):
#   the host half writes rows.mnemonSubagentTokenUsage.val.totals into
#   ~/.dsh/storages/session_projcache/sessions/*.json.
#   outputTokens > 0 in ANY session proves a review subagent really executed.
# Each record is {version, record:{identity, rows}}.
import collections
import json
import pathlib

PROJ = pathlib.Path.home() / ".dsh/storages/session_projcache/sessions"
files = sorted(PROJ.glob("*.json"))
print("projcache records: %d" % len(files))

present = 0
nonzero = []
sum_out = 0
sum_in = 0
kinds = collections.Counter()
sample_missing = []

for p in files:
    try:
        rec = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        continue
    rows = ((rec.get("record") or {}).get("rows") or {})
    for k in rows:
        kinds[k] += 1
    node = rows.get("mnemonSubagentTokenUsage")
    if node is None:
        if len(sample_missing) < 5:
            sample_missing.append(p.stem)
        continue
    present += 1
    val = node.get("val") or {}
    totals = val.get("totals") or {}
    out = totals.get("outputTokens") or 0
    inp = totals.get("inputTokens") or 0
    sum_out += out
    sum_in += inp
    if out > 0:
        nonzero.append((p.stem, inp, out))

print("records WITH mnemonSubagentTokenUsage : %d" % present)
print("records WITHOUT it                    : %d" % (len(files) - present))
print("total inputTokens across all          : %d" % sum_in)
print("total outputTokens across all         : %d" % sum_out)
print("")
print("VERDICT: %s" % ("PASS - a review subagent really ran" if nonzero
                        else "FAIL - outputTokens is 0 everywhere => idleReview has never executed"))
print("")
if nonzero:
    for sid, i, o in nonzero[:15]:
        print("  %s  in=%d out=%d" % (sid, i, o))
else:
    print("sample of sids lacking the row (for reference):")
    for s in sample_missing:
        print("  " + s)
print("")
print("top row keys present across records (sanity):")
for k, n in kinds.most_common(12):
    print("  %5d  %s" % (n, k))
