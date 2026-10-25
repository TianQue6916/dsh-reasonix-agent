---
id: "63920537-afab-454b-b365-0c70e74a206d"
title: "goat-gateway path 独家认领机制（pathPrefixes）实现、pathAllowed 语义 bug 修复与回归保护"
description: "2026-10-02 实施记录：/anthropic/* 404 根因（pathAllowed 与注释语义相反）、显式认领制设计、selftest-path-prefixes.mjs 六项含 T4「认领者失效不得回退」、x-api-key 透传安全洞修复、官方 key 余额烧穿 402 阻塞与 Linux 待同步。关联 priority 分层文档 2932c579。"
status: "active"
created_at: "2026-10-02T06:51:35.279Z"
updated_at: "2026-10-02T06:51:35.279Z"
content_hash: "4f25a4a08fa7f2c6cff71e01c799eb9fc61623710c55c09221f8a4d7111ab156"
source_paths:
  - "gateway.mjs"
  - "selftest-path-prefixes.mjs"
  - "selftest-quota-priority.mjs"
  - "selftest.mjs"
  - "selftest-multiupstream.mjs"
session_ids:
  - "05c25a0c-4dde-4780-a507-d912e2d5e6b4"
memory_body_ids:
  []
---

# goat-gateway path 独家认领机制（pathPrefixes）

**性质**：实施 + 根因调查 + 回归保护交接记录。2026-10-02，Windows 侧（`D:\Toolbox\goat-gateway\`）已落地并验证；Linux 侧未同步。
**关联文档**：`2932c579-9670-4cb7-b244-7edf4a23e9bb`（priority 分层与 quota 动态权重，本机制与它在同一 `selectKey` 候选集上叠加）、`dbffeb3a-718b-436e-b8f1-e4b9850f4b53`（多 upstream 双机上线）。

## 问题与根因

现象：`/anthropic/v1/messages` 被转发到 `POST https://api.commandcode.ai/provider/v1/anthropic/v1/messages` → 404。GOAT 上游没有 anthropic 路由，请求必须交给认识该 path 的上游（`deepseek-official`，priority 0）。

根因是 `gateway.mjs` 中 `pathAllowed` 与它上方注释**语义相反**：

```js
// 注释说：有 key 认领 → 未声明 pathPrefixes 的 key 一律出局
function pathAllowed(keyEntry, pathname) {
  const pfx = keyEntry && keyEntry.pathPrefixes;
  if (!Array.isArray(pfx) || !pfx.length) return true;   // ← 实际：未声明 = 放行
```

后果：163 / qq（`pathPrefixes` 为 `None`）仍进入 `/anthropic/*` 候选集，priority 100 压过 official 的 0 → 选中 GOAT → 404。

修法：把「有人认领」这一上下文显式作为入参传入，不在无上下文的 helper 里猜默认值。

```js
function pathAllowed(keyEntry, pathname, claimed) {
  const pfx = keyEntry && keyEntry.pathPrefixes;
  if (!Array.isArray(pfx) || !pfx.length) return !claimed;
  return pathname ? pfx.some((x) => pathname.startsWith(x)) : true;
}
```

位置：`gateway.mjs:880`（`pathClaimed` 在上方 `gateway.mjs:868-872` 附近）。改后重启 pid 6308，实测请求正确落到 `deepseek-official`。

## 设计：显式认领制（不是黑名单）

- 没有任何 key 认领该 path → 全部 enabled key 照常参与，`/v1/*` 聊天路径逐位不变。
- 有 key 认领 → 该 path 上只保留认领者；未声明 `pathPrefixes` 的 key 一律出局。
- 取舍理由：GOAT 那两个 key 无需写任何配置就自动让开；避免「忘了给谁加配置 = 静默把请求送去错上游」的黑名单式坑。
- 唯一代价：认领者失效时**直接失败，不回退到 GOAT 上游**（由 T4 钉住）。

相关 helper 与调用点：

```js
function pathClaimed(keys, pathname)   // keys.some(k => k.pathPrefixes?.some(x => pathname.startsWith(x)))
function pathAllowed(keyEntry, pathname, claimed)
function modelSupported(keyEntry, model)  // 无 model（GET 等）恒 true，不参与过滤
// gateway.mjs:1565  selectKey 内：(k) => modelSupported(k, meta.model) && (!pathOwned || pathAllowed(k, meta.path))
// gateway.mjs:267   注释：pathPrefixes 语义见 pathAllowed()
```

配置形态（`keys.json`）：`deepseek-official prio=0 pathPrefixes=['/anthropic/']`；`163` / `qq` 的 `pathPrefixes=None`。

## 回归保护

新增 `D:\Toolbox\goat-gateway\selftest-path-prefixes.mjs`（端口 18792，6 项全 PASS）：

- T1 无人认领 pathPrefixes 时 `/anthropic/*` 仍由最高优先层服务
- T2 有 key 认领后 `/anthropic/*` 只走认领者，GOAT 零调用
- T3 认领不影响其它 path：`/v1/chat/completions` 仍落 GOAT 层
- **T4 认领者失效时返回失败而非回退到 GOAT 上游**（最值钱的一条：防止以后给 `selectKey` 加兜底逻辑时把 404 bug 悄悄放回来）
- T5 `/health` 逐 key 回显 pathPrefixes
- T6 没有 key 能服务时 400 诊断包含 path

四套合并回归口径：`selftest.mjs` 13 项 + `selftest-multiupstream.mjs` 6 项 + `selftest-quota-priority.mjs` 7 项 + `selftest-path-prefixes.mjs` 6 项，全部 exit=0。

## 顺带堵掉的安全洞

`gateway.mjs` 的 `stripClientHeaders` 原本只删 `host` / `authorization` / `content-length`，**`x-api-key` 会原样透传给上游**。而 `dsh-web-search-deepseek` 的 `authHeaders()` 同时发 `x-api-key` 和 `Authorization: Bearer`，客户端 key 会绕过 key 池直接漏到上游。已把 `x-api-key`（连同 `x-reasonix-` / `x-session-id` / `x-conversation-id` / `x-topic-id`）加进 Windows `config.json` 的 strip 列表。

## 阻塞点：官方 key 余额烧穿

`GET https://api.deepseek.com/user/balance` → `is_available: false`、余额为负。轨迹（10-01 下午 → 10-02 14:36）持续下滑至透支。

- 影响：`dsh-web-search-deepseek` 三个 profile **现在不能切到 gateway**（插件 schema 支持 `baseURL`，改成 `http://127.0.0.1:8788/anthropic/v1` 即可），否则每次 web search 都撞 402，比直连更糟。
- 归因：余额下降中 gateway 仅占约 ¥0.60（10-01 那 75 次官方调用，集中在 UTC 11–12，来自同一个 `deepseek-harness` 长会话）；约 ¥3.9 由 `web-search-deepseek` 直连烧掉——它用 `apiKeyEnv: DEEPSEEK_API_KEY` 读同一把 key，完全绕过 8788。
- 待用户决定 A：充值 → 立刻把 web_search 三个 profile 切到 gateway 并纳入 priority/冷却/余额管理；不充 → 建议 `deepseek-official` 设 `enabled: false`，避免 `/anthropic/*` 每次白撞 402 + 600s 冷却。
- 已观察到的自动行为：`FAIL ... status=402` → `COOLDOWN key=deepseek-official reason=quota status=402 for=600s` → `EXHAUSTED`。

## 待办：Linux 侧未同步

`tailscale status` 显示天阙 `offline, last seen 13h ago`；Tailscale IP `100.79.96.82` 与 LAN IP `192.168.1.13` 均 `Connection timed out`（ssh port 22 超时）。机器上线后需推：覆盖 `gateway.mjs` + `keys.json` 加 `pathPrefixes` + `config.json` 加 `x-api-key` strip，**保留 Linux 侧 `cooldownMs.unauthorized = 1800000`**。

## 另一处未决（倾向不动）

`quotaSync.minWeight: 0.2` 导致 163 事实独占：qq 月已用 99.6%（剩 0.29）、163 剩 10.62，让 163 独占恰好是正确的；倾向保持 `minWeight` 不变，等 qq 月度重置后再看。
