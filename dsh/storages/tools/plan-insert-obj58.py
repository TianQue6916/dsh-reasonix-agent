#!/usr/bin/env python3
# Byte-level insert of the objective 8 re-verification and objective 5 Windows-side reproduction.
# No backslashes in this file on purpose (see memory: python-windows-backslash-heredoc-trap).
import hashlib, pathlib, sys

P = pathlib.Path.home() / ".dsh/PLAN.md"
raw = P.read_bytes()
lines = raw.split(b"\n")
a = next((i for i, l in enumerate(lines) if l.strip() == "## 进行中".encode()), None)
if a is None:
    sys.exit("anchor not found")
if b"desktop-model-audit" in raw:
    sys.exit("entry already present")

BLOCK = """- [x] **★ objective ⑧ 复核（2026-10-04 23:2x，亲手复现）：死 model 清理 PASS；`reasoningEfforts` 是刻意未动**
      工具：`python ~/.dsh/storages/tools/desktop-model-audit.py`
      输出（可复现）：`allowlist: 62 allowed ids`；
      **`web models=61 not-in-allowlist=0 duplicates=0`**、**`desktop models=61 not-in-allowlist=0 duplicates=0`**；
      `web-only: (none)`、`desktop-only: (none)` ⇒ **VERDICT: PASS — desktop 集合 == web 集合且两者都没有死 id**。
      ⇒ 先前 11:05 的清理结论**成立**（改前 desktop 82 个、其中 21 个不在 `D:/Toolbox/goat-gateway/model-allowlist.json`；
      删 21 + 补 `stealth/pixel-canary` + 移走 `claude-sonnet-5-5` ⇒ 61 个）。
      **但 objective ⑧ 只算「半完成」**：`reasoningEfforts` **刻意没动**，理由在 PLAN.md 旧条目里已写明且成立——
      两侧 60 个共有 model 的 `reasoningEfforts` 文本 **0 个相同**（web 走 `rewrite-model-list.py` 的实测 verdict，
      desktop 更像手工旧版），而「`zai-org/GLM-5.3` / `MiniMaxAI/MiniMax-M3` 实测 5 档都能出 thinking」与 web 标 `false` 矛盾
      ⇒ **哪侧正确未定论**，改了会改 UI 行为且无法自证 ⇒ 保守不动是对的。
      要真正收掉这半边，需要一次「逐 model 跑 5 档 reasoningEfforts 看有没有 thinking」的实测矩阵。

- [x] **★ objective ⑤ 复核（2026-10-04 23:2x）：Windows 侧亲手跑通**
      工具：`python ~/.dsh/storages/tools/usage-overview.py`（顺手修掉了 `utcfromtimestamp` 的 DeprecationWarning）
      输出（可复现）：`machine: 天阙九泉 / dsh home: C:/Users/27063/.dsh`；
      `dsh: 1666 session json, 0 unreadable`；`reasonix: %APPDATA%/reasonix/stats (25 files, 6119 lines, 824 lines without CNY cost)`。
      主力 `commandcode-goat / deepseek/deepseek-v4.1-flash` = **1,479 sessions / cacheRead 2,568,429,854 /
      uncached 94,936,379 / output 48,122,169 / ¥342.0122 / source=priced**；
      **TOTAL = 2,793,819,628 tokens / ¥372.9798**。
      **交叉验证**：`source=priced` 说明 objective ⑥ 的 overlay 价目**真的在参与计费**
      （若 overlay 未生效，这一行会显示 `NOPRICE` 且金额为 0，正如其余 20 余个未列价的 model）。
      **仍未并进视图的**：Linux 侧的两个 agent（dsh / reasonix）⇒ 同 objective ④ 的可达性约束。
"""
block = [l.encode("utf-8") for l in BLOCK.split("\n")]
out = lines[: a + 1] + block + lines[a + 1 :]
new = b"\n".join(out)
P.write_bytes(new)
print("before %d B -> after %d B / %d lines / sha256 %s" % (len(raw), len(new), len(out), hashlib.sha256(new).hexdigest()[:16]))
