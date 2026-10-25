---
id: "2932c579-9670-4cb7-b244-7edf4a23e9bb"
title: "goat-gateway priority 分层与 quota 动态权重实现上线（Windows + Linux 双机）"
description: "2026-10-01 实施交接：selectKey 的 priority 分层（官方 key 降为兜底层，含 tiers[0] 全冷却不降级 bug 及 T3 回归测试）与 quotaSync 四模式动态 weight（只写内存不回写 keys.json、resetSoon+weekly 口径落地）、双机 node 18 验证与真实路由证据、回滚路径，以及 minWeight 导致 163 事实独占的未决副作用。"
status: "active"
created_at: "2026-10-01T12:41:13.639Z"
updated_at: "2026-10-01T12:41:13.639Z"
content_hash: "7e38bd48d949097de10c06654d88f588a4628b0bb0a527356ddcf040f0b2242c"
source_paths:
  []
session_ids:
  - "969afa26-62ae-4bff-b941-9ccca71ac889"
memory_body_ids:
  []
---

# goat-gateway priority 分层 + quota 动态 weight（实现与双机上线）

**性质**：实施 + 上线交接记录。前置调查（GOAT 额度窗口模型、`/alpha/billing/credits` 只给 fiveHour/weekly 两个 `resetAt`、月度池无 resetAt、口径三选一未决）见 `63f90728-46ae-44fd-b637-f5d14424ba70`；多 upstream 改造与双机同版落地背景见 `dbffeb3a-718b-436e-b8f1-e4b9850f4b53`。本文只记录**这两项机制落地之后**的状态与坑。

**未决**：`quotaSync.minWeight` 是否从 0.2 上调到 1~3（见文末「副作用」），需用户拍板。

## 机制一：`priority` 分层（官方 key 降为兜底层）

- `keys.json` 每个 key 可写 `priority`（缺省 100，越大越优先）。
- `gateway.mjs` 的 `selectKey` 开头：`tiers = [...new Set(candidates.map(prioOf))].sort((a,b) => b-a)`，从高到低取**第一个含非冷却 key 的层**作为 `pool`；其后 `bound` / `held` / `fresh` / `scoreOf` 全部改为基于 `pool` 计算。
- 官方 key（`deepseek-official`）设 `priority: 0` ⇒ 只有在两个 GOAT 号（163 / qq）都进冷却时才被选中，符合「非必要不用官方」的用户要求。
- **踩坑并已修**：最初实现只取 `tiers[0]`，该层 key 全冷却时直接 `return null`，导致官方兜底永远轮不到、客户端拿 503 `gateway_all_keys_failed`。现版本逐层下探；`selftest-quota-priority.mjs` 的 **T3** 专门锁这条（断言前 3 个请求依次撞 3 个 GOAT key 拿 401，第 4 次转投官方并 200）。

## 机制二：quota 驱动的动态 `weight`

`config.json` 新增：

```json
"quotaSync": { "enabled": true, "url": "http://127.0.0.1:8790/quota",
               "intervalMs": 60000, "timeoutMs": 15000,
               "mode": "resetSoon", "resetWindow": "weekly",
               "minWeight": 0.2, "maxWeight": 5 }
```

- `mode` 四值：`used`（月已用比例高者权重大）/ `left`（反向）/ `resetSoon`（周期窗口 `resetAt` 更近者权重大）/ `resetLate`。
- **只写内存 `quotaWeights`，绝不回写 `keys.json`**（否则与 keys.json 的 mtime 热重载打架）；拉取失败静默回落静态 `weight`（selftest T6：quota-http 挂掉时 `ok=false` 但不影响路由）。
- 口径定为 `resetSoon` + `weekly` 是数据逼出来的：`/alpha/billing/credits` 只在 `fiveHour` / `weekly` 上给 `resetAt`，月度池属 billing cycle、服务端不给日期（`goat-usage.ps1` 月度 reset 写 null；探测的 15 个候选订阅端点全 404）。落地口径 = 用 weekly `resetAt` 近似「套餐结束时间」。

## 双机上线状态与验证

```
Windows  优先层 {'0': 1, '100': 2} | 163 wEff 5 | qq wEff 0.2 | official prio 0 wEff 1
Linux    is-active=active (systemd, node v18.19.1) | 同上
```

- 三套 selftest 全绿：`selftest.mjs`（13 项）+ `selftest-multiupstream.mjs`（6 项）+ `selftest-quota-priority.mjs`（7 项，T1 分层同层语义 / T2 低优先层零调用 / T3 逐层下探 / T4-T5 两模式权重 / T6 quota-http 挂掉 / T7 权重大者实际背更多会话）；Windows node 24 与 Linux **node 18.19.1**（`parsecheck` + SYNTAX OK）均通过。
- 真实路由：两台各发 3 个 `deepseek/deepseek-v4.1-flash` 请求，日志全为 `key=163 status=200`；Windows 侧原先绑在 `deepseek-official` 的会话被批量 `SESSION-BIND ... deepseek-official -> 163`（分层生效的直接证据）。
- Linux 本地差异 `cooldownMs.unauthorized = 1800000`（Windows 为 180000）在同步代码时需保住。
- 生效流程：`gateway.mjs` 的**代码**改动必须重启进程（keys.json 有 mtime 热重载但代码没有）；用 `restart-gateway.ps1`（停 8788 → 等端口释放 → `schtasks /Run /TN Goat-Gateway` → 校验新 PID，日志 `logs/restart-gateway.log`），由调用方在无活跃请求窗口触发，因为 dsh 自身模型调用走 127.0.0.1:8788。
- 回滚：Windows `cp gateway.mjs.rollback gateway.mjs` + `restart-gateway.ps1`；Linux 用 `gateway.mjs.bak-20261001-2038-pre-quota-priority-live`。配置备份：`config.json.bak-20261001-2038-pre-quota-priority-live`、`keys.json.bak-...`。

## ⚠️ 已知副作用（未决，等用户决定）

`scoreOf = load[k.name] / effWeight(k)` 取 min，但 `load` 是**历史累计绑定数**（163≈790、qq≈915），权重却是 5 / 0.2 ⇒ score ≈ 158 vs 4575。qq 要等 163 背到约 22575 个 session 才轮到，**实际等于 163 独占**（不是「163 更优先」）。

- 好处：163 的周额度先被烧掉，撞限后 163 进冷却、qq 自动顶上（priority 降级 + 冷却兜底都在）。
- 坏处：qq 长期闲置，且倾斜完全由 `minWeight: 0.2` 决定，无平滑。
- 收敛方案（无需改代码）：把 `quotaSync.minWeight` 提到 1~3，则 163 score ≈ 789/3 ≈ 263、qq = 915，163 仍约 3.5 倍占优但不碾压。

## 关键文件

`D:\Toolbox\goat-gateway\gateway.mjs`（~1642 行）、`config.json`、`keys.json`、`selftest-quota-priority.mjs`、`restart-gateway.ps1` / `stop-gateway.ps1`。
