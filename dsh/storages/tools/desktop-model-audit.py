#!/usr/bin/env python3
# Objective 8 verification: is the desktop profile's commandcode-goat model list free of
# "dead" models (ids the local gateway allowlist rejects with 403), and does it match web?
# Repro: python ~/.dsh/storages/tools/desktop-model-audit.py
# No backslashes in this file on purpose (see memory: python-windows-backslash-heredoc-trap).
import json
import pathlib
import re
import sys

HOME = pathlib.Path.home()
ALLOW = pathlib.Path("D:/Toolbox/goat-gateway/model-allowlist.json")
PATCHES = {
    "web": HOME / ".dsh/profiles/web/cordis.patch.yml",
    "desktop": HOME / ".dsh/profiles/desktop/cordis.patch.yml",
}

def allowed_ids():
    raw = json.loads(ALLOW.read_text(encoding="utf-8"))
    out = set()
    for key, val in raw.items():
        if key.startswith("_"):
            continue
        if isinstance(val, list):
            for item in val:
                if isinstance(item, str):
                    out.add(item)
                elif isinstance(item, dict) and "id" in item:
                    out.add(item["id"])
        elif isinstance(val, dict):
            for sub in val.values():
                if isinstance(sub, list):
                    for item in sub:
                        out.add(item if isinstance(item, str) else item.get("id"))
    return out

def ccg_block_models(path_text: str):
    """Extract model ids under the 'commandcode-goat:' provider entry (not the -anthropic one)."""
    lines = path_text.split("\n")
    start = None
    for i, ln in enumerate(lines):
        if re.match(r"^\s{6}commandcode-goat:\s*$", ln):
            start = i
            break
    if start is None:
        return None
    ids = []
    for ln in lines[start + 1:]:
        if re.match(r"^\s{6}\S", ln) and not ln.strip().startswith("-"):
            break
        m = re.match(r"^\s+- id:\s*(\S+)\s*$", ln)
        if m:
            ids.append(m.group(1))
    return ids

allow = allowed_ids()
print("allowlist: %s" % ALLOW)
print("  allowed ids: %d" % len(allow))
print("")

sets = {}
for name, p in PATCHES.items():
    text = p.read_text(encoding="utf-8")
    ids = ccg_block_models(text)
    if ids is None:
        print("%s: could not locate the commandcode-goat block" % name)
        continue
    sets[name] = set(ids)
    dead = [i for i in ids if i not in allow]
    dupes = [i for i in set(ids) if ids.count(i) > 1]
    print("%-8s models=%d  not-in-allowlist=%d  duplicates=%d" % (name, len(ids), len(dead), len(dupes)))
    if dead:
        print("   DEAD: %s" % ", ".join(sorted(dead)[:12]))
    if dupes:
        print("   DUP : %s" % ", ".join(dupes))

if len(sets) == 2:
    w, d = sets["web"], sets["desktop"]
    print("")
    print("web-only    : %s" % (", ".join(sorted(w - d)) or "(none)"))
    print("desktop-only: %s" % (", ".join(sorted(d - w)) or "(none)"))
    print("VERDICT: %s" % ("PASS - desktop set == web set and neither has dead ids"
                            if (w == d and not (d - allow)) else "CHECK ABOVE"))
