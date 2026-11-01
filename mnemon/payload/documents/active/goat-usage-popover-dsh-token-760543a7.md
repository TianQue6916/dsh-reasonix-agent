---
id: "760543a7-6b4a-44d2-8d24-01dbf0020d70"
title: "GOAT 面板 usage/节奏视图扩展 + popover 不透明化（dsh 主题 token 的半透明陷阱）"
description: "2026-10-29 实施记录：给 goat-panel 的 /quota popover 增加用量与节奏两行（tokens 出入拆分、成功率、均 cr/次、日均消耗、可撑天数），以及把半透明背景改成「实色打底 + gradient 叠主题色」的根因与做法。含 /alpha/usage/summary 的 daily 字段恒空的探测结论、D 盘只读需 UAC 提权的 apply 流程与备份 stamp 教训。"
status: "active"
created_at: "2026-10-28T17:16:41.725Z"
updated_at: "2026-10-28T17:16:41.725Z"
content_hash: "d4b4fb8a108c967a837e579936c2e5d0fa96075efb9a3cd7965ab6b6acc4511e"
source_paths:
  - "goat-usage.ps1"
  - "dsh-plugin-goat-panel/lib/client.js"
  - ".dsh/scratch/goat-panel-usage/apply-usage-view.ps1"
  - ".dsh/scratch/goat-panel-usage/apply-client-only.ps1"
session_ids:
  - "f68c5a09-2c99-470c-84da-ecb57a11b806"
memory_body_ids:
  []
---

# GOAT 面板 usage/节奏视图 + popover 不透明化

**性质**：实施 + 排障记录（2026-10-29）。两个改动同落在 `D:\Toolbox\goat-gateway`，均已 apply 并通过 sha256 校验。
**关联文档**：
- `9de01166-059a-4a72-9413-233db3a11c49` —— `periodStart` / `currentPeriodEnd` 的来源（本文的节奏行直接吃这两个字段）
- `84ba645c-8ee3-4cb2-9703-ebd0efe73a09` —— `file:` vs `link:` 导致插件源码改动不生效
- `878bd757-1e82-4db3-be40-956d74971f80` —— Linux 侧去 PowerShell 化的 quota 实现

## 一、/quota 数据层新增字段

`goat-usage.ps1` 在原有 summary 字段外补 7 个：`tokens`、`tokensIn`、`tokensOut`、`requests`、`successRate`、`avgCost`、`periodStart`。实测响应（`http://127.0.0.1:8790/quota?force=1`）关键值：`tokensIn: 2380208643`、`tokensOut: 21458967`、`requests: 16592`、`periodStart: 1791004725000`。

## 二、popover 从 3 行扩到 5 行

| 位置 | 内容 |
|---|---|
| badge | `GOAT 5h 10% · 周 80% · 月 67% · ¥2.99` |
| 行 1 | 三窗口百分比（阈值染色）+ 剩余 credits |
| 行 2 | 各窗口 used/cap 绝对值（原有） |
| 行 3（新） | 请求数 · tokens（入/出拆分）· 成功率 · 均 cr/次 · 均 tok/次 |
| 行 4（新） | 日均消耗 · 计费周期进度 · 剩余可撑天数 + 三档预警 |
| 行 5 | 窗口重置：绝对时刻 + 倒计时 |

`goat-usage.ps1` 的终端文本模式同步加了 tokens 出入拆分与日均行；`-Brief`（`goat-tray.ps1` / reasonix 状态栏）不受影响。

## 三、节奏行的推导（没有日粒度数据源）

`/alpha/usage/summary` 有个 `daily` 字段看似按天明细，但**恒为空数组** —— 用 `?days=7`、`?groupBy=day`、`?period=day`、`?include=daily` 四种参数各打一次，全部返回 `daily: []`。所以「今天用了多少」「最近 7 天 sparkline」没有数据源，未硬编。

改走的离线推导（缺任一侧输入就整段省略，不显示猜测值）：

```
perDay  = monthUsed / (now - periodStart)
canLast = monthLeft / perDay
```

`periodStart` 来自 summary，`periodEnd` 来自 `/alpha/billing/subscriptions` 的 `currentPeriodEnd`。判定档位：`canLast / 剩余天数 ≥ 1.3` → 绿·宽松；`≥ 0.85` → 黄·刚好够；否则红·会撞上限。

## 四、popover 半透明糊字的根因（dsh 主题 token 陷阱）

从 `app.asar` 内联 CSS 里量到的实际定义：

```css
--dsw-menu-surface-fill: #43454a73;   /* 深色主题，alpha 0x73 ≈ 45% */
--dsw-menu-surface-fill: #f8f9fa94;   /* 浅色主题，alpha 0x94 ≈ 58% */
--dsw-specific-menu: var(--dsw-menu-surface-fill);
--dsw-menu-backdrop-filter: blur(40px) saturate(150%);
```

dsh 自己的 panel 敢用 45% 透明，是因为它们同时挂了 `backdrop-filter: var(--dsw-menu-backdrop-filter)` —— 半透明 + 背景模糊才「透而可读」。goat-panel 的 popover 只抄了 `background: var(--dsw-specific-menu)` 而**没抄 `backdrop-filter`**，于是等于 45% 不透明度 + 背后文字原样透上来；3 行短内容尚可忍，加到 5 行后糊成一片。

**做法**（不硬编颜色，保持跟随主题明暗）：

```js
backgroundColor: "var(--dsw-alias-bg-base, #17191f)",         // 主题实色底，alpha 恒为 1
backgroundImage: "linear-gradient(var(--dsw-specific-menu, #262a34), var(--dsw-specific-menu, #262a34))",
border: "1px solid var(--dsw-alias-border-l3, rgba(255,255,255,.16))",
```

关键点：`linear-gradient` 是**合成**而非取平均 —— 带 alpha 的顶层色混在 alpha=1 的实色之上，最终 pixel alpha 恒为 1，既不透出背后对话，色调仍随主题。实测量到的最终色：深色 `#151517` + `#43454a`@45% ≈ `#2A2B2E` 炭灰；浅色 `#FFFFFF` + `#F8F9FA`@58% ≈ `#FBFCFC` 灰白。

顺带把两处硬编色换成 token，避免浅色主题下看不见：
- 面板边框：`--dsw-alias-border-l1`（深色仅 6% 白，太淡）→ `--dsw-alias-border-l3`（深色 `#ffffff29` = 16% 白，与 dsh 官方 `--dsw-elevation-stroke-color` 同档）
- 行间分隔线：`rgba(255,255,255,.08)` 硬编 → `--dsw-alias-border-l1`（浅色自动变黑 6%）

## 五、D 盘只读 → UAC 提权 apply 流程

本 session 对 `D:` 写权限被限（python / powershell / str_replace_editor 三条路都是 EPERM），可写范围只有 `C:\Users\27063`。沿用两轮的做法：

1. 改动先在 `C:\Users\27063\.dsh\scratch\goat-panel-usage\new\` 暂存，dryrun 只打印 would-write
2. apply script 走一次 UAC 提权，只做「backup + copy 两个文件」，不碰注册表 / 服务 / 系统目录
3. 用 sha256 双向比对暂存版与落地版确认一致（本文两轮：`a8e440d1…` 的 `goat-usage.ps1`、`5a5f6fe0…` → `626c5f45…` → `da4089e4…` 的 `client.js`）

**教训**：备份名最初固定，第二次 apply 时 `-Force` 会把「原始版备份」覆盖成「上一版」，回滚点悄悄丢失。现改为 `Test-Path` 判重 + 每轮文件名带各自 stamp（`.bak-<date>-pre-usage-view` / `-pre-opaque` / `-pre-opaque-border`）。

**状态**：两处改动已落地，前端为 client bundle、不参与 HMR，需 `Ctrl+R` 或重启 dsh 客户端才见新 UI。用户随后表示「暂时不修改了」，badge 仍是 `background: transparent`（是否改成实色胶囊未定），`sandboxMinutes`（`usedMinutes: 0 / limitMinutes: 0`）协议空转、未进 UI。
