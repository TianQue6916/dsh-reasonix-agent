---
id: "e764defe-49eb-4cf7-a789-9e3ecc006003"
title: "dsh web_search 三源落地：deepseekSearch 生效 + wiki 源 fetch failed 根因与 node:http 修复（2026-10-25）"
description: "2026-10-25 收尾交接：web_search 四源实测结果（github + deepseekSearch 工作、wiki 挂、fallback 未注册）；wiki 源 fetch failed 根因确认为 dsh 进程内 fetch 走 Chromium/系统代理栈导致内网 100.79.96.82:8810 不可达（CLI 的 undici 直连正常）；已实施 searchAggregator → node:http/httpGetJson 改造并安装，含 http.request 'error' handler 必须先于 destroy 绑定的崩溃陷阱；deepseek-official 从 gateway keys.json 摘除的 UAC 提权可行路径（cmd /c bat，schtasks 与 Start-Process -File 均失败）与 mtime 热重载验证。"
status: "active"
created_at: "2026-10-25T09:36:58.723Z"
updated_at: "2026-10-25T09:36:58.723Z"
content_hash: "654fbb8ddfa48043d29e74083c655504d7f7fd2022fcfb0abd05e01c1198665f"
source_paths:
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/headless/cordis.patch.yml"
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/profiles/web/node_modules/dsh-plugin-local-search/index.js"
session_ids:
  - "4fc8a61d-3eb4-41c7-9402-dd120d01f323"
memory_body_ids:
  []
---

# web_search 三源落地与 wiki 源修复（2026-10-25）

状态：**deepseekSearch 源已验证生效；wiki 源修复已安装、等重启 dsh 生效**。前史见 `5acefe56-e36f-41cf-af47-8c66326900ad`（key 隔离 + 四源实测，当时 wiki 失败仅"疑代理栈差异，未验证"）与 `3e3eb62f-f0b9-4b6d-a2e3-42b14e65916b`（deepseekSearch 方案）。

## 一、四源实测结论（dsh 重启后）

一次 `web_search "DeepSeek 公司介绍"` 返回 8 条：**5 条 `[github]` + 3 条 `[deepseekSearch]`**，带 `site_name` 与 `date`（其中百度百科条目日期 2026-10-21，索引较新）。

| 源 | 状态 | 证据 |
|---|---|---|
| GitHub | ✅ | 5/8 条 |
| DeepSeek Search（`/v1/tools/search`） | ✅ | 3/8 条，证明 key + 余额 + 插件 bundle 均正常 |
| wiki（内网 `100.79.96.82:8810`） | ❌ `fetch failed` | 日志持续刷 `[local-search] wiki source failed: fetch failed` |
| fallback `multi-search` | ❌ 未注册 | `fallback provider "multi-search" is not registered or unusable; returning empty`；仅在四源全空时触发，无害 |

**bundle 不参与 HMR**：`dsh-plugin-local-search/index.js` 改动后必须重启 dsh 才加载，日志与结果会继续反映旧 bundle —— 这是"改完没反应"的常见误判点。

## 二、wiki 源 `fetch failed` 根因（已确认）

- **服务本身正常**：CLI 里 `node -e "fetch('http://100.79.96.82:8810/search?q=DeepSeek&max=3', {headers:{'x-local-search-token': ...}})"` 返回 `{"ok":true,...}`，有离线维基数据、token 也有效。
- **dsh 进程内不可达**：同一 URL 在 dsh 进程里必失败。
- **判定**：dsh 的 `fetch` 走 Electron/Chromium 网络栈（带系统代理与独立 DNS 解析），内网 IP 经该代理必挂；CLI 的 node `fetch` 是 undici 直连，所以能通。**不是服务端、不是 token、与当日 deepseekSearch 改动无关，是既有隐性故障。**

## 三、修复方案与实施

把 `searchAggregator` 里对 wiki 源的调用从 `fetch` 改为 `node:http`，与 GitHub 源同一套写法，绕开代理栈：

- 新增 `httpGetJson(urlObj, headers, timeoutMs, parentSignal)` helper（`node:http` + 手动 JSON 解析）。
- `searchAggregator` 内：`await httpGetJson(url, {'x-local-search-token': token}, 20000, signal)`。
- 规模：index.js 由 32703 chars（35459 utf8 bytes）增至 35290 chars（38382 bytes，+2587 chars / +~2.9 KB）。注意 **chars 与 bytes 不等**，比对文件大小时别误判成"文件被截断"。

### 关键陷阱（踩过并修）

`http.request` 的 `'error'` handler **必须在任何 `destroy()` 之前绑定**。否则当 `AbortSignal` 已 aborted 时，会触发 `Emitted 'error' event on ClientRequest instance` 未捕获错误，**直接把 node 进程打挂**（第一版即崩于此）。修法是先 `req.on('error', ...)` 再处理 abort/destroy 分支。

### 验证

- 语法校验 exit=0。
- 离线功能测试（含 abort 路径）：`PASS 正常请求 -> 3 条 | 第一条: DeepSeek`、`PASS abort 已拒: aborted`。
- 安装脚本 5 项校验全过：`httpGetJson helper` / `searchAggregator uses it` / `node:http imported` / `deepseekSearch kept` / `endpoint intact`，`installed index.js bytes=38382`。
- 安装前置备份：`index.js.bak-20261025-173516-pre-wiki-http`（同目录另有 `*-pre-deepseekSearch` 系列备份）。
- **未完成**：需重启 dsh（会断当前会话）后复测三源齐活。预期 `web_search` 返回 github + deepseekSearch + wiki（1 条 Wikipedia DeepSeek 词条）。

## 四、DeepSeek 官方渠道清理（同日，已完成）

三类"deepseek"字样需区分，只有第一类是真正的官方渠道：

1. **已删**：`desktop` / `headless` / `web` 三个 profile 中的 `- id: web-search-deepseek` + `@deepseek-ai/dsh-web-search-deepseek`（各删 8 行）；`D:\80-系统\Toolbox\goat-gateway\keys.json` 中的 `deepseek-official` 条目。
2. **非官方渠道**：20 多个 `@deepseek-ai/dsh-*` 只是 dsh 自家 npm 包名。
3. **非官方渠道**：`commandcode-goat` 的 `deepseek/deepseek-v4-pro`、`deepseek/deepseek-v4.1-flash` 是 GOAT 转售模型名（`baseURL: http://127.0.0.1:8788/v1` + `COMMANDCODE_API_KEY`），走套餐额度，不动充值余额。

校验：`dsh --profile headless --dump-config` exit=0；三个 profile 已无 dsh 自家 deepseek 服务条目。

### UAC 提权的可行路径（重要教训）

删除 `keys.json` 条目需要管理员权限，三条路只有一条成：

- ❌ `Start-Process pwsh -File script.ps1`：窗口一闪即闭，无日志、无备份，用户以为点了其实没生效。
- ❌ `schtasks /create /RL HIGHEST ...`：在 bat/cmd 上下文里 `/create`、`/run` 被拆词报 `'reate' is not recognized`（`-NoProfile` 也被判非法参数）。
- ✅ **`cmd.exe /c _drop_dso.bat`**（bat 内直接调用 `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File ...`）：一次成功，留下日志。

成功日志形态（可作后续同类脚本的验收模板）：`target / backup / keys: 3 -> 2 / remaining ~ SUCCESS`。

### gateway 热重载

`gateway.mjs` 有 keys.json 的 mtime watch，**改配置无需重启进程**：改后 `priorityTiers` 由 `{'0': 1, '100': 2}` 变为 `{'100': 2}`，key 池由 `['163','qq','deepseek-official']` 变为 `['163','qq']`（`163` enabled=False，`qq` 在用，`stickyKey: qq`）。**`priorityTiers` 是验证热重载生效最直接的观测点。**
