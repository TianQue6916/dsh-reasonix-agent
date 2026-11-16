#!/usr/bin/env python3
"""Copy this plugin into every dsh profile's node_modules.

The profiles hold COPIES, not links: creating a junction/symlink from the dsh
shell fails with WinError 5 / 1314 (Low IL cannot create reparse points inside
the profile tree), and `pnpm add file:` inside the desktop profile is refused
because the Electron application owns it.  So the source of truth lives here in
D:/Toolbox and this script pushes it into each profile.

Run after editing lib/index.js or cordis.patch.yml.  Restart nothing: the tool
plugin's .mjs/-free JS is imported once per dsh process, so a NEW SESSION is the
verification step (the profile package.json already carries the dependency and
the `dsh.profile.bundles` entry).

Usage: python D:/Toolbox/dsh-plugin-fetch-file/sync.py [--check]
"""
import argparse
import filecmp
import os
import shutil
import sys

SRC = os.path.dirname(os.path.abspath(__file__))
ITEMS = ("lib", "package.json", "cordis.patch.yml")
PROFILES = ("desktop", "web", "headless")
HOME = os.path.expanduser("~")


def dst_for(profile: str) -> str:
    return os.path.join(HOME, ".dsh", "profiles", profile, "node_modules", "@local", "dsh-plugin-fetch-file")


def same(a: str, b: str) -> bool:
    if os.path.isdir(a):
        if not os.path.isdir(b):
            return False
        names = set(os.listdir(a))
        # BUG (fixed 2026-11-12): comparing only the source's entries reported an
        # EMPTY source directory as identical to a populated copy, so `sync.py`
        # happily said "up to date" after the source had been wiped.
        if names != set(os.listdir(b)):
            return False
        return all(same(os.path.join(a, n), os.path.join(b, n)) for n in names)
    return os.path.isfile(b) and filecmp.cmp(a, b, shallow=False)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift, change nothing")
    args = ap.parse_args()
    drift = 0
    for p in PROFILES:
        dst = dst_for(p)
        if not os.path.isdir(os.path.dirname(dst)):
            print(f"{p}: skipped (profile has no node_modules/@local)")
            continue
        stale = [i for i in ITEMS if not same(os.path.join(SRC, i), os.path.join(dst, i))]
        if not stale:
            print(f"{p}: up to date")
            continue
        drift += 1
        if args.check:
            print(f"{p}: DRIFT in {', '.join(stale)}")
            continue
        os.makedirs(dst, exist_ok=True)
        for i in stale:
            s, d = os.path.join(SRC, i), os.path.join(dst, i)
            shutil.rmtree(d, ignore_errors=True) if os.path.isdir(s) else (os.path.isfile(d) and os.remove(d))
            shutil.copytree(s, d) if os.path.isdir(s) else shutil.copy2(s, d)
        print(f"{p}: synced {', '.join(stale)}")
    return 1 if drift else 0


if __name__ == "__main__":
    sys.exit(main())
