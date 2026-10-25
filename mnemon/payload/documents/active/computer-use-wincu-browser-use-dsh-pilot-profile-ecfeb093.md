---
id: "ecfeb093-e4f9-4f86-9bfa-8276d30dba77"
title: "computer-use（wincu）与 browser-use（dsh-pilot）推入生产 profile web：执行手法、验收判据与陷阱（2026-10-04）"
description: "2026-10-04 实测交接：把 lab 验证过的 dsh-computer-use-win v0.2.2 与 dsh-pilot v0.7.2 落到生产 ~/.dsh/profiles/web。含 profile-relative createRequire 解析法、复制而非 npm install 的取舍（未声明 dependencies ⇒ 未来 npm install 会删目录）、pilot 走 bundle auto-discovery、配置层 dump-config 与运行层只读探针两道判据、待新会话验证项与残留隐患。"
status: "active"
created_at: "2026-10-04T11:36:11.518Z"
updated_at: "2026-10-04T11:36:11.518Z"
content_hash: "a783cc730e95cc0a6e65339e88c6c9e471c4ab3c583689464c95827578c91495"
source_paths:
  - "profiles/web/cordis.patch.yml"
  - "profiles/web/package.json"
  - "profiles/cu-lab/cordis.patch.yml"
  - "profiles/browser-lab/package.json"
  - "storages/tools/promote-wincu-to-web.py"
  - "storages/tools/enable-pilot-in-web.py"
  - "storages/tools/probe-wincu-readonly.mjs"
  - "PLAN.md"
session_ids:
  - "77649028-f1a0-4db0-b47e-66cf91c36adb"
memory_body_ids:
  []
---

# computer-use / browser-use 推生产（profile web）：执行手法与验收判据

日期：2026-10-04。环境：Windows，用户 `天阙九泉\27063`，非管理员。全部结论基于本机实机操作与变量回读。

**目标**：把已在隔离 lab 端到端验证过的两条能力从 lab 推进生产 profile `~/.dsh/profiles/web`：
- computer-use：`dsh-computer-use-win` v0.2.2（MCP server，PowerShell UIA 后端，暴露为 MCP serverName `wincu`）
- browser-use：`dsh-pilot` v0.7.2（含 `--no-sandbox` patch @ `lib/index.js:244`）

**范围说明**：用户当时批准三件事，实际推进两件；第三件「改用户级 TEMP」经实测**判定不必要** —— 重启后 `D:/Temp` 已恢复可写（`WRITE[D:/Temp]=True`，`node os.tmpdir()` + `mkdtemp` 通过），原总根因在当轮状态已不成立。

## 1. 落地的三个可回滚脚本（均在 `~/.dsh/storages/tools/`）

| 脚本 | 作用 |
|---|---|
| `promote-wincu-to-web.py` | 向生产 `profiles/web/cordis.patch.yml` 追加 `mcp-dsh-computer-use-win` row（1141 字符，patch 69475 B） |
| `enable-pilot-in-web.py` | 把 `dsh-pilot` 加入生产 `profiles/web/package.json` 的 `dsh.profile.bundles` |
| `probe-wincu-readonly.mjs` | 只读能力探针：只用 READ_ONLY 工具（health / list_windows / snapshot / find / element_info / accessibility_tree / ocr），**绝不调用输入类工具** |

两个脚本都先做 `.bak-<timestamp>-pre-wincu` 备份再改写，可逆。

## 2. 关键手法：MCP row 用 profile-relative 包解析，不写绝对路径

lab（`profiles/cu-lab/cordis.patch.yml`）里那行 `args` 是本轮最有复用价值的模板：

```yaml
- id: mcp-dsh-computer-use-win
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: wincu
    transport: stdio
    command: !!js process.execPath
    args:
      - !!js >-
        process.getBuiltinModule('node:module').createRequire(new
        URL('package.json',
        baseUrl)).resolve('dsh-computer-use-win/mcp/server.mjs')
    toolCallTimeoutMs: 60000
    failOnStartupError: false
    env:
      TEMP: C:\Users\27063\AppData\Local\Temp
      TMP: C:\Users\27063\AppData\Local\Temp
```

要点：`baseUrl` 就是**当前 profile 目录**，`createRequire` 锚在 profile 的 `package.json` 上 ⇒ 只要把包目录放进 `profiles/web/node_modules/`，路径就自动解析正确，**不必硬编码绝对路径**。`command: !!js process.execPath` 同理，跟随当前 node。

坑：`!!js` 里写正则/字符串时容易被 shell 二次转义搞坏（本轮出现过 `Expected ',', got 'string literal'` 的 SyntaxError）⇒ 用脚本文件写配置、别用 heredoc 内联拼 js。

## 3. 工程取舍：直接复制包目录，而不是 `npm install`，也不写进 `dependencies`

**做法**：把两个包目录从 lab 原样复制到 `profiles/web/node_modules/`（`dsh-computer-use-win` 336K / `dsh-pilot` 290K；ps1 里的内存版 `Add-Type` patch 与 pilot 的 `--no-sandbox` patch 都随复制过去了，复制后已回读确认）。

**理由**（两条都会让 `npm install` 路线直接失败）：
1. `dsh-pilot` 的声明来源是 `git+https://github.com/guo6x/dsh-pilot.git`，而本机 **CLI 不读 WinINET system proxy**（只有浏览器经 DevSidecar 能到 GitHub）⇒ `git ls-remote` 必失败。写进 `dependencies` 只会让未来**每次** `npm install` 都失败，反而更糟。
2. 该 profile 有 npm 侧翻车史（npm 上的 `dsh-web-app` 是过期版 ⇒ `installation rejected`）。

**代价（重要，未来必须记得）**：这两个包**未在 `dependencies` 声明**，所以将来若在本 profile 跑 `npm install`，会**删掉这两个目录**，需重跑复制步骤。

其它相关布局事实：`~/.dsh/profiles/node_modules` 是真实目录、没有 npm workspace 根；`profiles/node_modules/@deepseek-ai/dsh-token-meter` 是**指向全局 npm 包的 Junction**，三端共用一份。

## 4. pilot 的挂载方式：只进 bundles，不手插 row

`dsh-pilot` 声明 `inject: ["webServer","tools"]`。生产 web 配置里**已有** `- id: webserver`（`@deepseek-ai/dsh-host-webserver`，`inject: [webStartup]`，`port: ctx.webStartup.port ?? 3080`）⇒ inject 可满足，无需额外补 host-webserver（lab 侧曾被 `cordis.patch.yml` 注释指出 headless 栈缺它）。

因此只需把 `dsh-pilot` 加进 `profiles/web/package.json` 的 `dsh.profile.bundles`，**由 bundle auto-discovery 自动加载**：dump-config 中自动出现 `# == dsh-pilot` 与 `- id: pilot`，不需要手插 row。加完后 bundles 共 12 项（base / web-app / goat-panel / local-search / headroom / mnemon / dshmarket / replay / wechat-bridge / thinking-language / thinking-guard / **dsh-pilot**）。

## 5. 两道验收判据（本轮均已通过）

**判据 A — 配置层（零副作用）**：`dsh --profile web --dump-config`
- 结果：**exit=0，stderr 0 字节**，2244 行（加 pilot 后 2247 行，+3 = pilot row）
- 合成结果含 `- id: mcp-dsh-computer-use-win`（serverName `wincu`、`transport: stdio`、TEMP/TMP 正确）与 `- id: pilot`
- 手段价值：`--dump-config` 不启动服务、零副作用，是改 profile 后的首选验证

**判据 B — 运行层（不需重启，只读）**：用 `probe-wincu-readonly.mjs` 按**生产副本路径**启动 `profiles/web/node_modules/dsh-computer-use-win/mcp/server.mjs`
- 结果：`list_windows` **真的读到桌面** —— 认出了「工具箱 - 文件资源管理器」`CabinetWClass`、Chrome `chrome://browser/content/browser.xhtml`、以及 UIA patterns（Invoke / Value / ScrollItem）齐全
- 意义：`failOnStartupError: false` 会**静默降级**，不主动探测就不知道后端是否挂掉；此判据证明 PowerShell UIA 后端在生产副本上确实能起

## 6. 待验证（需新会话 / 可能需重启）与已知残留隐患

- 新会话应出现 `mcp__wincu__*`：它在 profile patch 里，参与 `patchReload: live`，**开新会话即生效**。
- 新会话应出现 `pilot_*`（17 个）：它在 `package.json` 的 bundles 里，**可能需要重启**才加载。
- **残留隐患（已知，未阻塞）**：`dsh-computer-use-win` 的 ps1 中 line 852 / 1060 仍有 `[void][System.Reflection.Assembly]::LoadFrom($dll)`（本轮只改了 `Load-Assemblies` 那一段）。lab E2E 已通过说明它不在 B3 路径上，但未彻底清掉。

## 7. 取证/工程坑（本轮踩了 5 次同一个）

**python 脚本里只要出现反斜杠就会炸**：heredoc 写 python 时 `C:\Users\...` 触发 `\U` escape、docstring 里的 `\\UXXXXXXXX` 字面量同样触发 → `SyntaxError: (unicode error) 'unicodeescape' codec can't decode ... truncated \UXXXXXXXX escape`。
**规避**：脚本内容**零反斜杠**，所有路径写正斜杠（`C:/Users/...`），中文直接写字面量而非 `\uXXXX`；且先确认目标脚本文件不存在再 create（失败残留会挡住后续 create）。

## 8. 顺带清理（可逆归档，非删除）

`profiles/node_modules/@deepseek-ai/_tm-prepatch`（33K，非法包名，在 `@deepseek-ai/` 命名空间下有被扫描隐患）与 `profiles/desktop/_bak-pre-fullport-20260930-133243`（11K）已归档到 `~/.dsh-lab/archive/20261004/`。归档后 `--dump-config` 依然干净（exit=0 / stderr 0 / 198 个顶层 row）。

## 9. 相关文档

- `7310d33d-3321-46c3-8416-9c61ec08941b` —— computer-use 调研结论与隔离 lab 落地状态。**注意其「生产 profile 零痕迹」描述已被本轮推翻**。
- `b01208b5-6216-4343-b97a-860fa3bfcfd5` —— dsh-pilot 与 computer-use lab 双线端到端打通、`D:\Temp` 不可写根因。
- `55267ea6-81b5-4f7f-8ed6-5ef7298db369` —— compaction 触发判据（heuristic 账本 vs contextPressure 真实 usage）取证。
