---
id: "8785572a-0406-48f6-be8f-3dbd78cfd291"
title: "local-search 四源聚合「结果全是 github」诊断：熔断正则不对称缺陷 + rank 截断（2026-10-02）"
description: "2026-10-02 对 dsh-plugin-local-search（github/goat/deepseek/wiki 四源聚合）\"搜出来全是 [github]\"的诊断交接：结论为链路正常、由 wiki 匹配面窄 + rank 截断 + maxResults=8 叠加造成，唯一真 bug 是 goat/deepseek 两处熔断正则不对称导致官方 402 Insufficient Balance 不熔断（index.js:252 vs :261），附带官方余额为负导致 deepseek 源 unavailable 的机制、DEEPSEEK_API_KEY 只在 Windows 用户级 env 的环境事实，以及尚未落地的四个可调项。修复尚未实施。"
status: "active"
created_at: "2026-10-02T08:07:08.591Z"
updated_at: "2026-10-02T08:07:08.591Z"
content_hash: "85104d0a94db4ad0750b4e526a03281cab3c3447cb75eff4c5562453e577e945"
source_paths:
  - "profiles/web/node_modules/dsh-plugin-local-search/index.js"
  - "profiles/web/node_modules/dsh-plugin-local-search/selftest.mjs"
  - "profiles/web/cordis.patch.yml"
session_ids:
  - "e8a1df79-be1b-4561-969e-fda13b2fa448"
memory_body_ids:
  []
---

# local-search 四源聚合「结果全是 github」诊断与熔断正则缺陷

日期：2026-10-02。状态：**诊断完成，修复未落地**（父会话末尾仍在问用户"要我先落哪一项"，用户未选择）。

关联文档：
- `c6920883-b535-418c-afe8-68e83c7dfa0b` —— 三源聚合实现交接（`mergeSources` rank 配额/去重回填、`deepseek-official` 正确 id、凭证熔断设计）
- `68496d1e-2cf3-4558-8ccf-10f1f2beac0a` —— goat 第四源成本证据与默认关闭（T13、selftest 13 组、CRLF 编辑陷阱）
- `be295e6b-be04-4de4-9625-c6cd431e73dc` —— deepseek 源 maxUses 收紧与三源运行时核验方法

## 诊断结论

用户观察到 `web_search` 返回的来源**清一色是 `[github]`**，怀疑聚合链路坏了。实测结论：**链路没坏**，是三个正常因素叠加。

| query | 条数 | 来源分布 |
|---|---|---|
| `PocketWiki` | 8 | github 7 + pocketwiki 1 |
| `方舟知识库` | 8 | github 7 + pocketwiki 1 |
| `PocketWiki ZIM offline wikipedia search` | 7 | github 7 |
| `DeepSeek V4.1 Flash context window` | 8 | github 8 |

旁证：`node selftest.mjs` **13 组全过**（含 T5「github → deepseek → wiki 顺序统一返回」、T6「github 挂掉后仍返回 deepseek + wiki」、T9/T12 凭证熔断、T10 goat web_search_tool_result 解析、T11 四源 rank、T13 goat 默认关）；直接实例化 provider 打聚合器也返回真实 wiki 条 `http://100.79.96.82:8810/pocketwiki/首页`（aggregator `/health` 与 `/search` 均 HTTP 200）。

三个因素（都非 bug）：

1. **wiki 匹配面窄** —— PocketWiki 只有 104 页，无关 query 命中 0 条属正常。
2. **rank 排序对 wiki 最不利** —— `SOURCE_RANK = {github:0, goat:1, deepseek:2, wiki:3}`，`mergeSources` 末尾 `out.sort(byRank)` 后 `slice(0, maxResults)`，而配置 `maxResults: 8`；github 每个 query 都能凑出 7–8 条，按 rank 回填时吃干净名额 ⇒ wiki 那条被排到第 9 位上下切掉。
3. **deepseek 源确实在失败，但不是代码问题** —— 官方余额为负（`-0.22`，`is_available: false`）⇒ `provider.available()` 为假 ⇒ 插件抛 `deepseek provider is registered but unavailable`，日志另有 `deepseek provider not registered (tried "deepseek-official", "deepseek-official", "web-search-deepseek")`。

## 唯一真 bug：两处熔断正则不对称

`profiles/web/node_modules/dsh-plugin-local-search/index.js`：

| 源 | 行 | 判定「凭证/额度类失败」的正则 |
|---|---|---|
| goat | `index.js:252` | `/api key\|credential\|401\|403\|account\|not registered\|credit\|quota\|balance\|insufficient/i` |
| deepseek | `index.js:261` | **只有** `/api key\|credential\|account/i` |

后果：官方 402 `Insufficient Balance` 不匹配 deepseek 的正则 ⇒ **不进入 60s/600s 冷却熔断** ⇒ 每搜一次都白打一次官方子查询，多付一轮 RTT（且 `enableFallback: true` + `fallbackProviderId: multi-search` 下还可能多绕一圈）。goat 侧遇同类错误会正确冷却，行为不一致。

最小修法（一行）：给 deepseek 的正则补上 `balance|insufficient|402|credit|quota`。

## 环境事实（解释历史上那次 401）

- `~/.dsh/.env` 里**只有** `COMMANDCODE_API_KEY`，没有 `DEEPSEEK_API_KEY`。
- 官方 key 只存在于 Windows **用户级** env（`LOCAL_SEARCH_*` 在用户级/进程级 env 均未设置；`launch-dsh.ps1` 里也没有任何 `$env:LOCAL_SEARCH_*` 赋值）。
- 因此此前那次 401 `Authentication Fails` 的来源是 key 注入层，而非余额；这次的失败才是余额。
- web 实例（pid 28480，`dsh --profile web --port 3080 --no-open`）的搜索源配置在 `profiles/web/cordis.patch.yml` 的 row `- id: local-wiki-github`（`name: dsh-plugin-local-search`）：`enableGithub: true`、`enableGoat: false`、`enableDeepseek: true`、`enableWiki: true`、`maxResults: 8`、`interleaveSources: false`、`tagTitles: true`、`enableFallback: true`、`fallbackProviderId: multi-search`；`priorityOwner: TianQue6916`。
- 上层 `dsh-tool-web`（`AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tool-web/lib/index.js`）默认 `searchMaxResults: 8`、`searchMaxQueries: 4`，`mergeSearchResults` 按 rank round-robin 合并多 query 并去重后截断。

## 待决策可调项（均未实施）

- `interleaveSources: true` —— 改 round-robin，让低 rank 源每条都有露面机会；代价是同源结果被打散、块状阅读性变差。
- 调高 `maxResults`（8 → 12）—— 给低 rank 源留生存空间。
- 提高 wiki 的 `SOURCE_RANK` —— 属改语义（模块级导出常量），倾向不动。
- 余额为负期间把 `enableDeepseek` 关掉 —— 否则每次搜索白跑一源，等充值再开。

倾向方案（父会话提出、用户未确认）：**先修熔断正则（真 bug）+ 暂关 deepseek**，`interleaveSources` 保持 `false`，因为「github 块在前」在当前数据分布下是合理行为。

## 未决

- 修复尚未写入 `index.js`，也未跑回归；selftest 目前不含「402 Insufficient Balance 应熔断 deepseek」这条断言，补正则后应加一条 T 组断言。
