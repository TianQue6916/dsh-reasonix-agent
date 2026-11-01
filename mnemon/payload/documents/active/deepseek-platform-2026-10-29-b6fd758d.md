---
id: "b6fd758d-c8d3-4d58-beef-37bf4185e9ba"
title: "DeepSeek 搜索计费口径分路径与 platform 用量抓取受阻记录（2026-10-29）"
description: "2026-10-29 排查「搜索每天约 ¥0.1 + 10-26/10-28 官网出现 deepseek-flash token」：给出计费口径分路径（直连 /v1/tools/search 自 10-17 收费 vs server-side tool 路径延至 11-01）、算式核对、本机已排除清单、用户级 env 的结构性缝，以及 Windows/Edge 下抓 platform.deepseek.com 的障碍与三条可行路径。修正既有文档 3e3eb62f 的「11-01 前免费」表述。"
status: "active"
created_at: "2026-10-28T18:10:39.799Z"
updated_at: "2026-10-28T18:10:39.799Z"
content_hash: "6deb0f8a6f88f0ed757891ab618adc6774eabfe26c124d6d6b53c17ae612a6ac"
source_paths:
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/headless/cordis.patch.yml"
  - ".continue/config.yaml"
session_ids:
  - "cd14b7c5-c0c6-467f-9f61-4d0baabe9f0a"
memory_body_ids:
  []
---

# DeepSeek 搜索计费口径与 platform 用量抓取受阻（2026-10-29）

关联：`5acefe56`（DEEPSEEK_API_KEY 资金隔离落地）、`3e3eb62f`（Search/Fetch API 调研）、`5a23e31e`（local-search 上限 74）。

## 触发与用户提供的事实

用户报告：官网用量页在 **10-26、10-28** 有 `deepseek-flash` 的记录；并且搜索**一直**在计费，约**每天 ¥0.1**。

## 口径修正：搜索计费分两条路径

- **直连** `POST https://api.deepseek.com/v1/tools/search`（local-search 的 `deepseekSearch` 源即走这条）→ **2026-10-17 上线即按次计费**，¥5 / 1000 成功请求；只有 HTTP 200 且 `results` 非空才计费，空结果与失败免费。
- **server-side tool 路径**（Harness / Claude Code / Codex 内部触发搜索）→ 才延到 **2026-11-01 00:00** 免费。

⇒ 与 `3e3eb62f` 里「2026-11-01 前免费」的笼统表述冲突，以**分路径**口径为准。

实测一次真实调用：响应体顶层只有 `{results}`，**无 `model`、无 `usage` 字段** ⇒ 搜索开销不会被记成 `deepseek-flash` 的 token 账单，可以排除「官网那行 flash 其实是搜索」的解释。

## 算式与观察吻合（预期账单，非泄漏）

`web_search` 次数 × `searchMaxQueries`（`dsh-tool-web` 默认 4）× ¥0.005：

- 10-26：6 × 4 × 0.005 = **¥0.12**
- 10-28：9 × 4 × 0.005 = **¥0.18**

## 本机已排除（截至 2026-10-29 02:00 前后）

- goat-gateway 日志 10-26 / 27 / 28 无 `deepseek-official` 路由记录；`keys.json` 里的官方 upstream 已移除。
- desktop / headless / web 三 profile 的 `web-search-deepseek` 插件条目已**全部删除**；web 端由 commit `8cbdaa1` 删掉原段（原配置 `apiKeyEnv: DEEPSEEK_API_KEY__DISABLED_INTENTIONALLY`、`maxUses: 3`，注释明写 key 只给 `/v1/tools/search`）。
- dsh sessions 中无裸 id `deepseek-flash`（注意与 GOAT 的 `deepseek/deepseek-v4.1-flash` 区分）。
- 余额闲置 15 s 无变化。

## 结构性缝：用户级持久 env

`DEEPSEEK_API_KEY` 位于 Windows **User 级持久环境变量**，不是 `.env` 独有 ⇒ 任何进程（VSCode 扩展、CLI、脚本）读 env + 官方 `base_url` 就能花这把 key 的钱，而配置文件里根本不会出现 `api.deepseek.com`。这是「扫文件扫不出调用者」的根因。

同账号还有其它 key：`~/.continue/config.yaml` 里一条 `provider: deepseek / model: deepseek-v4-pro`（`apiKey: sk-4f68ae…`），以及 Linux 天阙机的另一把；官网用量**按账号合计**，本机看不到别的机器。

## platform.deepseek.com 抓取障碍（Windows + Edge）

- 平台接口 `/api/v0/usage/by_api_key/amount`、`/api/v0/usage/amount`、`/api/v0/usage/by_api_key/cost`、`/api/v0/users/get_api_keys` 直连均返回 `{"code":40003,"msg":"Authorization Failed (invalid token)"}`；`/api/v0/usage`、`/api/v0/api_keys`、`/api/v0/users/get_user_balance` 返回 404 ⇒ 这些接口走**浏览器 cookie 鉴权**，不是 bearer token。
- Edge 运行中对 `Cookies` 库**独占锁**：`cp` 报 `PermissionError [WinError 32]`，`esentutl` 报 `JET_errFileAccessDenied`。
- 已有 Edge 实例占用 profile ⇒ 新起 `msedge --headless --dump-dom` 实例直接退出，输出 0 字节（页面 dump 为空、无「登录」字样）。
- CDP 路线（`--remote-debugging-port` + websocket）：TCP 通，但 `Page.enable` 在 `headless=new` 下 `websocket._exceptions.WebSocketTimeoutException`。
- `pip install playwright` 超时失败，无 puppeteer/playwright 可用。

## 三条可行路径（按省事排序）

- **A**：用户关闭 Edge → 复制 profile 目录 → headless 打开后依次打 `/api/v0/usage/by_api_key/amount?start=…&end=…`，直接拉「按 API Key × 按模型 × 按天」的 token / 请求数 / 费用。
- **B**：卷影复制（VSS）读 Cookies 快照，需 UAC 提权，只读、不改任何东西。
- **C**：用户自己在 usage 页 F12 → Network → 筛 `usage` → 右键请求 **Copy as cURL** 交给本地。

## 未决

- 10-26 / 10-28 的 `deepseek-flash` token 到底记在哪把 key 上。判据：token 量级与请求次数——「35 steps / 1.25M cacheRead」这类是 model turn，几十 K token 的零散记录更像某个补全插件。
- 用户「你卡死了」的反馈表明：抓官网这类阻塞操作应**先说明障碍并给出选项**，而不是连续尝试 headless / CDP 变体。
