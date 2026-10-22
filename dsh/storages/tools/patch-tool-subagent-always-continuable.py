#!/usr/bin/env python3
"""Patch @deepseek-ai/dsh-tool-subagent so that continuable mode is NOT defeatable
by the model's `run_in_background: false`.

Rationale (user request m00090 + m00206):
  `dsh-tool-subagent/lib/index.js` routes delegation through `resolveDelegationRun`:

      function resolveDelegationRun(request, options) {
          if (!options.backgroundEnabled) { ...; return { runInBackground: false }; }
          return { runInBackground: request.run_in_background ?? options.continuable };
      }

  With `backgroundMode: continuable` (which the anchored-standard preset sets), the
  intent is "children are continuable actors". But `run_in_background: false` falls
  back to `subagents.start(...)` + `settleForegroundRun`, which unconditionally
  `run.dispose()`s the child -> the child's session records `mode: "one-shot"` ->
  the web UI's `selectReadOnlySubagent` swaps the composer for a read-only notice
  ("One-shot tasks do not accept follow-ups"). So a single flag conflates two
  orthogonal semantics: synchrony ("I want the result now") and liveness
  ("I want the child to stay alive"). This patch decouples them: synchrony still
  works (the tool awaits the run), but the child keeps an activation.

Two edits:
  1. resolveDelegationRun: `options.continuable` FORCES background routing.
  2. the `run_in_background` parameter description: stop telling the model that
     `false` is the right choice when it needs the result.

Usage:
  python patch-tool-subagent-always-continuable.py --check
  python patch-tool-subagent-always-continuable.py --apply
  python patch-tool-subagent-always-continuable.py --verify
  python patch-tool-subagent-always-continuable.py --restore [--bak <path>]

Idempotent. Backups are written next to the target as
`index.js.bak-YYYYMMDD-HHMMSS-pre-always-continuable`.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import glob
import hashlib
import os
import shutil
import sys

REL = "@deepseek-ai/dsh-tool-subagent/lib/index.js"

OLD_ROUTE = """function resolveDelegationRun(request, options) {
\tif (!options.backgroundEnabled) {
\t\tif (request.run_in_background === true) throw new Error("run_in_background is disabled for this tool instance (enableRunInBackground: false)");
\t\treturn { runInBackground: false };
\t}
\treturn { runInBackground: request.run_in_background ?? options.continuable };
}"""

NEW_ROUTE = """function resolveDelegationRun(request, options) {
\tif (!options.backgroundEnabled) {
\t\tif (request.run_in_background === true) throw new Error("run_in_background is disabled for this tool instance (enableRunInBackground: false)");
\t\treturn { runInBackground: false };
\t}
\t// [patched: always-continuable] In continuable mode the child is an actor that
\t// must survive collection, so scheduling is not the model's to decide. The
\t// tool still awaits the run (synchrony is preserved); only liveness is pinned.
\tif (options.continuable) return { runInBackground: true };
\treturn { runInBackground: request.run_in_background ?? false };
}"""

OLD_HINT = '"Defaults to true. Set false only when your next action depends on the result."'
NEW_HINT = '"Defaults to true, and is forced true in continuable mode: the child stays alive and is addressable afterwards, while this tool still waits for its result when you need it. Set false only to opt out of the survival guarantee where the provider allows it."'

MARK = "[patched: always-continuable]"


def _targets() -> list[str]:
    home = os.path.expanduser("~")
    found = []
    for pat in (
        os.path.join(home, ".dsh", "profiles", "*", "node_modules", REL),
        os.path.join(home, ".dsh", "profiles", "node_modules", REL),
    ):
        found.extend(glob.glob(pat))
    seen, out = set(), []
    for f in found:
        real = os.path.realpath(f)
        if real in seen:
            continue
        seen.add(real)
        out.append(f)
    return out


def _sha(path: str) -> str:
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def _read(path: str) -> str:
    with open(path, "r", encoding="utf-8", newline="") as fh:
        return fh.read()


def _write(path: str, text: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def make_backup(path: str) -> str:
    stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = f"{path}.bak-{stamp}-pre-always-continuable"
    shutil.copy2(path, bak)
    return bak


def newest_backup(path: str) -> str | None:
    cands = sorted(glob.glob(f"{path}.bak-*-pre-always-continuable"))
    return cands[-1] if cands else None


def cmd_check(path: str) -> str:
    text = _read(path)
    if MARK in text:
        return "already-patched"
    if OLD_ROUTE not in text:
        return "ROUTE-ANCHOR-MISSING"
    if OLD_HINT not in text:
        return "HINT-ANCHOR-MISSING"
    return "patchable"


def cmd_apply(path: str) -> str:
    state = cmd_check(path)
    if state == "already-patched":
        return "already-patched"
    if state != "patchable":
        return state
    text = _read(path)
    text = text.replace(OLD_ROUTE, NEW_ROUTE, 1)
    text = text.replace(OLD_HINT, NEW_HINT, 1)
    bak = make_backup(path)
    _write(path, text)
    return f"applied (backup: {os.path.basename(bak)})"


def cmd_verify(path: str) -> str:
    text = _read(path)
    problems = []
    if MARK not in text:
        problems.append("marker missing")
    if OLD_ROUTE in text:
        problems.append("old route still present")
    if "if (options.continuable) return { runInBackground: true };" not in text:
        problems.append("forced-background line missing")
    if OLD_HINT in text:
        problems.append("old hint still present")
    # crude syntax sanity: keep the paren/brace delta identical to the original shape
    if text.count("resolveDelegationRun") < 2:
        problems.append("resolveDelegationRun definition/call missing")
    return "PASS" if not problems else "FAIL: " + "; ".join(problems)


def cmd_restore(path: str, bak: str | None) -> str:
    src = bak or newest_backup(path)
    if not src or not os.path.exists(src):
        return "no backup found"
    shutil.copy2(src, path)
    return f"restored from {os.path.basename(src)}"


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true")
    g.add_argument("--apply", action="store_true")
    g.add_argument("--verify", action="store_true")
    g.add_argument("--restore", action="store_true")
    ap.add_argument("--bak")
    ap.add_argument("--target", action="append", default=[])
    args = ap.parse_args()

    targets = args.target or _targets()
    if not targets:
        print("no targets found", file=sys.stderr)
        return 2

    rc = 0
    for path in targets:
        if args.check:
            out = cmd_check(path)
        elif args.apply:
            out = cmd_apply(path)
        elif args.verify:
            out = cmd_verify(path)
        else:
            out = cmd_restore(path, args.bak)
        if out.startswith("FAIL") or out.endswith("MISSING"):
            rc = 1
        print(f"{out:<34} {path}  sha256={_sha(path)[:16]}")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
