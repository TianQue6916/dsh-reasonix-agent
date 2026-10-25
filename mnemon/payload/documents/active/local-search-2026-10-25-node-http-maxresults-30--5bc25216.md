---
id: "5bc25216-46cb-4b2a-91a3-e59a7ab8b559"
title: "local-search 三源修复验证与参数调优（2026-10-25 收尾）：node:http 生效、maxResults=30、英文维基变体、patch config 不深合并"
description: "2026-10-25 夜间收尾：wiki 源 node:http 修复重启后验证生效（三源齐活、199 次错误归零）；maxResults 8→30 与 deepseekSearchCount=30；wiki 后端为英文维基导致中英混杂 query 返回 0 条、新增 buildWikiQueryVariants；三个新踩坑（cordis.patch config 整体替换不深合并、patchReload:live 需新会话、http.request 'error' 必须先于 destroy 绑定）。引用 e764defe 与 5acefe56。"
status: "active"
created_at: "2026-10-25T10:46:47.542Z"
updated_at: "2026-10-25T10:46:47.542Z"
content_hash: "479c08fb69913516be796ef3b2f889ccabac5a64de37687f67a152349a41c312"
source_paths:
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/headless/cordis.patch.yml"
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/logs/host-stdio.log"
session_ids:
  - "b3b16eb2-73ea-4d62-bcbb-26b43d627d57"
memory_body_ids:
  []
---

# local-search 三源收尾与调优（2026-10-25 晚）

承接 [`e764defe`](documents/active/dsh-web-search-deepseeksearch-wiki-fetch-failed--e764defe.md)（fetch failed 根因与 node:http 改写）与 [`5acefe56`](documents/active/deepseek-api-key-web-search-2026-10-25-5acefe56.md)（key 隔离）。本篇只记录**修复验证结果**与**之后新暴露的三个坑**。

## 1. 修复已实证生效（重启后）

同一 query `DeepSeek company Hangzhou 2023 Liang Wenfeng` 返回 8 条，三源齐全：github ×3、deepseekSearch ×4（中国日报 / 美国国会 CRS IF13051 / 上海证券报）、wiki ×2（`Liang Wenfeng`、`DeepSeek`，完整正文片段）。

判据不是"看起来有结果"，而是日志计数：`.dsh/logs/host-stdio.log` 中 `wiki source failed` 在重启后最近 300 行为 **0 次**，重启前当天累计 **199 次**。也就是说该源此前长期静默挂掉，只是因为多源聚合会降级而不报错，所以一直没人发现。

## 2. 三个新踩的坑（都可复用于后续改这个插件）

### 坑 A：`cordis.patch.yml` 的 `config` 是**整体替换**，不深合并
profile patch 里给 `local-wiki-github` 写 `config` 会覆盖整个 config 对象，缺失字段回落到插件 `DEFAULT_CONFIG`。第一版只写了 `maxResults: 20` / `deepseekSearchCount: 20` 两行，结果 `enableDeepseek` 静默回落成 `true`，把最不想启用的「model turn 搜索」源打开了。**改 config 必须把所有开关写全。**

当前三 profile（`desktop` / `headless` / `web`）的覆盖块：

```yaml
- id: local-wiki-github
  config:
    enableGithub: true
    enableDeepseekSearch: true
    enableWiki: true
    enableGoat: false
    enableDeepseek: false
    maxResults: 30
    deepseekSearchCount: 30
    tagTitles: true
```

### 坑 B：profile patch 走 `patchReload: live`，但**新配置只对新会话生效**
`dsh --profile headless --dump-config` 可以零副作用验证合成结果（exit=0 才算通过）。改动当前会话之前建立的会话仍用旧配置——本次两次搜索仍是 8 条就是这个原因，不是没写对。

### 坑 C：`http.request` 的 `'error'` handler 必须在任何 `destroy()` 之前绑定
否则 `AbortSignal` 已 aborted 时，`'error'` 事件先于 handler 到达 → 未捕获事件直接把 node 进程打挂（第一版实测崩过）。现在 abort 路径的离线测试结论是 `PASS abort 已拒: aborted`（正常 reject，不崩）。

## 3. wiki 后端是**英文维基**，中英混杂 query 会 0 条

Linux 聚合器挂的是 `wikipedia_en_all_nopic_2026-06.zim`。实测：

| query | 条数 |
|---|---|
| `DeepSeek V4 模型 参数`（中英混杂） | 0 |
| `DeepSeek V4 model parameters` | 6 |
| `DeepSeek` | 20（max=30 时封顶） |
| `宁夏大学` | 11（首条 `Ningxia University`） |

规律：纯中文靠内部映射、纯英文直接命中，**混杂两边都匹配不上**。

修法：新增 `buildWikiQueryVariants(query)`，剥离非 ASCII 字符生成英文变体；`searchAggregator` 对每个变体 `Promise.allSettled` 并发查询后按 URL 去重合并，只要有一个变体成功就返回已拿到的，全失败才抛错。效果：混杂 query 从 0 → 6 条。

## 4. 条数参数与上下文代价

| 参数 | 原 | 现 |
|---|---|---|
| 插件 `maxResults` | 8 | **30** |
| `deepseekSearchCount` | 10 | **30**（API 侧上限 50） |

用 `grep` 设校验项时注意：旧安装脚本里 `await httpGetJson(` 的正则已过时（新版是 `return httpGetJson(`），会报 `MISS searchAggregator uses it` 而代码本身正确——校验失败不代表安装失败，需人工比对函数调用形态。

代价估算：30 条时每条 `summary` 约 400 字符，单次搜索注入接近 12K 字符；`deepseekSearchCount` 计费按**请求次数**而非条数，调高不额外花钱。因此"再多一点"应调 `maxResults` 而不是加大请求数，且受上下文预算约束。

## 5. 顺带清理

- 三 profile 中 `web-search-deepseek`（`@deepseek-ai/dsh-web-search-deepseek` + `apiKeyEnv: DEEPSEEK_API_KEY`）整条删除，`goat-gateway/keys.json` 的 `deepseek-official` 条目删除，池内只剩 `163`（停用）与 `qq`。
- 残留告警 `fallback provider "multi-search" is not registered or unusable` 只在四源全空时触发，当前不影响功能；彻底消除需 `enableFallback: false` 或指向已注册 provider（未改）。
- `@deepseek-ai/dsh-*` 二十余包只是 npm 包名，与 API key 无关；`commandcode-goat` 里 `deepseek/deepseek-v4-pro`、`deepseek/deepseek-v4.1-flash` 是 GOAT 转售模型名（走 `127.0.0.1:8788/v1` + `COMMANDCODE_API_KEY`，消耗套餐额度），不属于官方渠道。

## 部署产物

- 已装文件：`D:\80-系统\Toolbox\goat-gateway\dsh-plugin-local-search\index.js`（40208 bytes）
- 备份链：`index.js.bak-20261025-184426-pre-wiki-http`（上一版 38382 bytes）、`index.js.bak-20261025-173516-pre-wiki-http`、`...-144606-pre-deepseekSearch`
- 安装脚本：`C:\Users\27063\_install_wiki.ps1`（5 项校验：httpGetJson helper / searchAggregator 调用 / node:http import / deepseekSearch 保留 / endpoint 完整）
