---
id: "63f90728-46ae-44fd-b637-f5d14424ba70"
title: "Command Code GOAT 额度窗口模型（官方文档确证）与 goat-gateway quota priority 调查"
description: "2026-10-01 调查：从官方 usage-limits 文档确证 GOAT 套餐 5h/weekly 滚动窗口与额度表（$70/$14/$35），实测 /alpha/billing/credits 只有 fiveHour/weekly 两个 resetAt、月度池无 resetAt，quota 动态 weight 的口径冲突与三选一待用户确认。"
status: "active"
created_at: "2026-10-01T12:22:33.050Z"
updated_at: "2026-10-01T12:22:33.050Z"
content_hash: "f87ec2dcd6a77038fed037870b4255d2e0a29cbe8438a4dcfe0af57029b44c06"
source_paths:
  []
session_ids:
  - "5b76d809-7539-4eca-9712-26f279883bce"
memory_body_ids:
  []
---

# Command Code GOAT 额度窗口模型 + goat-gateway quota priority 调查

**性质**：带实证的调查记录 + 未决口径（结论是「数据层面拿不到月度重置时间」，需用户确认口径）。
**关联文档**：额度耗尽不进冷却与本地免费额度查询路径见 `fb4a6e22-1db0-406a-bd62-9d693e968f7a`；gateway.mjs 多 upstream 改造与上线顺序见 `dbffeb3a-718b-436e-b8f1-e4b9850f4b53`；设计背景见 `d719aa02-0f0c-44f0-9480-4930f70bc058`。

## 一、官方文档确证 GOAT 额度模型（一手来源）

来源：`https://api.commandcode.ai/docs/resources/usage-limits`（Next.js 文档站，抓取全文 277KB，另存本地）。

原文要点：
- "Your monthly credits, paced so they last the whole cycle. Every plan adds two rolling windows on top of its monthly credits: a 5-hour cap and a weekly cap."
- "**Rolling from first use. No fixed clock. No calendar boundary.** A window opens on your first request and resets exactly 5 hours (or 7 days) later."
- 窗口内用量**不跨窗口结转**，每个新窗口从 0 起。
- Extra / pay-as-you-go credits **不计入窗口、永不受限、且超限时优先扣**，用来保住月池。
- 只有两个 window **有重置时间**；**月度池没有重置时间**，它属于 billing cycle，文档只在 "downgrades take effect at your next billing cycle" / "next renewal" 这类措辞里出现。
- 官方超限提示形如 "You've reached your 5-hour usage limit for your plan. Your limit resets at 3:00 PM."，`/usage` 显示 5-hour / Weekly 两条百分比 + 倒计时。

| Plan | 月费 | Monthly credits | 5h cap | Weekly cap |
|---|---|---|---|---|
| Go | $1 | $10 | $2 | $5 |
| **GOAT** | **$10** | **$70** | **$14** | **$35** |
| Pro | $20 | $80 | $16 | $40 |
| Max 10× | $100 | $150 | $45 | $90 |
| Max 20× | $200 | $300 | $90 | $180 |
| Team Pro | $40 | $40 | $12 | $24 |

实测 `/quota` 得 `fiveHourCap=14` / `weeklyCap=35` / `monthCap≈70` — 与文档逐位吻合。

## 二、`GET /alpha/billing/credits` 的真实字段（数据边界）

```
credits:      { monthlyCredits, purchasedCredits, freeCredits, creditThreshold, belowThreshold }   ← 纯数值，无时间
windowLimits: { limited, exceeded,
                fiveHour: { used, cap, exceeded, resetAt },
                weekly:   { used, cap, exceeded, resetAt } }                                      ← 只有这两个 resetAt
summary.periodBasis = "billing-period"                                                            ← 唯一周期痕迹，不给日期
```

- 月度**既没有 windowLimit 条目，也没有 resetAt**。
- 探了 15 个候选订阅端点（`/alpha/billing/subscription`、`/alpha/subscription`、`/alpha/plan`、`/alpha/account`、`/alpha/me`、`/alpha/billing/period` …）**全部 404**；`/docs` 无 openapi.json。
- 直连 `raw /alpha/billing/credits` 对 163 返回 `HTTP Error 403: Forbidden b'error code: 1010\n'`（Cloudflare 拦截）；可用路径是走 gateway 的缓存结果。
- 账号清单：`163`(weight 1)、`qq`(weight 3)、`deepseek-official`(weight 1)。

实测（resetAt 已换算 UTC+8）：

| key | fiveHour.resetAt | weekly.resetAt | 月已用比例 |
|---|---|---|---|
| 163 | `0`（窗口未开） | 2026-10-04 09:53 | 82.9% |
| qq | 2026-10-02 00:14 | 2026-10-07 17:05 | 99.4% |

## 三、未决口径：两种判据方向相反

用户澄清（原话）：「**月额度更近指的是套餐结束的时间**」——即按套餐/订阅周期结束时间排序，而不是按「月已用比例」。
但两种可计算判据冲突，未做猜测：

- 按「月已用比例高」→ **qq 优先**（与用户手设 qq `weight: 3` 方向一致）
- 按「weekly 窗口结束更近」→ **163 优先**（比 qq 早 3 天 7 小时）

三条候选路径：
- **(A)** 用 `weekly.resetAt` 当「套餐窗口结束」的代理（API 唯一可得的时间，每周滚动）
- **(B)** 在 `keys.json` 手工填 `cycleEndsAt`（毫秒时间戳），网关按「谁先到就优先用谁」算权重
- **(C)** 回到「月已用比例」（原实现，与 `weight:3` 方向一致）

待用户回答：(1) 他看到的「套餐结束时间」显示在哪里（GOAT CLI `/usage` / Studio Billing / 已知续费日）；(2) 两个账号各自的具体续费日期。

## 四、patch 状态（生产未受影响）

- `D:\Toolbox\goat-gateway\_patch-quota-priority.py`：11 处全部命中 1 次；`gateway.mjs` 1465 → 1592 行；`node --check` SYNTAX OK。
- 备份（TS `20261001-2018`）：`config.json.bak-20261001-2018-pre-quota-priority`、`gateway.mjs.bak-20261001-2018-pre-quota-priority`、`keys.json.bak-20261001-2018-pre-quota-priority`。
- `priority` 分层（官方降级）已实现，旧的 19 项测试全绿。
- quota 动态 weight（`mode: 'used'`）已实现但**口径待确认**。
- **未重启**：运行中的进程仍是旧代码；`keys.json` 也还没加 `priority`。

## 复用要点

1. GOAT 额度的权威口径只存在于文档站与 `/alpha/billing/credits`；**月度池重置时间不可从 API 取得**，任何「月周期结束」都需要外部信息（用户提供日期）或 weekly 窗口代理。
2. 判断「谁快用完」时要先明确口径（月池比例 vs 窗口结束时间），两者在本例中给出相反结论。
3. Windows 上抓取 Cloudflare 后的文档站要留存全文再 grep，脚本 chunk 引用（`/docs/_next/static/chunks/*.js`）本身不含正文。
