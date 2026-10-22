#!/usr/bin/env python3
# Objective 8 (second half): how far apart are web's and desktop's reasoningEfforts maps?
# Both live under the commandcode-goat provider block of their cordis.patch.yml.
# Normalises "reasoningEfforts: false" vs a dict of levels into a comparable form.
# No backslashes in this file on purpose.
import pathlib
import re

HOME = pathlib.Path.home()
PATHS = {
    "web": HOME / ".dsh/profiles/web/cordis.patch.yml",
    "desktop": HOME / ".dsh/profiles/desktop/cordis.patch.yml",
}

def parse_models(path):
    lines = path.read_text(encoding="utf-8").split("\n")
    start = None
    for i, ln in enumerate(lines):
        if ln == "      commandcode-goat:":
            start = i
            break
    if start is None:
        return None
    models = {}
    cur = None
    i = start + 1
    while i < len(lines):
        ln = lines[i]
        if re.match(r"^      \S", ln) and not ln.strip().startswith("-"):
            break
        m = re.match(r"^          - id:\s*(\S+)\s*$", ln)
        if m:
            cur = m.group(1)
            models[cur] = {"efforts": "false", "window": None}
        elif cur:
            m2 = re.match(r"^            reasoningEfforts:\s*(.*)$", ln)
            if m2:
                rest = m2.group(1).strip()
                if rest in ("false", "true"):
                    models[cur]["efforts"] = rest
                else:
                    levels = []
                    j = i + 1
                    while j < len(lines) and re.match(r"^              \S", lines[j]):
                        levels.append(lines[j].strip().split(":")[0].strip("'\""))
                        j += 1
                    models[cur]["efforts"] = "levels:" + ",".join(sorted(levels))
        i += 1
    return models

a = parse_models(PATHS["web"])
b = parse_models(PATHS["desktop"])
print("web models=%d desktop models=%d" % (len(a), len(b)))
print("")
common = sorted(set(a) & set(b))
same = [m for m in common if a[m]["efforts"] == b[m]["efforts"]]
diff = [m for m in common if a[m]["efforts"] != b[m]["efforts"]]
print("common models          : %d" % len(common))
print("identical efforts      : %d" % len(same))
print("DIFFERENT efforts      : %d" % len(diff))
print("")
print("=== the differing ones (web vs desktop) ===")
for m in diff:
    print("  %-42s web=%-28s desktop=%s" % (m, a[m]["efforts"], b[m]["efforts"]))
print("")
import collections
kinds = collections.Counter((a[m]["efforts"].split(":")[0], b[m]["efforts"].split(":")[0]) for m in diff)
print("difference classes (web_kind, desktop_kind): %s" % dict(kinds))
