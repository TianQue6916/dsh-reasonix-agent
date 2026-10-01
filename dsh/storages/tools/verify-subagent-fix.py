#!/usr/bin/env python
"""Verify the two subagent fixes against a REAL delegated child, no UI clicking
on my side required beyond triggering one memory write.

Checks, for every subagent session (delegationDepth > 0) written after a cutoff:
  1. TOOL CATALOG -- its `request/header` must carry a non-empty `tools` array.
     Before the tool-bootstrap bypass the child's toolFilter.allow intersected the
     bootstrap keep-set to nothing, so the header had NO tools field at all
     (observed: 249 characters total on session 874ccdcd).
  2. LANGUAGE -- its reasoning blocks must contain CJK characters. Before the
     subagent-language row, 12/12 sampled children reasoned in English (cjk=0).

Usage:
  python verify-subagent-fix.py [--since "2026-09-30 03:02"] [--all]
"""
import argparse
import glob
import json
import os
import subprocess
import sys
from datetime import datetime

ZSTD = r"D:/miniconda/Library/bin/zstd"
BASE = r"C:/Users/27063/.dsh/sessions/--C-Users-27063--"

ap = argparse.ArgumentParser()
ap.add_argument("--since", default="2026-09-30 03:02",
                help="only sessions modified after this local time")
ap.add_argument("--all", action="store_true", help="ignore --since")
args = ap.parse_args()

ts = None
if not args.all:
    ts = datetime.strptime(args.since, "%Y-%m-%d %H:%M").timestamp()

files = sorted(glob.glob(os.path.join(BASE, "*", "session.v4.jsonl.zstd")),
               key=os.path.getmtime, reverse=True)

rows = []
for f in files[:40]:
    if ts is not None and os.path.getmtime(f) < ts:
        continue
    try:
        raw = subprocess.run([ZSTD, "-dc", os.path.abspath(f)],
                             capture_output=True, timeout=120)
    except Exception:
        continue
    if raw.returncode != 0 or not raw.stdout:
        continue

    hdr = None
    header_len = 0
    tool_names = None
    reasoning = []
    tool_calls = 0
    for i, line in enumerate(raw.stdout.decode("utf-8", "replace").splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except Exception:
            continue
        if i == 0:
            hdr = d
        t = d.get("type")
        if t == "request/header":
            h = (d.get("data") or {}).get("header") or {}
            tools = h.get("tools")
            if isinstance(tools, list):
                tool_names = [x.get("name") for x in tools]
            header_len = len(json.dumps(d, ensure_ascii=False))
        elif t == "assistant/message":
            for c in (d.get("data", {}).get("message", {}).get("content") or []):
                if c.get("type") == "reasoning" and c.get("text"):
                    reasoning.append(c["text"])
                if c.get("type") in ("tool-call", "tool_call"):
                    tool_calls += 1
    if hdr is None or (hdr.get("delegationDepth") or 0) == 0:
        continue

    text = " ".join(reasoning)
    cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    rows.append({
        "id": (hdr.get("id") or "?")[:18],
        "mtime": datetime.fromtimestamp(os.path.getmtime(f)).strftime("%H:%M:%S"),
        "label": hdr.get("agentPreset"),
        "header_len": header_len,
        "tools": tool_names,
        "reasoning_blocks": len(reasoning),
        "cjk": cjk,
        "tool_calls": tool_calls,
        "sample": text[:70].replace("\n", " "),
    })

if not rows:
    print(f"no subagent session found after {args.since} (use --all to scan everything)")
    sys.exit(2)

print(f"subagent sessions inspected: {len(rows)}\n")
ok_tools = ok_lang = 0
for r in rows:
    good_tools = bool(r["tools"])
    good_lang = r["cjk"] > 0 if r["reasoning_blocks"] > 0 else None
    ok_tools += 1 if good_tools else 0
    ok_lang += 1 if good_lang else 0
    print(f"{r['id']}  {r['mtime']}  preset={r['label']}")
    print(f"    request/header: {r['header_len']} chars, tools={r['tools']}")
    print(f"    reasoning blocks={r['reasoning_blocks']} cjk={r['cjk']} tool_calls={r['tool_calls']}")
    print(f"    -> catalog {'OK' if good_tools else 'EMPTY (bug)'}"
          f" | language {'OK(中文)' if good_lang else ('ENGLISH (bug)' if good_lang is False else 'n/a')}")
    if r["sample"]:
        print(f"    sample: {r['sample']!r}")
    print()

print(f"SUMMARY  catalog OK {ok_tools}/{len(rows)}   chinese reasoning {ok_lang}/{len(rows)}")
sys.exit(0 if ok_tools == len(rows) and ok_lang == len(rows) else 1)
