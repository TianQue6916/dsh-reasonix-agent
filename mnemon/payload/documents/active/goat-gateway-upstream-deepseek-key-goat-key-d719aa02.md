---
id: "d719aa02-0f0c-44f0-9480-4930f70bc058"
title: "goat-gateway 单实例多 upstream：官方 DeepSeek key 与 GOAT 套餐 key 平级入池（设计交接）"
description: "2026-10-01 完成的 goat-gateway 改造设计：把官方 DeepSeek key 作为与 GOAT 套餐 key 平级的 upstream 成员接入同一 selectKey 调配池。含实测硬边界（官方仅 2 个模型、余额约 ¥5.53）、gateway.mjs 七处改动清单、shadow 实例验证链，以及余额耗尽行为的未决三选一。"
status: "active"
created_at: "2026-10-01T06:17:55.940Z"
updated_at: "2026-10-01T06:17:55.940Z"
content_hash: "2e3bf96bb3775587b1b73b39b6625de765e8d0cb19e51d8f26699750f3f38690"
source_paths:
  []
session_ids:
  - "b2449a5b-cb3d-44cc-96b1-f57163e28b1a"
memory_body_ids:
  []
---

# goat-gateway 单实例多 upstream：官方 key 平级入池

**性质**：可复用的架构设计 + 实施交接（设计已完成、代码未改）。适用于「在既有 key 轮换网关里增加一条异源 upstream」这类需求。
**日期**：2026-10-01（实测数据为当日值）。
**主文件**：`D:\Toolbox\goat-gateway\gateway.mjs`（约 1215+ 行，Windows 进程 16496 在跑）。

---

## 1. 用户意图

用户明确要求：官方 DeepSeek API key（`sk-a46…`，35 字符）**不是兜底小弟，而是与 GOAT 套餐 key 平级**，接入「自动调配 key 的那个东西」，地位和 goat 等价。
→ 对应方案是**单实例多 upstream（同一网关实例、同一 key 池、同一 `selectKey()` 策略）**；A/B/C 三种形态中只有这种满足「自动调配」。

## 2. 现有实现（改造前事实）

- key 池由 `D:\Toolbox\goat-gateway\keys.json` 定义；每 key 可带 `enabled / weight / note`（`loadKeys()` L159）。
- 选 key 核心 `selectKey(candidates, fp, prefixFp)`（L496-565），策略 `session`（默认）/ `prefix` / `round-robin` / `sticky`：
  - session 绑定存 `state.sessions[fp]`；新会话按 `score = 绑定会话数 / weight` 取最小者，并列时用 `fingerprintBucket(fp, n)` 决定性分配 → 加权均衡（2026-09-29 引入，全 weight=1 时与旧「取负载最小」逐位等价）。
  - 冷却由 `state.keys[name].cooldownUntil` 控制，`isCooling()` / `applyCooldown()` / `clearCooldown()`（L272-325），**按 key name 索引，天然支持新增 key 名**。
- `handle()`（L1095+）重试循环用 `attemptsPerKey` / `maxAttemptsPerRequest`，候选池来自 `loadKeys().filter(k => k.enabled)`。
- 套餐级故障已有专门 taxonomy：403 + `isModelNotInPlan()`（L280）时**不打冷却**，直接回传上游 403（`PLAN-BLOCKED` 日志）——避免「所有 key 一起被打死」。
- `/v1/models` 被 `loadModelAllowlist()`（L208）按 `model-allowlist.json` 过滤：上游列 86 个，白名单保留 61 个可服务模型，其余 25 个本套餐 403 `MODEL_NOT_IN_PLAN`。白名单 mtime 热重载，无需重启。
- 运行形态：Windows 由计划任务 `Goat-Gateway` + `Goat-Gateway-Watchdog` 托管（改完 `gateway.mjs` 无需手动重启，watchdog 拉起）；Linux 天阙侧为 systemd user unit `goat-gateway.service`。`GATEWAY_CONFIG` / `GATEWAY_KEYS` / `GATEWAY_STATE` / `GATEWAY_LOG_DIR` 已提供实例隔离口子（L19-20），可起 shadow 实例。
- 观测面：`/_gateway/health`（含每 key 的 ok/fail/cooldown/lastError）、`/_gateway/reload`、`/_gateway/reset`、`/_gateway/sticky`。

## 3. 实测硬边界（改变了「等价」的判断）

| 维度 | GOAT key（163 / qq） | 官方 key（sk-a46…） | 等价？ |
|---|---|---|---|
| upstream | `api.commandcode.ai/provider/v1` | `api.deepseek.com` | 改 `forward()` 即可 |
| 认证头 | `Bearer user_…` | `Bearer sk-…` | ✅ 同形态 |
| 可服务模型 | 61 个 | **2 个**（`deepseek-flash`、`deepseek-v4-pro`） | ❌ 硬边界 |
| 模型 id | `deepseek/deepseek-v4.1-flash`（带 vendor 前缀） | `deepseek-flash`（裸 id） | ❌ 需 modelMap |
| 计费 | 套餐（包月） | 按量，余额约 **¥5.53**（2026-10-01 查询） | — |
| 配额来源 | `goat-quota-http` / mcp-goat-quota | 官方 `/user/balance` | — |

官方 `/v1/models` 实测：`deepseek-flash` = DeepSeek-V4.1-Flash（ctx 1048576，max_out 393216，input text+image）、`deepseek-v4-pro`（input text）。
用户日常默认模型 `deepseek/deepseek-v4.1-flash` 恰在官方可服务集合内 → 官方 key **每个主流量请求都是候选**，按均衡会稳定吃掉约 1/3 新会话；¥5.53 按 v4.1-flash 输出价折算约 2.7M 输出 tokens，几个长会话即见底。
Linux 天阙那把是**另一把**官方 key（`sk-4e6…`），余额未查。

## 4. 改动清单

**`keys.json`**（GOAT 两个 key 一行不改，向后兼容）：

```json
{
  "name": "deepseek-official",
  "key": "sk-…",
  "enabled": true,
  "upstream": { "origin": "https://api.deepseek.com", "basePath": "" },
  "models": ["deepseek/deepseek-v4.1-flash", "deepseek/deepseek-v4-pro"],
  "modelMap": {
    "deepseek/deepseek-v4.1-flash": "deepseek-flash",
    "deepseek/deepseek-v4-pro": "deepseek-v4-pro"
  }
}
```

约定：`models` 写**客户端 id**（dsh 发什么就写什么），`modelMap` 负责翻译成上游 id。

**`gateway.mjs`**（7 处，全在既有函数内，不新增顶层概念）：

| 位置 | 现状 | 改成 |
|---|---|---|
| L117 / L149 `upOrigin` | 全局单例 | `resolveUpstream(key)` → `{origin, basePath}`，缺省继承 `CFG.upstream` |
| L121-144 `makeAgent/getAgent/resetAgent` | 单 agent | `Map<originKey, Agent>`（keep-alive 连接绑 origin，必须分开） |
| L631 `mapPath(url)` | 用 `CFG.upstream.basePath` | `mapPath(url, up)` |
| L642 `forward()` | 用全局 `upOrigin` / `getAgent()` / `getTransport()` | 从 `keyEntry` 解析 |
| L695 `headers.authorization` | `Bearer ${keyEntry.key}` | **不动**（两边同形态） |
| L1135 `const all = loadKeys()…` | 只过滤 `enabled` | 加一维 `modelSupported(k, meta.model)` |
| `forward()` 内 body | 原样转发 | 命中 `modelMap` 时改写 `body.model` 并重算 `content-length` |

`/v1/models`（L1101）**不用动**：GOAT 白名单 61 个是官方 2 个的超集，dsh 看到的列表不变。`state.json` 冷却按 key name 索引，天然支持新 key。

## 5. 未决决策（阻塞实施）

**余额烧完之后的行为**：官方 key 将返回 402，`cooldownMs.quota` 为 600s → 每 10 分钟复活一次、吃一次失败、再冷却，永久占一个候选位（同类故障教训见 `forward()` 附近关于「两个 key 一起被打死」的注释）。

- **(a) 自动 disable**：网关检测 402/余额耗尽后把该 key 置为不可用并写回 state（约 15 行），重启后仍需手动清；
- **(b) 手动开关**：余额见底时手改 `enabled: false`，keys.json mtime 热重载立即生效；
- **(c) 不设闸门**：任其轮询，会污染 `/_gateway/health` 与日志（不推荐）。

另待确认：是否在实施时一并查 Linux `sk-4e6…` 的余额并按各自余额设定 `weight`。

## 6. 验证链（shadow 实例，不碰生产）

```bash
GATEWAY_CONFIG=config.shadow.json GATEWAY_KEYS=keys.shadow.json \
GATEWAY_STATE=state.shadow.json GATEWAY_LOG_DIR=logs-shadow \
node gateway.mjs          # 起在 8799
```

1. `/health` 应列出 3 个 key；
2. 发 deepseek 请求 → 日志出现 `SESSION-BIND … deepseek-official`，且上游收到 `model=deepseek-flash`；
3. 发 `gpt-6-luna` 请求 → 日志中 official 永不出现（`modelSupported` 挡住）；
4. `/v1/models` 与生产逐字节一致。

## 7. 相关文档

- `fa611c46-9dc6-42aa-93a8-1002be2468bd` — dsh-mnemon subagent catalog/persona 修复与 **goat-gateway 403 taxonomy**（`PLAN-BLOCKED` / `MODEL_NOT_IN_PLAN` 不打冷却的既有设计来源）。
