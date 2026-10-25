---
id: "9de01166-059a-4a72-9413-233db3a11c49"
title: "GOAT 月额度重置 = subscription billing period（/alpha/billing/subscriptions 端点发现与两层修复）"
description: "2026-10-02 调查与修复：GOAT「月限额」重置时间不在 /alpha/billing/credits，而在复数端点 /alpha/billing/subscriptions 的 currentPeriodEnd（=订阅周期，锚订阅创建日而非自然月）。含端点表定位来源、两账号实测周期、goat-usage.ps1 + goat-panel client.js 两层修复与验证输出。修正文档 63f90728 的「月度无 resetAt」结论。"
status: "active"
created_at: "2026-10-02T08:29:12.176Z"
updated_at: "2026-10-02T08:29:12.176Z"
content_hash: "4bc85b036438344fe47d3bdba3510909e96f3479fa21994331637c5d7d3f8a52"
source_paths:
  - "goat-usage.ps1"
  - "dsh-plugin-goat-panel/lib/client.js"
  - "quota-http.mjs"
session_ids:
  - "702ce91f-bcb5-4617-8a7e-f7fe3fd3d59f"
memory_body_ids:
  []
---

# GOAT 月额度重置 = subscription billing period

**性质**：带实测证据的端点调查 + 两层实现交接（数据层已生效，面板层待重启）。
**关联文档**：
- `63f90728-46ae-44fd-b637-f5d14424ba70`（GOAT 额度窗口模型与 quota priority 调查）—— 该文档基于 `/alpha/billing/credits` 得出「月度池无 resetAt」，**本次调查已修正该结论**：不是上游不给，是查错了端点。
- `fb4a6e22-1db0-406a-bd62-9d693e968f7a`（额度耗尽不进冷却）、`63920537-afab-454b-b365-0c70e74a206d`（path 认领机制）—— 同仓库不同主题，无重叠。

## 结论

**月额度 = subscription 的 billing period，锚在订阅创建日，不是自然月。** 所以两个账号的「月」边界可以相差数天（163 锚 7 号、qq 锚 3 号）。

## 真端点

`GET /alpha/billing/subscriptions`（**复数**；单数 `/alpha/billing/subscription` → 404，曾据此误判「上游不提供月重置」）。base = `https://api.commandcode.ai`。

端点表来源：主站打包产物 `constants-BIiutYbN.js` 里 `BILLING:{CREDITS:"/alpha/billing/credits", SUBSCRIPTIONS:"/alpha/billing/subscriptions"}`。同目录 `studio-Bg0LPQjd.js` 的 i18n 变量名佐证 UI 出处：`monthlyPlanUsage / resetsOnValue / currentBillingMonth / currentBillingDate / billingPeriod / currentPlanPriceCredits`。

实测响应（`planId` 均为 `individual-goat`，`status=active`）：

| 账号 | currentPeriodStart (UTC) | currentPeriodEnd (UTC) | 本地 (UTC+8) |
|---|---|---|---|
| 163 | 2026-09-07T15:15:05Z | 2026-10-07T15:15:05Z | **10/07 23:15** |
| qq | 2026-09-03T05:18:45Z | 2026-10-03T05:18:45Z | **10/03 13:18** |

163 的 10/07 与前端控制台显示的「10月7日 重置」逐字吻合（用户截图为证）。

## 机制（关键）

- `/alpha/billing/credits` 返回的 `windowLimits` 键只有 `limited / exceeded / fiveHour / weekly`，只有 fiveHour 与 weekly 带 `resetAt` —— 那是**限流窗口**，与月额度是 API 层面两个不同的东西。
- `credits` 里另有 `belowThreshold / creditThreshold / monthlyCredits / purchasedCredits / freeCredits`，同样没有月重置时间；没有 `month` 键。
- 旁证：`/alpha/usage/summary` 的 `periodBasis: "billing-period"` 指的就是这个订阅周期。
- 教训：`windowLimits` 里找不到 ≠ 上游没有；先在产品打包产物里找端点表再下结论。

## 已修（两层，各留 .bak）

`D:\Toolbox\goat-gateway` **不是 git repo**，回滚靠 `*.bak-20261002-162524-pre-monthreset`。

1. **数据层** `goat-usage.ps1`（5 处替换）：`Get-Usage` 内新增拉取 subscriptions 取 `currentPeriodEnd` → 输出字段 `monthReset`（epoch ms；请求失败降级 `$null`，不致命）；official 行补 `monthReset = $null`；`Render` 的窗口表把「本月」项的 `reset` 从 `$null` 改为 `$r.monthReset`；文档注释写明该端点语义。
2. **面板层** `dsh-plugin-goat-panel/lib/client.js`：「窗口重置」行后追加
   `` (r.monthReset ? " · 月 " + fmtReset(r.monthReset) : "") ``，`node --check` 通过。
   （该文件里「窗口重置：5h … · 周 …」是按 `\uXXXX` 转义写的，patch 必须用转义形式精确匹配，否则 expected 1 match, got 0。）

## 验证（`-Force` 绕过缓存）

```
163  monthReset=1791386105000 -> 2026-10-07 23:15:05
qq   monthReset=1791004725000 -> 2026-10-03 13:18:45
deepseek-official  null
```

`curl "http://127.0.0.1:8790/quota?force=1"` 同样透传（`quota-http.mjs` 只 `execFileSync` ps1 后原样包装为 `{ok, ts, rows}`）。

## 生效条件与遗留

- 数据层**已生效**（curl 可见）。面板要显示成 `窗口重置：5h … · 周 … · 月 10/07 23:15` 仍需**重启 dsh web**（当前 3080 仍是 PID 28480，12:48 的旧代码）。
- qq 在 10/03 13:18 月额度重置回满，此前月剩 0.31 属正常，不是异常。
- assistant 提议但用户未答复：把 `dsh-plugin-goat-quota/lib/index.js` 的 `goat_quota` 工具与 `mcp-goat-quota.mjs` 也补上月重置（这两处目前只显示 5h/周重置，月只显示「剩 x」）。
