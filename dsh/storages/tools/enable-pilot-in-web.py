#!/usr/bin/env python3
"""Enable dsh-pilot (browser-use) in the PRODUCTION web profile.

Why only `dsh.profile.bundles` and NOT `dependencies`:
  The lab profile declares  "dsh-pilot": "git+https://github.com/guo6x/dsh-pilot.git".
  Installing that requires git to reach github.com, and on this machine CLI tools do
  NOT read the WinINET system proxy, so `git ls-remote github.com` fails (only the
  browser reaches it through DevSidecar). A dependency entry that cannot be installed
  makes every future `npm install` fail at the profile root -- strictly worse than an
  undeclared but present package. So the package tree is COPIED from
  ~/.dsh-lab/profiles/browser-lab/node_modules/dsh-pilot (v0.7.2, --no-sandbox patch
  already applied at lib/index.js:244) and only the bundle list is edited.

Why bundles is enough:
  dsh auto-discovers a bundle's own cordis.patch.yml; dsh-pilot ships one that inserts
  the `pilot` row itself. Adding a manual row for the same id is what broke the lab
  (`failed to import`), so we deliberately do not.

Rollback: cp package.json.bak-<ts>-pre-pilot package.json
"""
from __future__ import annotations
import json
import pathlib
import shutil
import sys

PKG = pathlib.Path.home() / ".dsh/profiles/web/package.json"
PKG_TREE = pathlib.Path.home() / ".dsh/profiles/web/node_modules/dsh-pilot"

if not PKG_TREE.is_dir():
    sys.exit(f"refusing: {PKG_TREE} missing - copy the package tree first")
if not (PKG_TREE / "cordis.patch.yml").is_file():
    sys.exit("refusing: copied dsh-pilot has no cordis.patch.yml (bundle auto-discovery would no-op)")

raw = PKG.read_text(encoding="utf-8")
data = json.loads(raw)
bundles = data.setdefault("dsh", {}).setdefault("profile", {}).setdefault("bundles", [])

if "dsh-pilot" in bundles:
    sys.exit("dsh-pilot already in bundles - nothing to do")

bundles.append("dsh-pilot")
PKG.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"bundles now: {json.dumps(bundles, ensure_ascii=False, indent=2)}")
print(f"wrote {PKG} ({PKG.stat().st_size} B)")
