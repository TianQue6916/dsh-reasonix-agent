---
id: mem-9226f34129a3639e858f5827e0bf45d5
revision: 1
created_at: "2026-10-25T09:35:43.115Z"
updated_at: "2026-10-25T09:35:43.115Z"
name: dsh-web-search-wiki-fetch-failed-修复
description: "wiki 源 fetch failed 根因（Electron fetch 走浏览器代理）+ http.request 修复 + deepseek 渠道清理"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 1. wiki 源 `fetch failed` 的根因与修复（2026-10-25）

**现象**：`dsh-plugin-local-search` 的 wiki 源持续报 `[err] [local-search] wiki source failed: fetch failed`，但**命令行 node fetch 直连同一地址是通的**。

**根因判定**：dsh 跑在 Electron 里，全局 `fetch` 走 Chromium 网络栈（含系统代理 / PAC）。内网地址 `100.79.96.82:8810` 经代理必挂；CLI 里的 node fetch 是 undici 直连，所以能通。这也解释了为什么日志里只有笼统的 `fetch failed`——undici 的 `cause` 没被打印。

**修复**：把 `searchAggregator` 从 `fetch` 改成 `node:http` 的 `http.request`（与 GitHub 源同一套写法）。新增 `httpGetJson(urlObj, headers, timeoutMs, parentSignal)` 助手，并且把 `error.cause.code` 拼进错误消息，下次失败能直接看到 `ECONNREFUSED` / `ETIMEDOUT` 这类具体原因。

**踩到的坑（重要）**：`http.request` 的 `'error'` handler **必须在任何 `destroy()` 之前绑定**。第一版在 abort 时先 `req.destroy()` 再绑 handler，导致 `Signal already aborted` 场景下 `'error'` 无人接管，直接把 node 进程打挂（实测 crash）。修正顺序：先建 req → 立刻 `req.on('error')` → 再处理 parentSignal 已 aborted 的情况 → 最后设 timeout。

**验证**：`node -e` 加载插件，正常请求返回 3 条（首条 title=DeepSeek），abort 场景正常 reject 不崩溃。

**状态**：已安装到 `D:\80-系统\Toolbox\goat-gateway\dsh-plugin-local-search\index.js`（38382 字节，备份 `index.js.bak-20261025-173516-pre-wiki-http`），**等重启 dsh 生效**。

## 2. deepseek 官方渠道全部清理（2026-10-25，用户要求「千万别给普通对话用」）

三层隔离：
1. **LLM provider**：只有 `commandcode-goat-anthropic` + `commandcode-goat`，都是 `apiKeyEnv: COMMANDCODE_API_KEY` + `http://127.0.0.1:8788/v1`。没有任何 LLM provider 指向 `api.deepseek.com`。
2. **搜索 plugin**：`- id: web-search-deepseek`（`@deepseek-ai/dsh-web-search-deepseek`）**整条从 3 个 profile 删除**（原 `apiKeyEnv: DEEPSEEK_API_KEY`，走 model turn 会烧 token）。
3. **gateway key 池**：`keys.json` 里的 `deepseek-official` 条目**彻底删除**（原 `enabled: false` + `priority: 0` + `pathPrefixes: ["/anthropic/"]`）。删除后 `priorityTiers` 从 `{'0':1,'100':2}` 变 `{'100':2}`，池里只剩 `163`(停用) / `qq`。**gateway 有 mtime watch，改完自动热重载，不用重启。**

备份：`keys.json.bak-20261025-173012-pre-drop-deepseek-official`、`profiles/*/cordis.patch.yml.bak-*-pre-drop-web-search-deepseek`。

## 3. 配置里还剩的「deepseek」字样（都不是官方渠道）

- `@deepseek-ai/dsh-*` → dsh 官方包名，deepseek 团队出品，与 API key 无关
- `commandcode-goat` 的 models 里 `deepseek/deepseek-v4-pro` / `deepseek-v4.1-flash` → **GOAT 上游转售的模型名**，走 `127.0.0.1:8788` + `COMMANDCODE_API_KEY`，不碰充值余额
- 插件自己的 `SOURCE_RANK.deepseekSearch` / `provider: 'deepseek-search'` → 我们新加的检索源标识

## 4. 提权执行在 High IL 目录上的可靠姿势（本机实测）

`D:\80-系统` 是 High IL 保护目录，普通进程 `Access denied`（DACL 明明给了 Modify）。
- ❌ `Start-Process pwsh -Verb RunAs -File x.ps1` → 有时用户点了确认但脚本没跑起来，无日志
- ❌ `cmd //c "schtasks /create ..."` → Git Bash 把 `/create` 吃成 `reate`
- ✅ **`Start-Process cmd.exe -ArgumentList '/c','C:\...\x.bat' -Verb RunAs -PassThru -Wait`** —— .bat 里再调 `pwsh -NoProfile -ExecutionPolicy Bypass -File x.ps1`，两次都一次成功
