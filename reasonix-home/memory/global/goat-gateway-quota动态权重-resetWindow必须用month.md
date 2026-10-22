---
id: mem-53e0db4450ffa044a32296813c4625f6
revision: 1
created_at: "2026-10-04T12:14:36.195Z"
updated_at: "2026-10-04T12:14:36.195Z"
name: goat-gateway-quota动态权重-resetWindow必须用month
description: "goat-gateway 的 quota 动态权重窗口必须读 monthReset，用 weekly 会把优先级排反（2026-10-04 修正）"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 结论（2026-10-04 修正）

`D:\Toolbox\goat-gateway\config.json` 的 `quotaSync.resetWindow` **必须是 `month`**。
`gateway.mjs` 里对应 `const RW_COL = { fivehour:'fiveHourReset', weekly:'weeklyReset', month:'monthReset' }` 三选一。

## 为什么（踩过的坑）

2026-10-01 实现时，代码注释里写死了错误前提：「GOAT 只有 5h / weekly 两个 rolling window 带时间戳，
月度池属 billing cycle、没有日期」，据此把 `resetWindow` 定成 `weekly`，还写进了 config 的 note。

**前提是错的** —— `goat-usage.ps1 -Json`（经 `quota-http.mjs` 暴露在 `127.0.0.1:8790/quota`）一直在返回
`monthReset`。当时只探过 `/alpha/billing/credits` 就下了「服务端不给日期」的结论，没回头查自己家的 collector。

两个 GOAT 号的周/月远近顺序**可以相反**（2026-10-04 20:0x 实测）：

| 账号 | weeklyReset | monthReset | 月剩余 |
|---|---|---|---|
| 163 | 158.2h 后 | **75.2h 后** | 4.89 / 70（7%） |
| qq | **139.0h 后** | 713.3h 后 | 65.65 / 70（94%） |

⇒ weekly 口径把「优先烧快作废的额度」实现成了「优先烧刚充值的额度」：
当天 **5326 次请求全打 qq，163 只拿到 24 次**，而那 4.89 眼看要在 3 天后白白重置掉。

## 验证方式

- `selftest-quota-priority.mjs` 的 **T8** 专门钉死：故意让 `weeklyReset` 与 `monthReset` 顺序**相反**，
  只有真读 monthReset 才 PASS。反向验证（把 qsw 退回修复前写法）时 T8 精确失败：
  `月重置最近的 goatA 应拿满权重 5，实际 0.2`。
- 生产：`curl http://127.0.0.1:8788/health` 的 `quotaSync.detail` 应显示
  `163: 剩 75.1h -> w5.00` / `qq: 剩 713.1h -> w0.20`。

## 相关事实

- `strategy=session` 是**会话级粘性**：已绑定会话**不会**因权重变化而迁移（为保 prompt cache，
  命中 ¥0.02019/M vs 未命中 ¥1.0095/M，差 50 倍）。权重改动**只影响新会话**。
  要立刻生效就开新会话；`/_gateway/sessions` 可看绑定分布，`/_gateway/sticky?clear=1` 只清全局粘滞。
- 教训：**错误前提写进注释后会反过来束缚实现**。注释里的否定断言（「服务端不给 X」）必须可验证，
  否则半年后会被当成事实照抄。
