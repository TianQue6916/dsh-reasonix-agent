---
id: "3e3eb62f-f0b9-4b6d-a2e3-42b14e65916b"
title: "DeepSeek 官方 Search/Fetch API 调研与接入方案（web_search 新增 deepseekSearch 直连源）"
description: "2026-10-25 调研：DeepSeek 官方 /v1/tools/search 与 /v1/tools/fetch 是与模型解耦的独立 JSON API，按成功请求计费 ¥5/1000 次（2026-11-01 前在 DSH/Claude Code/Codex 中经 server 端工具调用访问不计费），rerank_score/authority 可做阈值过滤；与 dsh 现有 deepseek-official「model turn 搜索」源的区别，以及新增 deepseekSearch 直连源的方案、rank 兼容约束与前置条件（需 API Key + 余额）。"
status: "active"
created_at: "2026-10-25T06:27:17.076Z"
updated_at: "2026-10-25T06:27:17.076Z"
content_hash: "2426efe984dfe0137983f3753a0287071e62684883a3823e9902f3bddb35603a"
source_paths:
  - ".dsh/.env"
  - ".dsh/.credentials.yaml"
session_ids:
  - "c2c4c592-8bef-44b7-b2a6-926d44639ee6"
memory_body_ids:
  []
---

# DeepSeek 官方 Search/Fetch API 与 web_search 接入方案

2026-10-25 调研（用户诉求：用 DeepSeek 的搜索能力但不要走模型，以降低成本）。任务止于「是否动手」的确认点，代码尚未写。

## 关键纠正：DeepSeek 有独立 Search API，与模型解耦

官方文档：<https://api-docs.deepseek.com/zh-cn/guides/search>（正文实测可 curl 直连读到，HTML ~56 KB；在 Git Bash 下先落 `/tmp` 再读时需确认文件确实生成，否则会 FileNotFoundError）。

| API | Endpoint | 作用 |
|---|---|---|
| Search | `POST https://api.deepseek.com/v1/tools/search` | 按 query 搜索网页，返回结构化结果，由 DeepSeek 自研搜索引擎提供 |
| Fetch | `POST https://api.deepseek.com/v1/tools/fetch` | 抓单页，返回 Markdown 正文 |

- Base URL `https://api.deepseek.com`，鉴权 `Authorization: Bearer <DeepSeek API Key>` + `Content-Type: application/json`，与对话 API 同一个 key。
- 两接口都是只读原始 JSON API，**不经过模型、不消耗 token**。
- 这与 dsh 里已有的 `deepseek-official` 源不是一回事：那个源是「让 DeepSeek 模型跑一轮搜索」，一次调用 = 一次 Messages model turn（`cordis.patch.yml` 注释原文），要付 token 钱且贵得多。

## 请求/响应要点

Search 请求字段：`query`（必填，1–128 字符）、`count`（1–50，默认 10）、`ori_question`（原始问题，助判意图）、`localization`（本地化 IP）、`need_content`（默认 false；true 时 `content` 返回网页正文，可省掉一次 Fetch）。搜索语法原样透传：`site:` / `-site:` / `-关键词` / `-"短语"` / `"精确短语"` / `lang:zh,en` / `after:2025-01-01` / `before:2026-06-01`。

`results[]` 每项字段：
- `rerank_score` 0–3（**≥1.5 为优质**）——可直接做阈值过滤，这是 github/wiki 现有源给不了的
- `authority` 0–4（`-1` 未知，**≥3 极权威**）
- `title` / `url` / `snippet`（100–200 字符，前端用）/ `summary`（600–800 字符，**专为喂模型设计**）/ `content`（need_content）/ `site_name` / `site_icon` / `date`（UTC RFC 3339）

错误为 OpenAI 兼容格式，`param` 恒 null：400 参数非法、401 key 缺失/无效、402 余额不足、403 Fetch 被安全策略拒、404 取不到正文、408/429/5xx 可退避重试（其它 4xx 改了请求再试）。

## 计费与限速

- 按**请求次数**计费，不按 token、不按返回条数：Search ¥5 / 1,000 次成功请求；Fetch ¥5 / 1,000 次成功请求。`count` 大小不影响单价。
- 只有 HTTP 200 且**产生结果**才计费（Search 的 `results` 非空，Fetch 必须取到正文）；失败、无结果、超时不计费。
- 文档明确：在 DeepSeek Harness / Claude Code / Codex 中经 server 端工具调用访问 Search/Fetch **目前未计费**，自**北京时间 2026-11-01 00:00** 起按次收费 ⇒ 存在免费窗口。
- 限速按账号粒度，Search 与 Fetch 独立：Search 100 QPS、Fetch 25 QPS（另对目标域名有 Fetch QPS 限制），超限 429。

## 成本对比（用户真正的目标是省钱）

| 源 | 成本 | 状态 |
|---|---|---|
| GitHub / wiki | 0 | 已开 |
| **DeepSeek Search 直连** | 11-01 前 0，之后 ≈¥0.005/次 | 待加 |
| goat（Claude 代搜） | ≈$0.038 ≈ ¥0.27/次 | 保持关闭 |

量级差约 50 倍以上，所以「免 key 抓 Bing/360/SearXNG 的第三方插件」并非唯一低成本路线；一旦有 key，DeepSeek Search 更省且质量更好（自研引擎 + 分数可筛）。

## 接入方案（未落地）

目标文件：`D:/Toolbox/goat-gateway/dsh-plugin-local-search/index.js`（现有 github / goat / deepseek / wiki 四源聚合，见文档 `c6920883-b535-418c-afe8-68e83c7dfa0b`；预算与运行时核验见 `be295e6b-be04-4de4-9625-c6cd431e73dc`；「结果全是 github」的 rank 缺陷见 `8785572a-0406-48f6-be8f-3dbd78cfd291`）。

- 新增独立源（如 `deepseekSearch`）直连 `/v1/tools/search`，`need_content: true`，按 `rerank_score` ≥1.5 / `authority` 过滤后并入 `mergeSources` 的 rank 合并；不要复用 `enableDeepseek`（那条是 model turn，贵得多）。
- 新源必须遵守既有 rank 配额与去重回填语义，否则会重演 `8785572a` 记录的「名额被 github 吃干净」问题。
- 未做：代码、配置项、selftest 脚本。

## 前置条件（当前阻塞）

- `~/.dsh/.env` 只有 `COMMANDCODE_API_KEY`，**没有 `DEEPSEEK_API_KEY`**。
- `~/.dsh/.credentials.yaml` 里只有 `client-connection/browser-session`、`deepseek-account-platform/device`、`deepseek-account-platform/default` —— 那是桌面端账号平台 token，**不能当 API Key 用**。
- 插件配置注释记录 2026-10-02 官方账户余额为 **-0.22**，即便有 key 也需先充值（¥5/1000 次，10 元≈2000 次）。

⇒ 落地顺序：先拿到有效 API Key 并确保有余额，再写 `deepseekSearch` 源。
