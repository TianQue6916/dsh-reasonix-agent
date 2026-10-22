#!/usr/bin/env python3
# Byte-level insert of objectives 4 / 5 status (blocked + prep done) into PLAN.md.
# No backslashes in this file on purpose (see memory: python-windows-backslash-heredoc-trap).
import hashlib, pathlib, sys

P = pathlib.Path.home() / ".dsh/PLAN.md"
raw = P.read_bytes()
lines = raw.split(b"\n")
a = next((i for i, l in enumerate(lines) if l.strip() == "## 进行中".encode()), None)
if a is None:
    sys.exit("anchor not found")
if b"linux-gateway-patch.sh" in raw:
    sys.exit("entry already present")

BLOCK = """- [ ] **★ objective ④ Linux gateway 补齐 reasoning-filter / finish-log —— 阻塞：`tianque` offline（已把执行路径备足）**
      **阻塞判据（可复现）**：`tailscale status` ⇒
      `100.79.96.82 tianque TianQue6916@ linux active; relay "nue"; offline, last seen 1d ago, tx 12168 rx 0`；
      `ssh -o BatchMode=yes -o ConnectTimeout=5 tianque` ⇒ `connect to host 100.79.96.82 port 22: Connection timed out`。
      **物理原因（关键）**：`100.84.67.49 node windows` 与 `100.79.96.82 tianque linux` **两个 tailscale 节点同属
      `TianQue6916@`** ⇒ **同一台机器的双系统**，当前跑着 Windows ⇒ Linux 侧不可达，
      **在 Windows 会话内无论如何都完不成**。
      **已做足的准备（切到 Linux 后一条命令即可）**：
      ① `patch-gateway-reasoning-filter.py` **新增 `--helper-anchor` / `--call-anchor`**（本轮改动 8 处、
         `py_compile OK`、**默认值不变 ⇒ Windows 行为逐字不变**，回归 `--check` 仍全绿且新增打印锚点原文）。
         原因：Linux 版 gateway.mjs 是另一个 **1642 行 build、没有 bodylog 补丁** ⇒
         默认 call 锚点 `'  // bodylog-end'` 在那边 **count=0** ⇒ 原脚本会直接 `SystemExit`（锚点不唯一/缺失）。
      ② 新增 `~/.dsh/storages/tools/linux-gateway-patch.sh`（`bash -n` 通过，并已在 **Windows 文件上 dry-run 全流程**）：
         先量锚点 → 缺 call 锚点时**打印 `parsed` 候选行** → 跑两个 `--check` → `--apply` 后 `node --check`
         → 提示 `systemctl --user restart goat-gateway`。
      ③ **Windows 侧四个补丁全部在位（对照基线）**：`reasoning-filter`×4 / `filterReasoning`×2 / `finish=`×1 /
         `HB elu`×1 / `BODYLOG`×1；`--check` 报「已打补丁=True、helper/call 锚点各 1、`node --check` OK、
         `logs/.reasoning-filter.json` 存在（启用）」。
      **切系统后的执行步骤**：
      `bash ~/.dsh/storages/tools/linux-gateway-patch.sh`（只诊断）→
      若 call 锚点缺失，按提示 `--apply --call-anchor '<候选行>'` → `systemctl --user restart goat-gateway`
      → `curl -sS localhost:8788/health`。

- [ ] **★ objective ⑤ 双机四 agent 用量总视图 —— Windows 侧已完成，Linux 侧同 ④ 阻塞**
      Windows 侧：`usage-overview.py`（PLAN.md 记于 2026-10-04 11:15）。
      数据源（口径 A = {Windows, Linux} × {dsh, reasonix}）：
      dsh = `storages/session_projcache/sessions/*.json` 的 `rows.tokenUsage.val.totals`
      （**无 cost 字段** ⇒ 价按 objective ⑥ 的 `dsh-context-price-overlay.json` 算）；
      reasonix = `%APPDATA%/reasonix/stats/*.jsonl`（**每行自带 CNY，直接用**）。
      阻塞：Linux 侧两个 agent 的数据要并进同一视图 ⇒ 需 Linux 可达（同上，物理不可达）。
"""
block = [l.encode("utf-8") for l in BLOCK.split("\n")]
out = lines[: a + 1] + block + lines[a + 1 :]
new = b"\n".join(out)
P.write_bytes(new)
print("before %d B -> after %d B / %d lines / sha256 %s" % (len(raw), len(new), len(out), hashlib.sha256(new).hexdigest()[:16]))
