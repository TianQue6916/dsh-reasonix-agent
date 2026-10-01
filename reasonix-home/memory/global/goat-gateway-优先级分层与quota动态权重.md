---
id: mem-cd0bf89f9e9210447bd07e5fafd088a7
revision: 1
created_at: "2026-10-01T12:40:00.036Z"
updated_at: "2026-10-01T12:40:00.036Z"
name: goat-gateway-优先级分层与quota动态权重
description: "gateway.mjs 的 priority 分层（官方 key priority:0 降为兜底）+ quota 驱动的动态 weight（mode=resetSoon/weekly），含已知的「163 独占」副作用与运维命令"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# goat-gateway 优先级分层 + quota 动态权重

**取代** fact `goat-gateway-多上游-官方key与goat平级入池` 中「官方 key 与 GOAT 平级入池」的表述 —— 2026-10-01 晚起官方 key 已降为 priority 0 的兜底层。多上游改造本体（resolveUpstream / agents Map / keys.json 的 upstream+models+modelMap 字段）仍然有效。

## 机制一：priority 分层
- `keys.json` 每个 key 可写 `priority`（缺省 100，**越大越优先**）；`loadKeys` 的 `.map()` 必须把它带出来，否则静默丢失
- `selectKey` 开头的 `tiers = [...new Set(candidates.map(prioOf))].sort((a,b) => b-a)`，然后**选第一个含有非冷却 key 的层**作为 `pool`，后续 `bound`/`held`/`fresh`/`scoreOf` 全基于 `pool`
- ⚠️ **降级逻辑是必要条件**：最初实现只取 `tiers[0]` 且层内 `fresh` 为空时直接 `return null` ⇒ GOAT 号全冷却时**官方兜底完全失效**，客户端拿到 503 `gateway_all_keys_failed`。已改为逐层下探
- 生产：`deepseek-official` 设 `priority: 0` ⇒ 只有两个 GOAT 号都冷却时才参与（用户要求「非必要不用」）

## 机制二：quota 驱动的动态 weight
`config.json`：
```json
"quotaSync": { "enabled": true, "url": "http://127.0.0.1:8790/quota",
               "intervalMs": 60000, "timeoutMs": 15000,
               "mode": "resetSoon", "resetWindow": "weekly",
               "minWeight": 0.2, "maxWeight": 5 }
```
- `mode` 四值：`used`（月已用比例高者权重大）/ `left`（反向）/ **`resetSoon`（周期窗口 resetAt 更近者权重大）← 当前** / `resetLate`
- `resetWindow`：`weekly`（缺省）或 `fivehour`
- **只写内存 `quotaWeights` Map，绝不回写 keys.json**（避免与 mtime 热重载打架）；拉取失败静默回落静态 `weight`；`effWeight(k)` 先查 quota 表再看 `k.weight`
- 官方余额行（无 month 窗口 / 无 resetAt）自动跳过 → `weightFromQuota: false`
- `reloadRuntimeConfig()` 里也会 `syncQuota().catch(()=>{})`；启动时跑一次 + 滚动 interval（下限 10s，`.unref()`）
- `/health` 顶层有 `priorityTiers` / `quotaSync{enabled,url,mode,resetWindow,ok,ageSec,error,detail}`；逐 key 有 `priority`/`quotaAccount`/`weightStatic`/`weightEffective`/`weightFromQuota`

## 为什么口径是 resetSoon + weekly
GOAT 只有 **5h 与 weekly 两个 rolling window 有 `resetAt`**；**月度池属 billing cycle，服务端不给日期**（`/alpha/billing/credits` 只回 `monthlyCredits` 数值；`goat-usage.ps1` 明确把月度 reset 写成 null；15 个候选订阅端点全 404）。
用户 2026-10-01 拍板「月额度更近指的是套餐结束的时间」（m00410），随后贴出他自己插件能拿到的唯一时间就是「窗口重置：周 10/04 09:53 / 10/07 17:05」（m00684）→ 落到可拿到的最近时间口径 = **weekly resetAt**。当时 163 剩 61.3h、qq 剩 140.5h ⇒ 163 拿 w5.00、qq 拿 w0.20。

## ⚠️ 已知副作用：「163 近乎独占」
`scoreOf = load[k.name] / effWeight(k)` 取 min，而 `load` 是**历史累计**绑定数（163≈790 / qq≈915），权重却是 5 / 0.2 ⇒ score 158 vs 4575 ⇒ **qq 要等 163 背到约 22575 个会话才轮到，实际等于永远**。生产日志实证连续 8+ 次 `SESSION-BIND … 163`，qq 一次未选中，原有绑在 official 上的会话也被批量重绑到 163。
好处：163 的周额度（剩约 28 credits、2.5 天后重置）优先被烧掉，撞上限后 163 进冷却再由 qq 顶上（有 priority 降级 + 冷却兜底）。坏处：qq 长期闲置。
**若要收敛，只需调大 `quotaSync.minWeight`（如 1→3），无需改代码。**

## 运维
- 改 `gateway.mjs` **代码**后必须重启；`keys.json` / `config.json` 是 mtime 热重载，保存即生效
- Windows 重启：`powershell -NoProfile -ExecutionPolicy Bypass -File D:\Toolbox\goat-gateway\restart-gateway.ps1`
- Linux 重启：`XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user restart goat-gateway`
- 备份后缀约定 `.bak-<yyyyMMdd-HHmm>-<用途>`；本轮 `20261001-2036-pre-quota-priority-live`（Windows）/ `20261001-2038-pre-quota-priority-live`（Linux）；Windows 另有 `gateway.mjs.rollback`（= pre-quota-priority 版，回滚即覆盖回去再重启）
- **双机 config 差异必须保留**：Linux `cooldownMs.unauthorized = 1800000`，Windows 为 180000
- **双机 node 版本不同**：Windows 计划任务用 `C:\Program Files\nodejs\node.exe` (v24)；Linux unit `ExecStart=/usr/bin/node` = **v18.19.1**（不是 PATH 上的 ~/.local/bin/node v24）

## 测试（三套，双机全绿）
- `selftest.mjs`（13 条 PASS：normal stream / client abort / 5xx failover / after-header / cloudflare 1010 / body timeout 408 / config+keys reload fallback / session fingerprint / header fingerprint / 20 concurrent / stream idle retry / prefix affinity / quota-400 冷却换 key）
- `selftest-multiupstream.mjs` 6 项
- `selftest-quota-priority.mjs` 7 项：T1 priority tiers 回显 / T2 官方在 GOAT 层可用时零调用 / T3 高层全冷却后官方顶上（含 3 次 401 后转投）/ T4 mode=used / T5 mode=resetSoon / T6 quota-http 挂掉不影响路由 / T7 权重影响真实分配；端口 18790 + mock quota 18791
  - ⚠️ 写这个测试时踩过：清理代码若放在断言之后，断言一抛就跳过清理，mock 401 与冷却残留会连坐后续用例（表现为 T6 莫名 503）
