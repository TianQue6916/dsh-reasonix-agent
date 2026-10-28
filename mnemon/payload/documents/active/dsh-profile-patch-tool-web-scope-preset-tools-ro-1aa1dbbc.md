---
id: "1aa1dbbc-cdba-4143-8542-1fea85a19b12"
title: "dsh profile patch 里 tool-web 的 scope 定位法：只有 preset tools 列表内那处 row 决定会话 searchMaxResults（2026-10-28，8→74 落地）"
description: "2026-10-28 Linux/web profile 把 web_search 条目上限从 8 抬到 74 的全过程与教训：`dsh --profile web --dump-config` 里 tool-web 共 5 处 row，顶层（host）与内置 preset 的覆盖都不影响会话，只有 profile patch 内自定义 preset（preset-anchored-standard）的 tools 列表那一处生效。同时记录 Linux 与 Windows 两端 local-search 的逐层比对结论（插件 sha256 一致、唯一差异 goatEnvFile、aggregatorUrl 指向 Linux 本机）与「patch 对 config 是整体替换」的再次验证。"
status: "active"
created_at: "2026-10-28T09:21:54.162Z"
updated_at: "2026-10-28T09:21:54.162Z"
content_hash: "f3a3393d83fbc3faed7c7e55278fd4199036da85562f1a5e59b65c8afed2d981"
source_paths:
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - "dsh-plugin-local-search/index.js"
session_ids:
  - "47096e35-4939-49fe-8cf5-abafe367094d"
memory_body_ids:
  []
---

# tool-web 的 scope 定位法：改 `searchMaxResults` 必须落在 preset tools 列表内

承接 [`f1153ee7`](documents/active/web-search-provider-maxresults-tool-8-uac-zim-20-f1153ee7.md)（tool 层恒传 8 的隐藏上限）、[`5bc25216`](documents/active/local-search-2026-10-25-node-http-maxresults-30--5bc25216.md)（patch config 不深合并）、[`5a23e31e`](documents/active/local-search-74-deepseeksearchcount-50-api-5a23e31e.md)（74 的来源与三端同步）。本文只补新增的那部分：**row 的 scope 归属**。

## 背景：用户问「Linux 的 websearch 和 Windows 端是不是一样」

结论：插件代码逐字节相同，观感差异来自 profile 层的 `maxResults`。

| | Linux `profiles/web` | Windows `profiles/desktop` |
|---|---|---|
| 插件 `index.js` sha256 | `d7d26d4f519d5811dff71eaf832c4ab6b7162d0205ccf9496ba7b2d570b9673f` | 同左（完全一致） |
| 插件自带 `cordis.patch.yml` | 1 处 hunk：`goatEnvFile: "/home/tianque/.dsh/.env"` | 1 处 hunk：`goatEnvFile: "C:/Users/27063/.dsh/.env"` |
| `searchMaxResults`（tool 层） | 未覆盖 → 默认 8 | 显式 74 |
| `maxResults`（插件层） | 默认 8 | 74 |

只有 `goatEnvFile` 不同，且它必须按平台分叉。其余全在 profile patch。

## 两处串联截断，只改一个无效

```
request.maxResults ← searchMaxResults（tool 层，默认 8）    ← 先卡
mergeSearchResults 截断 ← maxResults（插件层，默认 8）      ← 再卡
```

## 核心教训：`dsh --profile web --dump-config` 里 `tool-web` 有 5 处，只有一处管用

| dump 行号 | 归属 scope | 改它是否影响会话 |
|---|---|---|
| 966 | host 层（`disabled: true`） | ✗ |
| 1400 / 1568 / 1833 | bundle 层内置 preset（standard / minimal 等），**不可改** | ✗ |
| 2405 | profile patch 内自定义的 `preset-anchored-standard` 的 tools 列表 | ✓ **只有这处生效** |

第一轮把 `searchMaxResults` 加在顶层 host 那处，`--dump-config` 里其余位置纹丝不动、会话内实测仍是 8。定位方法是顺着 dump 往回找最近的 `name: '@deepseek-ai/dsh-agent-preset'` 行，确认该 `tool-web` row 落在哪个 preset 的 `tools:` 列表里。

内置 preset 的 row 不要在 profile patch 里尝试覆盖——patch 按 `id` 定位，会命中多处或命中错误的 scope；自定义 preset（这里是 `preset-anchored-standard`，已是 web 默认冷启动 preset）才是正确的落点。

## 另一个必须踩的坑：patch 对 `config` 是整体替换

`- id: local-wiki-github` 若只写 `maxResults: 74`，插件其余 27 个字段会全部丢失并回落到 `DEFAULT_CONFIG`（那里 `enableDeepseek` 默认 **true**，会偷偷打开官方源并白烧子查询）。必须把完整 config 抄全——本次抄了 28 个字段，包括 goat/deepseek 的超时、cache、熔断等看似无关的项。

Windows 侧 `profiles/desktop/cordis.patch.yml:1616` 早有一条注释写着同一结论，可作交叉印证。

## 生效时机与验证

- `cordis.patch.yml` 在 `patchReload: live` 的 HMR watch 范围内 ⇒ **开新会话即生效，无需重启 dsh 进程**；但当前会话的 tool 实例已按旧 config 建好，本轮仍是 8。
- 验证用 `dsh --profile web --dump-config`（零副作用，不启服务）。
- 会话内确认：下次搜索看到 `Showing the first 74 sources`。
- 备份：`~/.dsh/profiles/web/cordis.patch.yml.bak-20261028-171*-pre-search74`。
- 注意 dump 出来的 YAML 里 `!!js` 标签会让普通 `yaml.safe_load` 报错（`could not determine a constructor for the tag 'tag:yaml.org,2002:js'`），这是正常现象，不是 patch 语法错误；以 dsh loader 自身的校验结果为准。

## 顺带查清的环境事实（Linux 侧）

- **wiki 源就是 Linux 这台机器在提供服务**：`aggregatorUrl` 默认 `http://100.79.96.82:8810`（本机 Tailscale IP），实际由 `python3` pid 监听。Windows 是跨机来查这台机器的离线维基（2026-06 的 zim），所以两端 wiki 结果天然相同。
- **token 文件按平台分叉**：Linux 走 `~/.config/local-search/{token,github-token}`，Windows 走 `~/.dsh/local-search-token`；两侧文件大小一致，推断为同一把 token。
- **「Linux 连不上 github」的旧记录已过时**：实测 `github.com → 200`，但耗时 **8.0 秒**。插件 `timeoutMs: 20000` 兜得住，github 源是活的、只是慢，这解释了 github 结果偶尔偏少。
- goat 源关闭是成本决策（claude-sonnet-5-5 的 server tool 会把结果回灌按 input token 计费，单次约 $0.038）；`enableDeepseek` 关闭因官方余额为负。两端一致。

## 采用参数

用户拍板选项 **B（对齐 desktop）**：`searchMaxResults: 74` + 插件 `maxResults: 74`，接受每次搜索约 15–22 KB（≈4–6 K tokens）进 context。备选 C 折中 24 未采用。
