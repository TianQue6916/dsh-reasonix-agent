---
id: "73b1209c-1ff7-46d7-8f4a-cd49baa882cd"
title: "CommandCode 续费扣款失败诊断：/alpha/* 端点全集、缺失的 invoice/portal 路由与「额度不重置」机制"
description: "2026-10-03 调查：CommandCode Provider API 实证只有 4 个 /alpha 端点（无 invoice/portal），Stripe 周期边界在续费时即推进而额度重置挂已付 invoice，故出现「周期已推进到 11-03 + status=active 但 monthlyCredits 停在 0.3059」；含定性步骤与「不要 cancel+重订阅」结论。补充文档 9de01166 的月度重置模型。"
status: "active"
created_at: "2026-10-03T06:12:51.385Z"
updated_at: "2026-10-03T06:12:51.385Z"
content_hash: "f453863ef4c8fa7473615d5364fa74f2387cb61a259552b49c1400fa22cb66d3"
source_paths:
  []
session_ids:
  - "bb17cf14-7a80-4960-ad8a-49570d3fb014"
memory_body_ids:
  []
---

# CommandCode 续费扣款失败诊断（2026-10-03）

**性质**：带实证的故障调查 + 可复用排查步骤。结论是「不是平台漏发额度，而是续费扣款未成功」，但截至记录时仍未最终定性（待账单侧证据）。
**关联文档**：`9de01166-059a-4a72-9413-233db3a11c49`（月度重置 = 订阅周期 currentPeriodEnd 的发现，本文是该模型的失败模式补充）、`63f90728-46ae-44fd-b637-f5d14424ba70`（GOAT 额度窗口模型）、`63920537-afab-454b-b365-0c70e74a206d`（goat-gateway path 认领机制）。

## 现象

- `GET /alpha/billing/subscriptions`：`status: active`、`currentPeriodStart 2026-10-03T05:18:45Z`、`currentPeriodEnd 2026-11-03T05:18:45Z`、`planId: individual-goat`、`cancelAtPeriodEnd: false`。
- `GET /alpha/billing/credits`：`monthlyCredits: 0.3059227899`（未补发），五年/周窗口正常（weekly 11.83/35）。
- 用户观察（m00001 内 checkpoint event 222）：钱没有被扣。
- 即「账单周期已推进 + 订阅仍 active，但月度额度停在旧值、usage 周期计数器却归零」。

## 机制结论（已修正的推理）

- `current_period_start/end` 描述**账单周期边界**，Stripe 在续费时刻就推进到下一周期，**与是否收到钱无关**；扣款失败时表现为 invoice 变 `open` + dunning 重试，而不是周期回退。⇒ **周期已前进不能证明付款成功**。
- `status: active` 也不是付款证明：异步支付方式（Alipay / crypto 等）存在「invoice 仍 `open`、subscription 仍 `active`」的窗口。
- CommandCode 的**额度重置挂在已付款的 invoice** 上，而 `usage/summary` 的周期计数器挂在**周期边界**上 ⇒ 续费未付款时二者背离，形成「周期推进了、额度被冻住」的失败模式。
- 第三方旁证（非权威，仅证实该失败模式真实存在）：llmgateway [PR #3832 fix(billing): recover subscription renewals](https://github.com/theopenco/llmgateway/pull/3832) —— "Unpaid renewals could advance the displayed renewal date and **freeze the remaining allowance**"，其后改为 "Paid invoices now control renewal dates and credit resets"。

## 端点实证：只有 4 个 /alpha 路由，无 invoice / portal

- 直接探测（GET/POST 均试）：`/alpha/billing/{portal, portal-session, create-portal-session, stripe/portal, manage, customer-portal, invoices, transactions, credit-grants, history, payment-methods}` → 全部 `404 ... is not a registered API route`。
- 反向核对：从 npm registry 拉取并解包第三方 CommandCode 用量插件 `dsh-commandcode-usage@1.2.0`、`commandcode-dash@0.1.8`、`opencode-multi-usage@0.1.1`（`commandcode-api-proxy@0.4.1` 额外用 `/alpha/generate`），其引用路径全集为：
  - `/alpha/whoami`
  - `/alpha/billing/credits`
  - `/alpha/billing/subscriptions`
  - `/alpha/usage/summary`
- ⇒ **账单管理（invoice / portal / 支付方式）只能在 CommandCode Studio 或 Stripe Customer Portal 侧完成，Provider API 侧读不到**。
- `dsh-commandcode-usage@1.2.0` 的口径说明（其源码注释）：月度数来自 `/alpha/usage/summary` 的账单周期聚合（`periodBasis: billing-period`），剩余额度用 `planLimit - credits.monthlyCredits` 反推。
- 顺带发现可用端点 `/alpha/whoami`（返回 `{success, user:{id,name,email,userName}, org}`），可用于区分多 key 身份；本次用于确认 qq/163 两个 key 属于不同账号（邮箱等个人可识别信息不在此存档）。
- 抓取 npm 包时 Windows Python 出现 `[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: Missing Authority Key Identifier`（多个包一致），需绕过/放宽校验才能下载 tarball。

## 定性步骤（一条命令够用）

1. https://commandcode.ai/billing → `Manage` → Stripe Customer Portal → **Invoices**：找续费日那张，判断 `Paid` / `Open` / `Uncollectible` / payment failed；同时看 Payment methods 状态。
   - `Open` / payment failed ⇒ 扣款失败，根因在支付环节。
   - `Paid` ⇒ 平台漏发额度。
2. 交叉验证：查收款邮箱收件箱（含垃圾邮件）的 Stripe / CommandCode 邮件（`Your payment … failed` 或 receipt / invoice paid）。
3. 提醒：跨境卡扣 USD、Alipay/crypto 通道入账与通知可能滞后数小时到 1–2 天，「银行里没看到」不足以定论。

## 修复路径与禁忌

- **捷径**：在 Customer Portal 更新支付方式后，Stripe 会对那张 open invoice 触发标准 dunning 重试；付成功 ⇒ 平台按已付 invoice 发额度，无需重新订阅。
- **不要 cancel + 重新订阅**：订阅仍 `active`，重订阅会新建 subscription 可能重复收费；官方 FAQ 明确计费日只能前移 (`Can I renew my subscription early? No`)，且有 *"Support can manually cancel the subscription to stop future retry attempts"* 说明存在重试窗口。
- 常见失败原因：卡过期/跨境 USD 风控拒/3DS(SCA) 未完成；Alipay 免密协议撤销或过期（renewal 依赖该协议）；crypto 钱包 USDC 不足；UPI 超 ₹15,000 mandate 需 PIN。
- 影响面：qq 侧 0.3059 credits ≈ 3 小时正常用量（按上周期 69.712 credits / 2,105,246,413 tokens 费率 ≈ 924 万 token）；耗尽后支付模型 pause 到周期重置，`gateway.mjs` 走 402 → `cooldownMs.quota = 600000`（10 分钟）→ failover 到 163，不硬挂但有延迟税。

## 相关路径与临时产物

- 网关与 key 配置：`D:\Toolbox\goat-gateway\gateway.mjs`、`keys.json`。
- 诊断临时目录：`D:\Toolbox\goat-gateway\.tmpdiag\`（docs 抓取 + npm 解包，约 2MB，可清）。
- 计划文件：`C:\Users\27063\.dsh\PLAN.md`。
