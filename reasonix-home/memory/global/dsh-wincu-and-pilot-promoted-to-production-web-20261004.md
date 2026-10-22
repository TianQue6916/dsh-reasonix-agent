---
id: mem-0ee06bbe8f0cf9cf1dfeff88361fd0a0
revision: 1
created_at: "2026-10-04T11:33:12.819Z"
updated_at: "2026-10-04T11:33:12.819Z"
name: dsh-wincu-and-pilot-promoted-to-production-web-20261004
description: "C/B 两条能力推生产 web profile 的精确步骤、为何用复制而非 npm、可复现判据与回滚路径"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 结论（2026-10-04 19:3x）

用户批准的三件事里，**两件已推生产（配置层已验证，运行层待新会话确认）**，第三件**判定不必做**。

### ① 改用户级 TEMP —— **不必做**
重启后 `D:\Temp` 与 `D:\` 根均恢复可写（`WRITE[D:\Temp]=True`，`node os.tmpdir()` = `D:\Temp` 且 `mkdtemp` 通过）⇒ 原先的总根因在当前状态不成立。

### ② computer-use 推生产 —— 已完成配置层
- 脚本：`~/.dsh/storages/tools/promote-wincu-to-web.py`（可重复执行，带「已存在则退出」保护）
- 向 `~/.dsh/profiles/web/cordis.patch.yml` 追加 `- insert:` 块，row id `mcp-dsh-computer-use-win`，`name: '@deepseek-ai/dsh-mcp-client'`，
  `serverName: wincu`、`transport: stdio`、`command: !!js process.execPath`、
  `args: [!!js "process.getBuiltinModule('node:module').createRequire(new URL('package.json', baseUrl)).resolve('dsh-computer-use-win/mcp/server.mjs')"]`、
  `toolCallTimeoutMs: 60000`、`failOnStartupError: false`、`env: {TEMP, TMP: C:\Users\27063\AppData\Local\Temp}`
- 包目录从 `~/.dsh-lab/profiles/cu-lab/node_modules/dsh-computer-use-win`（v0.2.2，含内存版 `Add-Type` patch）**直接复制**到 `~/.dsh/profiles/web/node_modules/`

### ③ browser-use（dsh-pilot）推生产 —— 已完成配置层
- 脚本：`~/.dsh/storages/tools/enable-pilot-in-web.py`
- 把 `dsh-pilot` 追加进 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles`
- 包目录从 `~/.dsh-lab/profiles/browser-lab/node_modules/dsh-pilot`（v0.7.2，**`--no-sandbox` patch 在 `lib/index.js:244`**）复制到 `~/.dsh/profiles/web/node_modules/`
- 生产 web 自带 `webserver` row（`@deepseek-ai/dsh-host-webserver`）⇒ pilot 的 `inject: ["webServer","tools"]` 可满足

## 关键工程约束（重要）

**两个包都未写进 `dependencies`**，理由：
1. pilot 的既有声明是 `git+https://github.com/guo6x/dsh-pilot.git`，而本机 **CLI 不读 WinINET system proxy**（只有浏览器经 DevSidecar 能到 GitHub）⇒ `git ls-remote` 必失败；写进 dependencies 会让未来每次 `npm install` 都失败。
2. 该 profile 有 npm 侧翻车史（npm 上的 `dsh-web-app` 是过期版 ⇒ `installation rejected`）。
⇒ **未来任何 `npm install` / `npm prune` 都会删掉这两个目录，需重跑上面的复制步骤**。

## 验证判据

**配置层（已过，零副作用）**：`dsh --profile web --dump-config` → **exit=0 / stderr 0 字节 / 2247 行**；
含 `- id: mcp-dsh-computer-use-win`；pilot 由 bundle auto-discovery 自动加载（`# == dsh-pilot` + `- id: pilot`），**不要手插 pilot row**（手插会 `failed to import`）。

**运行层 A（已过，不需重启）**：`node ~/.dsh/storages/tools/probe-wincu-readonly.mjs "C:/Users/27063/.dsh/profiles/web/node_modules/dsh-computer-use-win/mcp/server.mjs"`
⇒ `list_windows` 真的读到桌面（`CabinetWClass`「工具箱 - 文件资源管理器」、Chrome `browser.xhtml`、UIA patterns 齐全）。

**运行层 B（待新会话）**：computer-use row 在 profile patch 里 ⇒ 参与 `patchReload: live`，**开新会话即生效**（应见 `mcp__wincu__*`）；
pilot 在 `package.json` 的 bundles 里 ⇒ **可能需要重启**（应见 17 个 `pilot_*`）。

**回滚**：`~/.dsh/profiles/web/` 下有 `cordis.patch.yml.bak-20261004-193121-pre-wincu`、`package.json.bak-*-pre-wincu`、
`package.json.bak-*-pre-pilot`、`cordis.patch.yml.bak-*-pre-pilot`。

## 已知残留风险

复制过去的 `scripts/windows-uia.ps1` 在 **line 852 / 1060** 仍有 `[System.Reflection.Assembly]::LoadFrom($dll)`
（只改了 `Load-Assemblies` 那处）⇒ 若某分支踩到 `0x80131515`，需同样改为内存版 `Add-Type -TypeDefinition`。
B3 E2E 已跑通说明不在该路径上（疑为 OCR 分支）。
