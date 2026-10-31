---
id: mem-32bc888257be1c0532d21da80a93748b
revision: 1
created_at: "2026-10-28T09:20:43.105Z"
updated_at: "2026-10-28T09:20:43.105Z"
name: websearch-linux-vs-windows-parity
description: "Linux web 与 Windows desktop 的 web_search 逐层比对：代码同源，差异只在 maxResults/searchMaxResults（8→74），以及 dsh patch 的「整体替换」语义、内置 preset 改不到的坑"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论（2026-10-28 逐层比对 + 实测）

两台的 `web_search` **代码是同一份**：
`index.js` 两端 sha256 `d7d26d4f519d5811dff71eaf832c4ab6b7162d0205ccf9496ba7b2d570b9673f` 完全一致
（Linux `~/goat-gateway/dsh-plugin-local-search`，Windows `D:\Toolbox\goat-gateway\dsh-plugin-local-search`）。
插件自带 `cordis.patch.yml` 只差一行：`goatEnvFile`（各自本机 `.env` 路径）。

**「感觉不一样」的实锤是 `maxResults` 的两个开关**：

| | Linux `profiles/web` | Windows `profiles/desktop` |
|---|---|---|
| 插件层 `maxResults` | 原 8（默认）→ **已改 74** | 74 |
| tool 层 `searchMaxResults` | 原 8（默认）→ **已改 74** | 74 |

两个 8 都会截断：`searchMaxResults` 先作为 `request.maxResults` 传给 provider，
再作 `mergeSearchResults` 的截断值 ⇒ `SOURCE_RANK` 靠后的 bing / wiki 永远分不到名额
（rank：github 0 / deepseekSearch 1 / bing 2 / goat 3 / deepseek 4 / wiki 5）。

## 数据源现状（两端一致）

- 开：`enableGithub` / `enableBing` / `enableWiki` / `enableDeepseekSearch`（直连 `/v1/tools/search`，不吃 token）
- 关：`enableGoat`（claude-sonnet-5-5 server tool，~$0.038/次）、`enableDeepseek`（官方 registry 源，余额 -0.22 时白跑 model turn）
- **wiki 源跑在 Linux 上**：`aggregatorUrl = http://100.79.96.82:8810`（Tailscale IP，`python3` pid 监听），
  Windows 是跨机来查这台机的离线维基（zim 2026-06）⇒ 两端 wiki 结果同源。
- token 按平台分叉：Linux `~/.config/local-search/{token,github-token}`（65 B / 41 B），Windows `~/.dsh/local-search-token`（65 B）。

## 改法（`~/.dsh/profiles/web/cordis.patch.yml`）

1. 顶层追加 `- id: local-wiki-github` + **完整 config**（28 个字段，`maxResults: 74`、`enableBing: true`、`deepseekSearchCount: 50`）
2. 在 `preset-anchored-standard` 的 tools 列表里，`- id: tool-web` 的 config 加 `searchMaxResults: 74`（保留 `fetch: false` / `searchTimeoutMs: 60000`）
3. 另加顶层 `- id: tool-web` override（命中 host 层那份，`disabled: true` 保留）

## 必须记住的 patch 语义（踩过两次）

- **patch 对 config 是「整体替换」不是深合并** ⇒ 写 override 必须把插件全部字段抄全，漏一个就回落到 `DEFAULT_CONFIG`。
- **内置 preset（standard / minimal 等）的 `tool-web` 在 bundle 层，profile patch 改不到**；
  只有 profile patch 里自定义的 preset（`preset-anchored-standard`）的 tools 能被 patch 到。
  dump 里 1400/1568/1833 三处 `tool-web` 属于 bundle 层 preset，仍然 8，不影响默认会话。
- 验证方式：`dsh --profile web --dump-config` 后 grep `searchMaxResults` / `maxResults`（零副作用，不必重启）。
  `cordis.patch.yml` 参与 `patchReload: live` 的 HMR ⇒ **开新会话即生效**。

## 顺带纠正一条旧记忆

「Linux 连不上 github.com（curl → 000）」**已过时**：2026-10-28 实测 `github.com → 200`，但**耗时 8.0 s**，
插件 `timeoutMs: 20000` 兜得住，github 源活着只是慢。
