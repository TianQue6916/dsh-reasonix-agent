#!/usr/bin/env python3
# Byte-level insert of the objective-9 / objective-10 findings into PLAN.md.
# No backslashes in this file on purpose (see memory: python-windows-backslash-heredoc-trap).
import hashlib
import pathlib
import sys

P = pathlib.Path.home() / ".dsh/PLAN.md"
raw = P.read_bytes()
lines = raw.split(b"\n")
a = next((i for i, l in enumerate(lines) if l.strip() == "## 进行中".encode()), None)
if a is None:
    sys.exit("anchor not found")
if b"session-orphan-audit" in raw:
    sys.exit("entry already present")

BLOCK = """- [x] **★ objective ⑨ 面板 vs 磁盘 session 差额（2026-10-04 22:4x 定论）**
      工具：`python ~/.dsh/storages/tools/session-orphan-audit.py`
      数字：projcache（面板数据源 `storages/session_projcache/sessions/*.json`）**1665**；
      磁盘 session dir **1491**；**matched 1490**；**panel-only 175**（面板有记录、磁盘已无）；**disk-only 1**；
      另有 **570 个 dir 没有 `session.v4.jsonl.zstd`**（磁盘侧空壳）。
      ⇒ 差额真身是这两类，**不是**「面板多算了 569」。
      **我自己的 bug（已修，勿用旧数字）**：首版脚本在 projcache 侧保留 `session-` 前缀、磁盘侧切掉
      ⇒ 交集算成荒谬的 0。两边归一化到裸 `<uuid>` 后得 **1490**。旧数字 1644/1075/569 作废。
      projcache 记录结构 = `{version, record:{identity, rows}}`，**`rows` 才是数据本体**
      （`mnemonSubagentTokenUsage` 等都在 `rows` 下，不在 `record` 顶层）。
      **磁盘大头**：slug `--C-Windows-system32--` **1211** 个 dir（798 带 stream，共 **153.6 MB**）——
      dsh 在 `C:/Windows/system32` 目录被启动产生的；**属用户数据，本轮未擅自清理**。

- [x] **★ objective ⑩ reasoning-autofold 是否打进 asar（2026-10-04 22:4x 定论：没有）**
      工具（新增，均只读）：`node ~/.dsh/storages/tools/asar-list-grep.mjs <asar> <pat...>`（读目录表，不解包）、
      `node ~/.dsh/storages/tools/asar-read-entry.mjs <asar> <entryPath> [needle]`（读单个 entry 内容）。
      判据：asar 内**真实路径**是 `dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js`
      （565,053 B @ offset 19213654）⇒ `__dspDisclosure` **NOT FOUND**，原目标行
      `const { expanded, toggle } = useDisclosure();` **仍在**。
      对照：CLI 那份（`%APPDATA%/npm/node_modules/@deepseek-ai/dsh/node_modules/.../client.js`，565,455 B）
      `__dspDisclosure` **×3** ⇒ **CLI/web 侧已打，desktop 侧没打**。
      `_asar-work.asar`（121,348,951 B，与生产**逐字节同大小**，mtime 10-04 15:33）同样未打 ⇒ 只是副本，不是重建产物。
      **三条使「免重建」不可行的硬约束（重要，推翻 pending ⑯ 的等长路线）**：
      ① 补丁**非等长**：565,053 → 565,455（+402 B）⇒ 不能原地改；
      ② entry header 携带 **`integrity: {algorithm:'SHA256', hash:'a33cbb81…', blockSize:4194304, blocks:[…]}`**
         ⇒ 即使等长也会 hash 不匹配（Electron asar integrity）⇒ **等长 patch 路线本身不成立**；
      ③ `app.asar.unpacked/` **不能手动覆盖**：unpacked 语义由 header 的 `unpacked:true` 决定
         （全库 1497 个 entry 有此标记，`client.js` **没有**）⇒ 往 unpacked 目录放同名文件**不会被读**。
      ⇒ **唯一路径 = 重建整个 asar（12967 entries）**：重排 offset（4 字节对齐）+ 重算 integrity hash。
      **风险/收益**：要动 121 MB 的 desktop 主产物，出错即 desktop 打不开；收益仅「desktop 端思考链自动展开」。
      **故本轮只判定、不实施**；实施前必须先备份 `app.asar` 并备好回滚。
"""
block = [l.encode("utf-8") for l in BLOCK.split("\n")]
out = lines[: a + 1] + block + lines[a + 1 :]
new = b"\n".join(out)
P.write_bytes(new)
print("before %d B -> after %d B / %d lines / sha256 %s" % (len(raw), len(new), len(out), hashlib.sha256(new).hexdigest()[:16]))
