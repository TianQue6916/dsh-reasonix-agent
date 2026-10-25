---
id: "5acefe56-e36f-41cf-af47-8c66326900ad"
title: "DEEPSEEK_API_KEY 资金隔离三层落地与 web_search 四源实测状态（2026-10-25）"
description: "2026-10-25 用户充值后要求「DeepSeek 官方 key 绝不给普通对话用」：给出 dsh 三 profile 的 key 隔离落地方式（伪造 apiKeyEnv 名使插件 available() 恒 false）、零副作用验证命令、实测余额与 /v1/tools/search 召回、网关 keys.json 侧 deepseek-official 现状与 UAC 清理受阻、以及 wiki 源 fetch failed 的排查（服务端正常、dsh 进程内 fetch 失败，疑代理栈差异，未验证）。"
status: "active"
created_at: "2026-10-25T07:21:21.703Z"
updated_at: "2026-10-25T07:21:21.703Z"
content_hash: "f21775fff064d8d0b57dded1d6494b4498880af5423c224fb1a35f3873472fda"
source_paths:
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/headless/cordis.patch.yml"
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/local-search-token"
session_ids:
  - "1af3fcdb-0e27-493d-8cdc-23b4e29527d2"
memory_body_ids:
  []
---

# DEEPSEEK_API_KEY 资金隔离（2026-10-25）

## 诉求与约束

用户充值后明确要求：**DeepSeek 官方 key 只允许给 `/v1/tools/search` 用，绝不能被任何「普通对话 / model turn」路径消费**（原话大意：充钱了，千万别给普通对话用）。目标资金链路：

```
对话        → COMMANDCODE_API_KEY → GOAT 套餐额度   （不花充值余额）
web_search  → DEEPSEEK_API_KEY   → /v1/tools/search （按次计费，不吃 token）
```

## 三层隔离（已落地）

**1. 对话 provider 本身不碰该 key。** 三 profile 的 `providers` 只有 `commandcode-goat-anthropic` 与 `commandcode-goat`，都是 `apiKeyEnv: COMMANDCODE_API_KEY`、`baseURL` 指向本地 GOAT gateway `127.0.0.1:8788/v1`。没有任何 LLM provider 指向 `api.deepseek.com`。

**2. 唯一会烧 token 的搜索插件被物理断线。** `@deepseek-ai/dsh-web-search-deepseek`（`id: web-search-deepseek`）默认 `apiKeyEnv: DEEPSEEK_API_KEY`，**每个 query 打一次 Messages model turn** —— 这就是真正烧钱的路径。三个 profile 全部改为：

```yaml
- id: web-search-deepseek
  name: "@deepseek-ai/dsh-web-search-deepseek"
  config:
    # 2026-10-25 用户要求：这个 key 只给 /v1/tools/search 用，禁止任何 model turn 路径拿它
    apiKeyEnv: DEEPSEEK_API_KEY__DISABLED_INTENTIONALLY
    maxUses: 3
```

机制：插件读一个不存在的变量名 → `available()` 恒为 false → 永不进入调用路径。这比删插件更轻，且保留回滚点。`maxUses: 3` 另有限流理由：`dsh-tool-web` 的 `searchMaxQueries` 默认 4，`100` 会让最坏情况变成 400 次内部搜索。

**3. 旧源关闭、新源开启。** `enableDeepseek: false`（旧的「让模型跑一轮搜索」源），`enableDeepseekSearch: true`（新的直连 `/v1/tools/search`）。

改动文件：`.dsh/profiles/{desktop,headless,web}/cordis.patch.yml`（desktop 约 line 1325、headless 约 line 684、web 约 line 1348）。
备份：`~/.dsh/profiles/*/cordis.patch.yml.bak-20261025-*-pre-disable-dsofficial`。

## 验证方法（零副作用）

- grep 三 profile 里所有 `apiKeyEnv: DEEPSEEK_API_KEY` 的 model-turn 路径 → 期望 **0 处**（只剩 `DEEPSEEK_API_KEY__DISABLED_INTENTIONALLY` 三处）。
- `dsh --profile headless --dump-config` 校验配置合成正常（不启动会话、不烧 token）。

## 实测数据（同日，充值后）

- `GET /user/balance` → `{"is_available":true,"total_balance":"4.77"}` ⇒ 约 954 次搜索（¥5/1000），且 2026-11-01 前该 7 天免费。
- `POST /v1/tools/search {"query":"DeepSeek V4","count":2}` → 真实召回，`authority: 4`（极权威）、`rerank_score: 2.48`（优质线约 1.5 以上），带 `site_name` / `date` / `summary`。

## 网关侧：deepseek-official 渠道

`D:\80-系统\Toolbox\goat-gateway\keys.json` 里本来就有这条，`enabled: false`、`priority: 0`、`pathPrefixes: ["/anthropic/"]`、`upstream.origin: https://api.deepseek.com`。所以它不参与正常转发，但仍占 `priorityTiers` 的 `{"0": 1}` 一个位置，用户希望干脆从池里删掉。

阻塞点：gateway 进程（node, pid 变化）持有目录/文件，`keys.json` 写入与 `cp` 备份都报 `PermissionError: [Errno 13]`；`D:\80-系统` 属 High Integrity Label 保护目录，需要 UAC 提权脚本（写 `%TEMP%` 的 .ps1 + `Start-Process -Verb RunAs`）才能改，脚本已生成但当场停在 UAC 确认未执行。gateway 支持 `/reload` 与 `/_gateway/reload` 重载，且 `keys.json` 有 mtime 热重载，改完不必重启进程。

脱敏取值规则：keys.json 里 `key` 字段只报长度与前缀（如 `<35 chars, prefix=sk-a46>`），不落盘明文。

## web_search 四源实测状态

| 源 | 状态 | 证据 |
|---|---|---|
| GitHub | 正常 | 返回 8 条 `[github]` 结果，内容正确 |
| DeepSeek Search（deepseekSearch） | 未加载 | 当前进程仍是改前的 bundle，插件 bundle 不参与 HMR，必须重启 dsh |
| wiki（内网聚合器 `100.79.96.82:8810`） | 一直失败 | 日志 `[err] [local-search] wiki source failed: fetch failed` 连续出现 |
| 旧 deepseek / goat 源 | 关闭 | 配置项 `enableDeepseek: false` |

**wiki 失败是既有问题，与本次 key 隔离改动无关。** 服务端可用性已证：`GET http://100.79.96.82:8810/health` 返回 `wiki_zim_exists: true`；带 `x-local-search-token`（凭证在 `.dsh/local-search-token`）的 `fetch('/search?q=DeepSeek&max=3')` 在 **CLI 的 node** 里成功返回条目。同一请求在 dsh 进程内失败 ⇒ 疑为 Electron/Chromium 的代理与 DNS 栈差异，**建议改法是将该源从 `undici` 的 `fetch` 换成 `https.request`**（与 GitHub 源的做法一致）。此假设尚未验证，改完仍需走提权安装流程。

另一条已知噪声：`fallback provider "multi-search" is not registered or unusable; returning empty` —— `fallbackProviderId` 指向未注册 provider，只在四源全空时触发，不影响主流程。

## 相关文档

- `3e3eb62f-f0b9-4b6d-a2e3-42b14e65916b`：DeepSeek Search/Fetch API 调研与接入方案（API 语义、计费、rank 兼容约束）。
- `e1471ba1-1503-4003-b4de-a5d1ad89a3d3`：第五源 `deepseekSearch` 的实现交接与 `D:\80-系统` 提权写入流程。
- `84ef8002-3659-4b08-ba31-f622fbc184ba`：`deepseek-official` 作为欠费 dead key 引发 402 误报的因果链与 `enabled: true→false` 改法。
