---
id: mem-f413be338e2159a53fe896c45463cc6b
revision: 1
created_at: "2026-09-29T19:55:12.798Z"
updated_at: "2026-09-29T19:55:12.798Z"
name: goat-gateway-key-weight-and-model-id-forms
description: "网关 key weight 生效的实测证据（日志级）+ 上游要求 provider/model 形式、裸 id 部分有效"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# goat-gateway：key weight 与 model id 形式（2026-09-30 实测）

## 1. key weight 已实现且正在生效（日志级证据）

用户要求：「在网关里面给 qq 邮箱的 api 提高一些权重吧，这个快到期了，我想先用一用这个」
⇒ `keys.json` 里 `qq.weight=3`、`163.weight=1`；`gateway.mjs:495`
`scoreOf = (k) => load[k.name] / (k.weight > 0 ? k.weight : 1)`，`load` = `state.sessions` 里
绑定到该 key 的**会话数**，`selectKey()` 取 score 最小者。

**实测证据（`logs/gateway-2026-09-29.log`）**：
```
19:04:40Z SESSION-BIND 928c0c35 qq (sessions per key: 163=788 qq=800)
19:06:03Z SESSION-BIND 15460104 qq (163=788 qq=801)
19:07:39Z SESSION-BIND 07506137 qq (163=788 qq=802)
19:09:03Z SESSION-BIND de9ec484 qq (163=788 qq=803)
19:39:42Z SESSION-BIND 6a2c8dbf qq (163=788 qq=804)
```
163 冻结在 788、**每个新会话都落到 qq** ⇒ weight 生效。

**别被 805:788 误导**：那≈1:1 不是失效。788 是 **weight 上线前的历史绑定**，而 `load/weight`
要到 `qq=788*3=2364` 才平衡。当前状态 = **qq 独吞所有新会话**，比字面 3:1 更贴合
「想先用一用 qq」的意图。

适用边界：weight **只影响新会话的分配**。已有绑定不回迁（`strategy=session` 为保 upstream
prompt cache 故意粘住），所以想让比例真正变成 3:1 还需要约 1500 个新会话。

## 2. 上游要求 `provider/model` 形式（重要）

| 请求的 model | 结果 |
|---|---|
| `deepseek/deepseek-v4-flash` | **200** |
| `deepseek/deepseek-v4.1-flash`（裸 id） | **400** `unsupported_model`「not supported on this endpoint」 |
| `deepseek/deepseek-v4.1-flash`（带前缀） | **200** |
| `deepseek/deepseek-v4-flash-fast` | **200** |
| `deepseek/deepseek-v4-flash-vision-exp` | **200** |
| `gpt-6-astra`（裸 id） | 403 `MODEL_NOT_IN_PLAN`（走到了上游，说明**裸 id 也可能有效**） |
| `gpt-6-luna` / `gpt-5.6-sol` / `gpt-5.6-luna`（裸 id） | 400 **`max_output_tokens` 最小值 ≥16**（我传了 4）⇒ **这三个是有效的**，不是死配置 |

⇒ 裸 id **不是**一律无效：`deepseek-*` 必须带 `deepseek/` 前缀，而 `gpt-6-*/gpt-5.6-*`
本来就是无前缀。**判死一个 model 前必须区分「model 不存在」与「参数非法」**。

## 3. plan-403 分类：实测通过

- `gpt-6-astra` → **403 `gateway_model_not_in_plan`**，body 带 `upstream_status: 403`
- 日志：`PLAN-BLOCKED id=141 key=163 model=gpt-6-astra (key NOT cooled)`
- 请求前后 `state.json` 的 `cooldownUntil` **逐字节相同**（163: 1790704778362 未变）
  ⇒ **model 级 403 不再冷却整个 key** ✓（这正是「503 所有 key 均失败（已尝试 无）」的根因）

## 4. 探测脚本的参数（复核无偏差）
`probe-all-models.py` / `probe-model-reasoning.py` / `probe-retry-failed.py` 都用
`max_tokens: 400`（`probe-reasoning-efforts.py` 用 256）—— 均 **≥16**，所以
「57 reachable / 24 impossible」这个历史结论**没有因参数过小而被污染**。
