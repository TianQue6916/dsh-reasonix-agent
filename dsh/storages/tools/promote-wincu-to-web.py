#!/usr/bin/env python3
"""Append the Windows computer-use MCP row to the PRODUCTION web profile patch.

Promoted from ~/.dsh-lab/profiles/cu-lab on 2026-10-04 after the lab E2E pass
(B3PROBE window: list_windows -> snapshot -> set_value -> invoke all ok:true,
independent evidence C:\\...\\b3-out.txt == "B3-PROBE-OK").

Design notes kept identical to the lab row on purpose:
  * `baseUrl` inside a `!!js` expression is the PROFILE directory, so the server
    path is resolved as a package specifier through createRequire anchored at the
    profile's own package.json -> no hard-coded paths, survives $DSH_HOME moves.
  * `command: !!js process.execPath` reuses the exact node that runs DSH.
  * `env.TEMP/TMP`: defence in depth. On 2026-10-04 the user-level TEMP pointed at
    an unwritable D:\\Temp and every UIA call answered "Backend process exited"
    because Add-Type needs a writable TEMP for its csc scratch files. The root
    cause is gone after the reboot (D:\\Temp is writable again, verified), but
    pinning TEMP to a known-writable dir keeps the MCP immune to a recurrence.
  * `failOnStartupError: false`: a broken backend must not block host startup.
"""
from __future__ import annotations
import datetime
import pathlib
import shutil
import sys

PATCH = pathlib.Path.home() / ".dsh/profiles/web/cordis.patch.yml"
TEMP_VALUE = r"C:\Users\27063\AppData\Local\Temp"
MARKER = b"mcp-dsh-computer-use-win"

raw = PATCH.read_bytes()
if MARKER in raw:
    sys.exit("row already present in production patch - nothing to do")

if not raw.endswith(b"\n"):
    raw += b"\n"

BLOCK = f"""
# ── Windows computer-use MCP（2026-10-04 由 cu-lab 推生产）─────────────────
# 端到端判据：cu-lab 里 B3PROBE 窗口走通 list_windows → snapshot → set_value → invoke
# 全部 ok:true，且独立判据文件内容为 B3-PROBE-OK。
# 路径解析：`!!js` 里的 `baseUrl` = **profile 目录**（不是 patch 文件所在目录），
# 因此用 createRequire 锚在 profile 的 package.json 上按包名解析；不写死路径，
# 换 $DSH_HOME 也能用。`process.execPath` = 正在跑 DSH 的那个 node。
# TEMP/TMP：纵深防御。2026-10-04 那次故障里用户级 TEMP 指向不可写的 D:\\Temp，
# Add-Type 的 csc scratch 需要可写 TEMP ⇒ 后端每次报 "Backend process exited"。
# 重启后 D:\\Temp 已恢复可写（实测），这里固定到已知可写目录以防复发。
# 回滚：删掉本块，或 cp cordis.patch.yml.bak-<ts>-pre-wincu cordis.patch.yml
- insert:
    - id: mcp-dsh-computer-use-win
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: wincu
        transport: stdio
        command: !!js process.execPath
        args:
          - !!js "process.getBuiltinModule('node:module').createRequire(new URL('package.json', baseUrl)).resolve('dsh-computer-use-win/mcp/server.mjs')"
        toolCallTimeoutMs: 60000
        failOnStartupError: false
        env:
          TEMP: '{TEMP_VALUE}'
          TMP: '{TEMP_VALUE}'
"""

PATCH.write_bytes(raw + BLOCK.encode("utf-8"))
print(f"appended {len(BLOCK)} chars -> {PATCH} ({PATCH.stat().st_size} B)")
print(f"row marker present: {MARKER in PATCH.read_bytes()}")
