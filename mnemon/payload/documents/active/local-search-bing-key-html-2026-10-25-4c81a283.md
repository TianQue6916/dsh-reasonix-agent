---
id: "4c81a283-72bb-434f-881d-2bf113900dbc"
title: "local-search 接入 Bing 免 key HTML 源（第五源）与社区检索实践对照（2026-10-25 续）"
description: "2026-10-25 第二轮：dsh-plugin-local-search 新增 Bing HTML 免 key 源（RSS 只 1 条、必解析 b_algo、httpGetText 走 node:https 绕代理、独立 5 分钟熔断）、五源 30 条配额表、wiki 中英混杂 0 条实测、社区 fan-out/fan-in 与 5–10 条保守值对照及未实施的三项优化。引用 5bc25216 与 c6920883。"
status: "active"
created_at: "2026-10-25T11:03:22.494Z"
updated_at: "2026-10-25T11:03:22.494Z"
content_hash: "6f42a0a78798d2cbd9f523f4599eeb45b646562a19c2e0589e478878d4e392da"
source_paths:
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/headless/cordis.patch.yml"
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/PLAN.md"
session_ids:
  - "0c7969d4-3a32-4cd6-b893-c0a0b103a365"
memory_body_ids:
  []
---

# local-search 加第五源 Bing + 社区检索实践对照

承接 [`local-search-2026-10-25-node-http-maxresults-30--5bc25216`](document:5bc25216-46cb-4b2a-91a3-e59a7ab8b559)（node:http 修复、maxResults 8→30、wiki 英文变体、patch config 不深合并）。本篇只记录该文档之后的新增决策与踩坑。

## 决策：数量按 maxResults=30 定，缺口用「无依赖源」补

用户问题起点是「社区经验我需要很多条」。结论：窗口 868K 吃得下 30 条；但原有 github / deepseekSearch / wiki 三源**各有失效条件**（github 要外网、deepseekSearch 要余额、wiki 只能在英文维基内网命中），所以补一个**无 key、国内直连、不过代理**的源来兜底。

## Bing HTML 源（rank=2）实测与实现要点

| 尝试 | 结果 |
|---|---|
| Bing RSS（`format=rss`） | **只 1 条**，不可用 |
| Bing HTML `<li class="b_algo">` | **10 条**，可用 |
| `first=11` / `first=21` 分页 | 仍返回同一批 10 条（无 cookie 时分页失效），去重后共 10 条 |

实现：
- 正则抓 `<li class="b_algo"> … </li>` 块，从块内 `<h2><a href>` 取 URL、`<p>` 取 snippet。
- 新增 `httpGetText`（与既有 `httpGetJson` 对称），**走 `node:https` 而非 Electron fetch** —— Electron fetch 走系统代理，外网请求会被 DevSidecar 拦掉；这是和第一轮 wiki 修复同一个坑。
- Bing 返回 4xx / 连接错误时独立熔断 **5 分钟**（每源各自 cool-down，互不影响）。
- 注入点：`SOURCE_RANK` / config 开关 `enableBing` / 构造函数 / `available` / `plan` / `reset-cooldown` / `set-cooldown`，共 10 处编辑。

## 改完后五源配额（合计 30）

| 源 | rank | 典型条数 | 依赖 | 角色 |
|---|---|---|---|---|
| github | 0 | ~5 | 外网 | 代码/仓库/issue |
| deepseekSearch | 1 | ~10 | 余额（¥5/1000 次请求） | 中文网页、权威媒体 |
| **bing** | **2** | **~10** | **无** | 免 key 兜底、通用网页 |
| goat | 3 | — | GOAT 额度 | 关闭（贵） |
| deepseek | 4 | — | 消耗模型 token | 关闭（会跑一轮模型搜索） |
| wiki | 5 | ~5 | 内网 + 英文维基 | 英文知识兜底 |

`maxResults: 30` 与 `deepseekSearchCount: 30`（API 侧上限 50）在 `DEFAULT_CONFIG` 和 desktop / headless / web 三个 profile 的覆盖块里同时设置；`dsh --profile headless --dump-config` 已确认 `enableBing: true` 等 8 个开关全量写出。

## wiki 英文变体的实测证据（补充上一份文档）

| query | 改前 | 改后 |
|---|---|---|
| `DeepSeek V4 模型 参数`（中英混杂） | **0 条** | 6 条 |
| `DeepSeek V4 model parameters` | 6 条 | 6 条 |
| `DeepSeek` / `max=30` | 20 条 | 20 条 |
| `宁夏大学` | 11 条（首条 `Ningxia University`） | 11 条 |

要点：后端是 `wikipedia_en_all_nopic_2026-06.zim`（**英文维基**），纯中文能靠内部映射命中，纯英文直接命中，**中英混杂两头都匹配不上 → 0 条**，所以必须剥离非 ASCII 后再查一次。

## 社区实践对照（值得复用）

- **架构**：多源聚合就是 fan-out / fan-in + 去重 + 重排，衡量指标「首屏结果覆盖率」；来源间有强依赖时不适用。与现有 `mergeSources` 同构，差异只在配额策略。
- **条数**：社区主流 `max_results` 是 **5–10**，理由是每条都进 context、按 token 成本权衡；单条 excerpt 常按 `maxResults` 反推长度（30 条→200 字符，5 条→800 字符），把 context 当固定预算池分配。本项目当前是硬编码 `slice(0, 400)`。
- **两阶段检索**：先返回 title+url+短 snippet，模型判定相关后再 `fetch` 正文；DeepSeek 侧有 `/v1/tools/fetch` 可接成第二个 tool，而当前是 `need_content: false` 一刀切。
- **`client_model` 参数**：部分搜索 API 允许传入消费模型的名称，由服务端按窗口裁剪 excerpt；DeepSeek `/v1/tools/search` 没有此参数，只能插件侧自己算。
- 本项目相对社区的优势：`rerank_score`(0–3) + `authority`(0–4) 可用于排序与阈值过滤、query 变体、按成功请求计费、401/402/403 十分钟 cooldown 熔断。

## 装机与验证口径

- 目标目录：`D:\80-系统\Toolbox\goat-gateway\dsh-plugin-local-search\index.js`，装完 47238 bytes；备份名 `index.js.bak-<日期>-pre-wiki-http`。
- 装机自检脚本里 `MISS searchAggregator uses it` 是**校验正则过时导致的误报**（新版是 `return httpGetJson(...)`，没有 `await`），不代表代码错误；其余 4 项 OK。
- profile patch 走 `patchReload: live`，但**已存在的会话不会换配置**，必须新开会话才能拿到 30 条。

## 后续可选项（未实施）

1. excerpt 长度随 `maxResults` 自适应（当前硬编码 400）。
2. 接 `/v1/tools/fetch` 做两阶段检索。
3. maxResults 加到 50 的代价：单次搜索可能塞进 15K+ 字符，且结果长期留在对话历史里累积。
