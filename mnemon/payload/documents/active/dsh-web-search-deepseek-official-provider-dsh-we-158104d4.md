---
id: "158104d4-6a2a-4027-91a6-f3778daba823"
title: "dsh web_search 真身定位：官方 deepseek-official provider（dsh-web-search-deepseek）行为边界与 sources.md 更正（2026-10-29）"
description: "2026-10-29 定位结论：web_search 不是自建三源聚合器，而是官方 @deepseek-ai/dsh-web-search-deepseek（注册名 deepseek-official，Server-side native search，content 恒空只给 URL/snippet，无 maxResults 旋钮，$DEEPSEEK_SEARCH_BASE_URL 独立于 chat 端点，失败码三件套）；含定位方法、未定论项（用户改过的\"来源\"层未找到）与技能 sources.md 三处更正。关联自建聚合器版本 c6920883。"
status: "active"
created_at: "2026-10-28T18:03:10.819Z"
updated_at: "2026-10-28T18:03:10.819Z"
content_hash: "6582b8951e5de954aecb9f2c1336d47516e018ec5bafe124a55efbe11d26b439"
source_paths:
  - "AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-search-deepseek/README.md"
  - "AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-search-deepseek/package.json"
  - "AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-search-deepseek/lib/index.js"
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/headless/cordis.patch.yml"
session_ids:
  - "4727c913-77b3-4018-b17b-9f92037769e5"
memory_body_ids:
  []
---

# dsh web_search 真身定位（2026-10-29）

## 一句话结论

当前生效的 `web_search` **不是**早先那个自建的「GitHub + DeepSeek + 本地 wiki 三源并发聚合器」（那套见文档 `c6920883-b535-418c-afe8-68e83c7dfa0b`），而是 **dsh 官方自带 provider**：`@deepseek-ai/dsh-web-search-deepseek` v0.2.1-rc.2，注册名 **`deepseek-official`**。机制是**把检索整个交给 DeepSeek 服务端**跑 native `web_search` server tool（一次搜索 = 一次完整 Messages 调用），不是本地并发聚合。

## 安装位置与身份

```
C:/Users/27063/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/
  @deepseek-ai/dsh-web-search-deepseek/     ← provider 本体（README.md / lib/index.js / package.json）
  @deepseek-ai/dsh-client-ui-settings-web-search/   ← 设置页 UI
  @deepseek-ai/dsh-tool-web/                       ← 模型侧 web_search 工具（渲染 sources、包错误文案）
  @deepseek-ai/dsh-web/                            ← ctx.web 能力 seam
```

同层 web 相关包全集：`dsh-client-ui-settings-web-search`、`dsh-host-webserver`、`dsh-tool-web`、`dsh-web`、`dsh-web-app`、`dsh-web-deepseek-api`、`dsh-web-fetch-http`、`dsh-web-frontend`、`dsh-web-search-deepseek`。**没有任何 `dsh-plugin-local-search` 在 npm 全局树里** —— 自建聚合器只存在于 `.dsh/profiles/*/node_modules/`。

## 行为事实（README 行号 = 该文件内联证据）

| 事实 | 证据 | 实践含义 |
|---|---|---|
| 注册为 `deepseek-official`，可用 `searchProvider: deepseek-official` 钉住 | README `:28` | 有多个 backend 时显式指定，别依赖「唯一可用」的自动解析 |
| `content` **恒为空**，不信 provider prose 当答案 | README `:65` | 检索只给 `url` / `title` / `publishedAt`（来自 `page_age`）+ `cited_text` 拼的 snippet ⇒ **必须拿 URL 去 curl 取正文** |
| 结构化解析 `web_search_tool_result` 块，strict 模式下没有该块即 `WEB_PROVIDER_ERROR`，不降级 | README `:89` | 返回空 sources ≠ 搜到了空结果，先看是不是块缺失 |
| 结果按 URL 去重；**没有结果数旋钮**，`maxResults` 只能服务端截断并打标 | README `:65` | 想要固定条数得自己再切 |
| 端点默认 `https://api.deepseek.com/anthropic/v1` + `/messages`；`$DEEPSEEK_SEARCH_BASE_URL` **独立于** conversation 的 `$DEEPSEEK_BASE_URL` | README `:36`、`:49-50` | 改 chat 端点不会连带改搜索端点 |
| 凭证按次解析：Session 走 `deepseek-account` 路由时用账号 token（只发 `x-dsh-auth-token`），否则用 `DEEPSEEK_API_KEY`（同时发 `x-api-key` 与 `Authorization: Bearer`） | README `:61` | Web Models 页改 key / 重新登录，下一次搜索即生效，不必重启 |
| 失败码：`WEB_PROVIDER_CREDENTIAL_MISSING` / `WEB_ABORTED` / `WEB_PROVIDER_ERROR`；每次 dispatch 后失败都报出解析到的端点，并提示去 Plugins > Built-in plugin settings > Web search 改 Messages API base URL | README `:73` | 报错里的 base URL 是「搜索端点」，不是 chat 端点 |
| 重定向在触达 `Location` 前即拒绝 | README `:73` | — |

## 实测观察（样本，非配置读取）

两次调用返回的 source 标签为 `deepseekSearch` / `github` / `bing` / `duckduckgo` 四类。

⚠️ 这是**从两次调用样本观察**出来的，不是从配置读出来的。`lib/index.js`（16 KB）里 grep 不到 `github` / `bing` / `duckduckgo` 字样 ⇒ 这些标签来自 provider 侧上游，不在这层 JS 里。写进技能时要标明这一差别。

## 连带完成：技能 `sources.md` 三处更正

旧内容「`local-wiki-github`，rank `github(0) > deepseek(1) > wiki(2)`」是**自建聚合器时代的遗留**，与现状不符，已改：

1. §1 第 4 步：`web_search`（三源聚合）→ **`web_search` = DeepSeek native search，只给 URL/snippet；拿到 URL 后 `curl` 取原文**
2. §2 源表：`local-wiki-github` + 旧 rank → **`deepseek-official`（包 `dsh-web-search-deepseek` v0.2.1-rc.2）**
3. §2 的旧警告「本机 CLI 不走 system proxy，curl 打外网常 `http_code=000`（DNS 被注）」→ **已不成立**；实测 `inference.org.uk` 200/28 KB、`web.stanford.edu` 200/17 KB；仍不通的只有 `ocw.mit.edu`、`courses.csail.mit.edu`
4. 新增 **§2.1「`web_search` 的实测行为」**：上面那张事实表 + 三个失败码 + 「只用来找入口」的用法

## 未定论（下次接着查的入口）

用户说「我修改过它的来源」，但**改的那一层没定位到**：

- 三个 profile 的 `.dsh/profiles/{desktop,web,headless}/cordis.patch.yml` 里 **grep 不到 `web-search-deepseek` 的挂载段**
- `lib/index.js` 无 `github` / `bing` / `duckduckgo` 字样
- 现存候选只有两条：① 改了 `$DEEPSEEK_SEARCH_BASE_URL` 指向别处（那标签就来自那个端点）；② 改在 profile patch 之外（插件 config 或 UI 设置页 `dsh-client-ui-settings-web-search`）

另有排除项：`~/.dsh/storages/tools/probe-goat-websearch.mjs`（10-01 的旧探测脚本，测 goat gateway 的 Anthropic server-side `web_search_20250305`）**不是**用户所指的新工具；`~/.dsh/profiles/*/cordis.patch.yml` 中 `*.bak-20261025-173239-pre-drop-web-search-deepseek` 备份名只暗示曾删过 deepseek provider。

顺带记录的环境事实：三个 profile 的 `commandcode-goat` / `commandcode-goat-anthropic` provider 都指向 `http://127.0.0.1:8788/v1`（desktop/web/headless 均如此），与搜索端点是两条独立线。

## 关联

- 文档 `c6920883-b535-418c-afe8-68e83c7dfa0b` —— 自建 `dsh-plugin-local-search` 三源并发聚合器版本（rank 配额/去重回填语义、凭证熔断）。本篇是其被官方 provider 取代后的现状对照。
- 文档 `e764defe-49eb-4cf7-a789-9e3ecc006003` —— 2026-10-25 三源落地阶段的 deepseekSearch / wiki 源排障。
