---
id: mem-39bcfe582eedacb91103bb3d44211a74
revision: 1
created_at: "2026-09-23T15:21:13.8484937Z"
updated_at: "2026-09-23T15:21:13.8484937Z"
name: commandcode-goat-额度查询端点与看板工具
description: Command Code GOAT 套餐额度（5小时/周/月）的官方端点与本地看板工具 goat-usage.ps1（2026-09-23 实测打通）
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论：能查，无需插件逆向，API key 直连即可

### 端点（2026-09-23 实测，Bearer = keys.json 里的 user_ 前缀 key）
- `GET https://api.commandcode.ai/alpha/billing/credits` → 200
  - `windowLimits.fiveHour` = {used, cap:14, resetAt(epoch ms), exceeded}
  - `windowLimits.weekly` = {used, cap:35, resetAt, exceeded}
  - `credits.monthlyCredits` = 本月**剩余**额度
  - `windowLimits.exceeded` / `credits.belowThreshold` 用于告警
- `GET https://api.commandcode.ai/alpha/usage/summary` → 200
  - `totalCredits` = 当前计费周期已用、`totalCount`/`totalTokens` 累计、`periodBasis=billing-period`
- `GET https://api.commandcode.ai/alpha/billing/subscriptions` → 200，planId=`individual-goat`，`currentPeriodStart/End`
- `GET https://api.commandcode.ai/provider/v1/models` → 200（另有 chat/completions）

### 月度上限的推导（关键）
`月额度 cap = summary.totalCredits(已用) + credits.monthlyCredits(剩余)`
实测两账号均 ≈ 70：163 = 38.75+31.27 = 70.02；qq = 36.29+33.70 = 69.99
→ GOAT 套餐额度结构：5小时 14 / 周 35 / 月 70（credits，按 API list price 折算）

### 不可用的路径（别再猜）
- `/internal/usage*`、`/internal/billing/*` → 401 {"code":"UNAUTHORIZED","message":"You're logged out"}：**只认网页 session cookie，不认 API key**
- 直接猜的 `/api/usage`、`/provider/v1/usage|me|quota|balance` 等全部 404
- chat/completions 响应头**不含** rate-limit 信息（只有 Cloudflare/Hono 头）→ 无法从调用响应推断额度
- 端点发现在 `https://commandcode.ai/settings/usage` 的 JS chunk 里（字面量 `/alpha/usage/summary`、`/internal/usage/summary`、chunk 名 `use-org-limits`、`monthly-usage-meter`、`plan-allowance-rows`）

### 已交付工具
`D:\Toolbox\goat-gateway\goat-usage.ps1`（读同目录 keys.json，多账号）
- 默认：三窗口进度条 + 百分比 + used/cap + 重置倒计时 + 本周期请求/tokens
- `-Brief` 单行（`[163] 5h 5% · 周 64% · 月 55%`，便于接状态栏）
- `-Json`（给外部消费）/ `-Watch N`（每 N 秒刷新）/ `-Key 163` / `-NoColor`

### 实测样例（2026-09-23 23:16）
163：5h 0.67/14（重置 00:22）、周 22.24/35（重置 09-27 07:53）、月 38.75/70.02 剩 31.27
qq：5h 0.34/14、周 1.29/35（重置 09-30 15:46）、月 36.29/69.99 剩 33.70
