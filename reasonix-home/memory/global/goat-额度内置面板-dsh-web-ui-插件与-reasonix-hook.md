---
id: mem-c0106bfbf2da3c11913f6d023b973d59
revision: 1
created_at: "2026-09-24T16:51:00.7658113Z"
updated_at: "2026-09-24T16:51:00.7658113Z"
name: goat-额度内置面板-dsh-web-ui-插件与-reasonix-hook
description: 把 GOAT 额度做成 dsh web 内置面板（UI 插件 + 局部 HTTP 端点），并给 Reasonix 配 hook + MCP；含 dsh 插件安装三坑与无头验证法
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 目标
用户要“内置面板”（不是问 agent）→ 给 dsh web 做了真 UI 面板，Reasonix 侧用 hook + MCP。

## 1. 数据源（两边共用）
- `D:\Toolbox\goat-gateway\quota-http.mjs` → `GET http://127.0.0.1:8790/quota`（CORS `*`，30s 缓存，内部走 `goat-usage.ps1 -Json -CacheFile <独立缓存>`，失败时 `-Force` 重试）
- 常驻：计划任务 **`GoatQuotaHttp`**（AtLogOn / Interactive / Hidden，动作 = wscript + `start-quota-http.vbs`）
- 自检：`Invoke-RestMethod http://127.0.0.1:8790/quota`

## 2. dsh web 额度面板（已截图验证）
- 插件包：`D:\Toolbox\goat-gateway\dsh-plugin-goat-panel\`
  - `package.json`：必须同时声明 **`dsh.bundle.patch`**（→ `./cordis.patch.yml`）与 **`dsh.client.platform: web`**（缺 bundle 会报 “declares no dsh.bundle”）
  - `cordis.patch.yml`：`- insert: [{ id: goat-quota-panel, name: '@local/dsh-plugin-goat-panel' }]`
  - `lib/client.js`：`window.__ModuleLoader__.load({ id, factory })`，React 组件 fetch 8790 端点，60s 刷新；**挂到两个 slot**：`sidebar.footer.action`（全局常驻）+ `conversation.input.dock`（会话内）
  - `lib/index.js`：host 侧空 `apply`
- 安装要点（踩坑）：
  1. `dsh plugin --profile web add file:<path>` 是 **拷贝** 而非软链 → **改源后必须手动 Copy-Item 同步到 `web\node_modules\@local\dsh-plugin-goat-panel\`**，否则 dsh 读到旧版
  2. 还要把包名加入 **web profile 的 `package.json` → `dsh.profile.bundles`**，否则它只是个普通依赖，不参与 profile 树
  3. 验证：`dsh --profile web --dump-config`（正常 ~552 行，含 `goat-quota-panel`）
- dsh 可用 slot（43 个）：全局的有 `main` / `rightbar` / `sidebar` / `sidebar.footer.action` / `sidebar.brand.*` / `settings.*`；会话内 `conversation.input.dock`、`conversation.session.header.actions`、`conversation.composer.dock` 等

## 3. Reasonix 侧
- **MCP 工具**（已实测 agent 可调）：`reasonix mcp add goat-quota -- node <path>\mcp-goat-quota.mjs`
- **hook（额度注入会话上下文）**：配置文件是 **`%APPDATA%\reasonix\settings.json`**（先前探测报 malformed 是因为结构错，正确形状就是 `{"hooks":{"SessionStart":[{"command":"...","timeout":15}]}}`）
  - `reasonix hook status --json` → `status=ok`；`hook list` → `status=active`
  - hook 命令用 **node 免 shell**：`C:\PROGRA~1\nodejs\node.exe D:\Toolbox\goat-gateway\goat-quota-hook.mjs`（短路径避空格；脚本直接读 `%TEMP%\goat-usage-cache.json`，不启 PowerShell，快）
  - **实测 `reasonix run`（一次性模式）不触发 SessionStart** → hook 需在**交互会话**（TUI/桌面版）验证；UserPromptSubmit 也一并配了
  - 注意：每次会话会多一点点上下文 token
- CLI TUI 的 statusline 仍保留在 `config.toml` 的 `[statusline]`（桌面版状态栏是固定 16 项，不支持）

## 4. 验证方法（可复用）
- 沙箱里看不到用户桌面的窗口，但 **puppeteer + 系统 Edge** 可以无头渲染并截图：
  `puppeteer.launch({ headless:'new', executablePath:'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' })`
- dsh web 需带 token 访问：`dsh web --no-open --port N` 的输出里有 `?token=...`
- Edge 自带的 `--virtual-time-budget --screenshot` **会因 SPA 的 WebSocket 长连接永远等不到空闲而卡死** → 改用 puppeteer
- 截图里两个位置都出现 `● GOAT 5h 2% · 周 64%` 即面板正常

## 5. 诊断落点
`D:\Toolbox\goat-gateway\logs\`：`hook.log`（Reasonix hook 是否被执行）、`layered.log`/`tray*.log`（已停用的桌面挂件）。
