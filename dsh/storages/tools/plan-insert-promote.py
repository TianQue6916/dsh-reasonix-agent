#!/usr/bin/env python3
# Byte-level insert of the promote-to-production entry into PLAN.md.
#
# PLAN.md has mixed CRLF/LF line endings, so str_replace_editor's old_str can never
# match verbatim; this does a 1-based line insert after the heading.
#
# NOTE TO FUTURE ME: this file contains ZERO backslash characters, on purpose.
# Five separate attempts died with "truncated UXXXXXXXX escape" because a Windows
# path (C: backslash Users ...) or the literal name of that escape appeared inside a
# normal python string, including inside a docstring. Heredoc quoting does NOT help:
# the backslash reaches python intact and python then parses it. Use forward slashes
# (Windows accepts them everywhere Node/npm/PowerShell do) and write U+XXXXXXXX without
# the leading backslash when naming the escape.
import hashlib
import pathlib
import sys

P = pathlib.Path.home() / ".dsh/PLAN.md"
raw = P.read_bytes()
lines = raw.split(b"\n")
a = next((i for i, l in enumerate(lines) if l.strip() == "## 进行中".encode()), None)
if a is None:
    sys.exit("anchor not found")
if b"promote-wincu-to-web" in raw:
    sys.exit("entry already present")

BLOCK = """- [~] **★ 2026-10-04 19:3x computer-use 与 browser-use 推生产（配置层已验证，运行层待新会话）**
      用户批准的三件事里的两件；第三件（改用户级 TEMP）**已判定不必要** ——
      重启后 `D:/Temp` 已恢复可写（本轮实测 `WRITE[D:/Temp]=True`、`node os.tmpdir()`+`mkdtemp` 通过）。
      **做了什么**（三个可回滚脚本，均在 `~/.dsh/storages/tools/`）：
      ① `promote-wincu-to-web.py` —— 向生产 `profiles/web/cordis.patch.yml` 追加 `mcp-dsh-computer-use-win` row
         （`serverName: wincu`、`command: !!js process.execPath`、包名解析走 profile 的 `createRequire`、
         `failOnStartupError: false`、`env.TEMP/TMP = C:/Users/27063/AppData/Local/Temp`）。
      ② `enable-pilot-in-web.py` —— 把 `dsh-pilot` 加入生产 `profiles/web/package.json` 的 `dsh.profile.bundles`。
      ③ 两个包的目录从 lab **直接复制**到 `profiles/web/node_modules/`
         （`dsh-computer-use-win` v0.2.2 / 336K；`dsh-pilot` v0.7.2 / 290K，带 `--no-sandbox` patch @ `lib/index.js:244`）。
      **为什么用复制而不是 `npm install`**：① pilot 的 dependency 是 `git+https://github.com/guo6x/dsh-pilot.git`，
      而本机 **CLI 不读 WinINET system proxy**（只有浏览器走 DevSidecar 能到 GitHub）⇒ `git ls-remote` 必失败，
      写进 dependencies 只会让未来每次 `npm install` 都失败。② 该 profile 有 npm 侧翻车史
      （npm 上的 `dsh-web-app` 是过期版 ⇒ `installation rejected`）。
      ⇒ **两个包未在 `dependencies` 声明**，未来跑 `npm install` 会删掉它们，需重跑复制步骤（已写进 memory）。
      **配置层判据（已过）**：`dsh --profile web --dump-config` **exit=0 / stderr 0 字节**，2247 行；
      新 row 合成为 `- id: mcp-dsh-computer-use-win`；pilot 由 bundle auto-discovery 自动加载
      （`# == dsh-pilot` + `- id: pilot`），**不手插 row**。
      **运行层判据 A（已过，不需重启）**：用 `storages/tools/probe-wincu-readonly.mjs` 按**生产副本路径**启动
      `profiles/web/node_modules/dsh-computer-use-win/mcp/server.mjs` ⇒ `list_windows` **真读到桌面**
      （认得 `CabinetWClass`「工具箱 - 文件资源管理器」、Chrome `browser.xhtml`、UIA patterns 齐全）
      ⇒ PowerShell UIA 后端在生产副本上真的能起。
      **运行层判据 B（待新会话）**：
      - computer-use row 在 **profile patch** 里 ⇒ 参与 `patchReload: live`，**开新会话即可验**（应见 `mcp__wincu__*`）。
      - pilot 在 **`package.json` 的 bundles** 里（不是 profile patch）⇒ **可能需要重启**（应见 17 个 `pilot_*`）。
      **回滚**：`profiles/web/` 下已有 `cordis.patch.yml.bak-20261004-193121-pre-wincu`、
      `package.json.bak-*-pre-wincu`、`package.json.bak-*-pre-pilot`、`cordis.patch.yml.bak-*-pre-pilot`。
      **已知残留风险（不阻塞）**：复制过去的 `scripts/windows-uia.ps1` 在 **line 852 / 1060**
      仍有 `[System.Reflection.Assembly]::LoadFrom($dll)`（只改了 `Load-Assemblies` 那一处）；
      但 B3 E2E 已跑通 ⇒ 那两处不在 B3 路径上，疑在 OCR 分支，待适机确认。
"""
block = [l.encode("utf-8") for l in BLOCK.split("\n")]
out = lines[: a + 1] + block + lines[a + 1 :]
new = b"\n".join(out)
P.write_bytes(new)
print("before %d B -> after %d B / %d lines / sha256 %s" % (len(raw), len(new), len(out), hashlib.sha256(new).hexdigest()[:16]))
print("inserted after line", a + 1)
