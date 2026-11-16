import pathlib
CJS = r"D:\Toolbox\goat-gateway\dsh-plugin-goat-panel\lib\client.js"
with open(CJS, "r", encoding="utf-8", newline="") as f:
    raw = f.read()
old = """ + fmtReset(r.weeklyReset)
"""
print("occurrences of anchor:", raw.count(old))
new = """ + fmtReset(r.weeklyReset)
                    + (r.monthReset ? " · 月 " + fmtReset(r.monthReset) : "")
"""
assert raw.count(old) == 1, "anchor not unique"
raw = raw.replace(old, new)
with open(CJS, "w", encoding="utf-8", newline="") as f:
    f.write(raw)
print("OK patched", CJS)
