# GOAT 续费未生效 —— 诊断报告（2026-10-03）

## 一句话结论

qq 账号的 GOAT 订阅在 Stripe 侧**显示已续期到 2026-11-03**，但**既没有生成可见的续费 invoice，也没有任何扣款尝试**，
因此 Command Code 应用侧**没有补发本周期月度 credits**。三处证据一致 → 平台侧（Command Code / Langbase, Inc.）问题，用户无法自助修复。

## 账号

| 项 | 值 |
|---|---|
| email | 2706352190@qq.com |
| userId | db7679ce-2e11-4151-a2b3-791d1e3192dc |
| subscriptionId | sub_1UBT5UDSZgxV3MJK1nsJg7sU |
| priceId | price_1U0sTYDSZgxV3MJKUKHcvFxc |
| planId | individual-goat |
| 支付方式 | 支付宝（Alipay，以 CNY 收款） |
| 金额 | US$10.78 / 月（含 processing fee），首期 ¥75.32 |

## 证据

### A. API 侧：订阅已续期
`GET https://api.commandcode.ai/alpha/billing/subscriptions`（Bearer <qq key>）

    status             = active
    createdAt          = 2026-09-03T05:18:45.000Z
    currentPeriodStart = 2026-10-03T05:18:45.000Z
    currentPeriodEnd   = 2026-11-03T05:18:45.000Z
    cancelAtPeriodEnd  = false
    canceledAt / endedAt = null

### B. API 侧：月度 credits 未刷新
`GET /alpha/billing/credits`

    2026-10-02T16:03:55Z  monthlyCredits = 0.3059486899   (monthUsed 69.7122853091)
    2026-10-03T05:46:50Z  monthlyCredits = 0.3059486899   (monthUsed 0)
    2026-10-03T05:51:37Z  monthlyCredits = 0.3059227899

`GET /alpha/usage/summary` → totalCount 0, totalCost 0, totalCredits 0, periodBasis "billing-period"

即：周期计数器已按新周期归零，但月度额度池没有补发，数值一字未变。

对照账号 `163`（同期正常）：monthUsed 62.8210788879 + monthlyCredits 7.1537173251 = 69.975 ≈ 70

### C. Stripe Customer Portal（Studio → Billing → Manage）
- 当前订阅：Command Code GOAT 和 processing fee，US$10.78 / 每 1 个月
- **您的下一个账单日期是 2026年11月2日**（portal 按 PDT 显示 = 2026-11-03T05:18:45Z）
- 支付方式：支付宝
- **账单记录：只有一条 —— 9月2日 ¥75.32 / US$10.78 已付**（9月2日 22:18 PDT = 2026-09-03T05:18:45Z）
- 没有 10月2日 / 10月3日的 invoice

### D. 支付宝侧
- 免密支付 / 自动扣款协议**存在**
- 没有任何扣款记录，也没有失败记录

## 推断

Stripe 在续费时刻推进 `current_period_*` 是正常行为（账单周期边界与收款结果无关）。
但商户侧账单记录里**没有**那张 10-03 的 invoice，支付渠道里**也没有**扣款尝试 ——
说明这次续费 invoice 要么未 finalize、要么压根没生成。Command Code 的月度额度重置挂在"已付 invoice"上，
所以额度没发；而 `usage/summary` 挂在"周期边界"上，所以它归零了。两者错位。

按官方 FAQ（troubleshooting/faqs）："Subscription credits ... are refreshed when your subscription renews"。
本次续费事实上没有发生 → 额度不应被期待，但订阅状态又显示已续 —— 这是一个**内部不一致状态**。

## 请求（给 support 的诉求）

请检查 sub_1UBT5UDSZgxV3MJK1nsJg7sU 在 2026-10-03 这次续费的 Stripe 状态，并二选一：
1. 补收这笔续费并发放本周期的月度 credits；或
2. 明确告诉我那张 invoice 处于什么状态（draft / open / void / 不存在），以便我这边配合处理。

## 干过的、明确不是原因的东西

- key 本身有效：`POST /provider/v1/chat/completions` 用 qq key 返回 200
- API 无 invoice / portal 路由：`GET`+`POST` 试过 `/alpha/billing/{portal,portal-session,create-portal-session,stripe/portal,manage,customer-portal,invoices,transactions,credit-grants,history,payment-methods}` → 全部 404 `is not a registered API route`
- 第三方 Command Code 用量插件（dsh-commandcode-usage@1.2.0 / commandcode-dash@0.1.8 / opencode-multi-usage@0.1.1 / commandcode-api-proxy@0.4.1）只用 4 个 endpoint：`/alpha/whoami`、`/alpha/billing/credits`、`/alpha/billing/subscriptions`、`/alpha/usage/summary` ⇒ 账单查询只能在 Studio/Stripe 侧

## 本地影响（D:\Toolbox\goat-gateway）

- qq 剩余 0.3059 credits，按上周期费率（69.712 credits / 2,105,246,413 tokens）≈ 924 万 token
- 周期计数器滚动后 qq 已基本不可用，`gateway.mjs` 会 402 → `cooldownMs.quota` 10 分钟 → failover 到 163
