---
id: mem-f4da66231f05bfc16a0f4338576d9cef
revision: 1
created_at: "2026-10-02T06:50:26.383Z"
updated_at: "2026-10-02T06:50:26.383Z"
name: goat-gateway-path-独家认领机制
description: "goat-gateway 的 path 独家认领机制（pathPrefixes）实现、踩坑与验证"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 机制

`gateway.mjs` 里 keys.json 每个 key 可声明 `pathPrefixes: ["/anthropic/"]`，实现**显式认领制**（不是黑名单）：

- **无人认领**该 path → 全部 enabled key 照常参与（`/v1/*` 聊天路径逐位不变）
- **有 key 认领** → 该 path 上只保留认领者，未声明 `pathPrefixes` 的 key **一律出局**

好处：GOAT 两个 key 无需任何配置就自动让开 forge 不认识的 path（不存在「忘加配置 = 静默走错上游」的坑）。

## 为什么需要它

`selectKey` 只看 `model`，但各上游路由空间不同。实测（2026-10-02）：`POST /anthropic/v1/messages` 被分给 priority 100 的 GOAT key → 转发成 `POST https://api.commandcode.ai/provider/v1/anthropic/v1/messages` → 上游 404：
`{"success":false,"status":404,"message":"404 Not found. Check the docs for available routes.","cause":"POST https://api.commandcode.ai/provider/v1/anthropic/v1/messages is not a registered API route"}`

## 实现位置（gateway.mjs，1743 行版）

- `gateway.mjs:269-271` `loadKeys()` 保留字段：`pathPrefixes: Array.isArray(k.pathPrefixes) ? k.pathPrefixes.filter(x => typeof x === 'string' && x.length > 0) : null`
- `gateway.mjs:873 function pathClaimed(keys, pathname)` —— 是否有 key 认领
- `gateway.mjs:880 function pathAllowed(keyEntry, pathname, claimed)` —— **未声明者 `return !claimed`**
- `gateway.mjs:1557` `meta` 加 `path: url.pathname`
- `gateway.mjs:1563-1566`：`const pathOwned = pathClaimed(enabledKeys, meta.path); const all = enabledKeys.filter(k => modelSupported(k, meta.model) && (!pathOwned || pathAllowed(k, meta.path, pathOwned)));`
- `gateway.mjs:1407` `/health` 逐 key 回显 `pathPrefixes`

## ⚠️ 踩的坑（最重要的一条）

第一版 `pathAllowed` 写成 `if (!Array.isArray(pfx) || !pfx.length) return true;` —— **未声明者一律放行**，与它上方注释（「有人认领 → 未声明的出局」）**语义相反**。后果：GOAT key 照样进候选集，priority 100 压过 official 的 0 → 仍被选中 → 404 照旧。

**教训**：这类「默认放行 vs 默认出局」的开关，必须让「有人认领」这个上下文显式传进判定函数（`pathAllowed(k, path, claimed)`），不要在一个没有上下文的 helper 里猜默认值。

## 其它改动

`config.json` 的 `upstream.stripClientHeaders` 追加 `"x-api-key"` —— 原代码只删 `host`/`authorization`/`content-length`，**`x-api-key` 会原样透传给 upstream**，导致客户端原始 key 绕过 key 池。当前值 `["x-reasonix-","x-session-id","x-conversation-id","x-topic-id","x-api-key"]`。

## 验证

新增 `D:/Toolbox/goat-gateway/selftest-path-prefixes.mjs`（6 项，端口 18792）：
- T1 无人认领 → `/anthropic/*` 仍由最高优先层服务，且上游收到 `/provider/v1/anthropic/v1/messages`
- T2 认领后 → 只走认领者，GOAT 零调用；官方上游收到 `/anthropic/v1/messages`（basePath 为空）、model 被 modelMap 改写
- T3 认领不影响其它 path：`/v1/chat/completions` 仍落 GOAT 层
- T4 **关键安全性质**：认领者失效时返回失败而非回退 GOAT 上游（`officialFail.on` 开关让上游回 503；用开关而非 `close()` 端口，避免 TIME_WAIT）
- T5 `/health` 回显 `pathPrefixes`
- T6 无 key 能服务时 400 诊断含 path

四套 selftest 全绿：`selftest.mjs` 13 项、`selftest-multiupstream.mjs` 6 项、`selftest-quota-priority.mjs` 7 项、`selftest-path-prefixes.mjs` 6 项。

## 生产状态（截至 2026-10-02 14:50）

Windows 已生效（pid 6308；备份后缀 `20261002-1446-pre-pathallowed-fix`、`20261002-1455-pre-path-prefixes`）。keys.json 里 `deepseek-official` 为 `priority: 0` + `pathPrefixes: ["/anthropic/"]`。

**但官方余额已 -0.22**（10-01 下午 ¥5.53 → 10-02 -0.22），`/anthropic/*` 实测返回 `402 Insufficient Balance`。**认领机制本身工作正常**（日志 `SESSION-BIND a85ccdc0 163 -> deepseek-official` + `FAIL id=4 POST /anthropic/v1/messages key=deepseek-official status=402`）。

Linux 侧（`tianque` 100.79.96.82 / `tianque-lan` 192.168.1.13）**2026-10-02 离线**（`tailscale status` 显示 `offline, last seen 13h ago`），path 认领的代码与 keys/config 改动**尚未同步**。

## 与 web_search 的关系

dsh 的 `@deepseek-ai/dsh-web-search-deepseek` 插件打的是 `https://api.deepseek.com/anthropic/v1`（`lib/index.js:105` `const endpoint = \`${options.baseURL}/messages\`;`，`lib/index.js:318` `config.baseURL ?? ... ?? "https://api.deepseek.com/anthropic/v1"`），**config schema 支持 `baseURL`**。要让它走 gateway 就设 `baseURL: "http://127.0.0.1:8788/anthropic/v1"`。

⚠️ 它的 `authHeaders()`（`lib/index.js:178-190`）**同时发 `x-api-key` 和 `authorization: Bearer ...`**，所以 `stripClientHeaders` 里加 `x-api-key` 是必需的。

⚠️ 三个 profile 的段（`profiles/{web,desktop,headless}/cordis.patch.yml`）**尚未改** —— 因为官方余额为负，现在切过去会让 web_search 全挂。
