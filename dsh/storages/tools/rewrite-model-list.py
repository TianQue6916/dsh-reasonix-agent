#!/usr/bin/env python
"""Rewrite the commandcode-goat `models:` list in profiles/web/cordis.patch.yml
so each model declares ITS OWN measured reasoning capability, and drop the models
the plan does not actually serve.

Input: the probe result written by probe-all-models.py
Verdict -> action
  ok_thinking       keep, reasoningEfforts = the 5 levels the relay accepts
                    (low|medium|high|xhigh|max + off:null). Measured: the relay
                    rejects none/minimal with 400
                    "Invalid option: expected one of low|medium|high|xhigh|max".
  ok_non_thinking   keep, reasoningEfforts = false (model produces no
                    reasoning_content, so offering effort levels would lie).
  other             keep, reasoningEfforts = false (reachable only sometimes;
                    offering levels would lie today)
  plan_blocked      DROP -- relay answers 403 MODEL_NOT_IN_PLAN for every key
  model_unavailable DROP -- relay answers 403 "Authentication failed" for this
                    model while the same key works for others
  claude-*          DROP -- /v1/models advertises only /messages (Anthropic
                    shape) for them, and the route speaks openai-completions

Idempotent: re-running rebuilds the same block from the same inputs.
"""
import io
import json
import re
import sys

PATCH = r"C:/Users/27063/.dsh/profiles/web/cordis.patch.yml"
PROBE = r"C:/Users/27063/AppData/Local/Temp/all-models.json"

probe = json.load(io.open(PROBE, encoding="utf-8"))
verdicts = {k: v.get("verdict") for k, v in probe["models"].items()}

THINKING_LEVELS = """            reasoningEfforts:
              off: null
              low: low
              medium: medium
              high: high
              xhigh: xhigh
              max: max"""


def eff_block(kind):
    if kind == "thinking":
        return THINKING_LEVELS.splitlines()
    return ["            reasoningEfforts: false"]


text = io.open(PATCH, encoding="utf-8", newline="").read()
lines = text.splitlines()

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

print(f"parsed {len(blocks)} model blocks (lines {start+2}..{end})")

kept, dropped, reclassified = [], [], []
for b in blocks:
    mid = b["id"]
    v = verdicts.get(mid)
    if v in ("plan_blocked", "model_unavailable") or mid.startswith("claude-"):
        dropped.append((mid, v or "claude/messages-only"))
        continue
    # strip any old reasoningEfforts block (own line + its deeper-indented children)
    out, skipping = [], False
    for l in b["lines"]:
        if re.match(r"^            reasoningEfforts:", l):
            skipping = True
            continue
        if skipping:
            if re.match(r"^              \S", l):
                continue
            skipping = False
        out.append(l)
    kind = "thinking" if v == "ok_thinking" else "nonthinking"
    out.extend(eff_block(kind))
    kept.append(out)
    reclassified.append((mid, kind))

new_lines = lines[:start + 1]
for k in kept:
    new_lines.extend(k)
new_lines.extend(lines[end:])

io.open(PATCH, "w", encoding="utf-8", newline="").write("\n".join(new_lines) + "\n")
print(f"kept={len(kept)}  dropped={len(dropped)}")
print("thinking  :", [m for m, k in reclassified if k == "thinking"])
print("nonthink  :", len([m for m, k in reclassified if k == "nonthinking"]))
print("dropped   :", dropped)
