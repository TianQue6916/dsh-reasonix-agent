---
id: mem-845fe1d89daa54433e6adb168f47bff4
revision: 1
created_at: "2026-09-29T18:07:26.952Z"
updated_at: "2026-09-29T18:07:26.952Z"
name: goat-gateway-403-taxonomy-and-dsh-reasoning-models
description: "goat-gateway 三类 403 的区分与冷却策略 + dsh 按实测重写 model 列表的关键结论"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## goat-gateway 的 403 必须分三类（2026-09-29/30 实测，`D:/Toolbox/goat-gateway/`）

原代码把 401/402/403/429 一律当「这个 key 不能用」→ `applyCooldown`，而 `cooldownMs.unauthorized` 曾经是 **1800000（30 分钟）**。后果：**一个 model 级的 403 会让整个网关停摆半小时**，客户端只看到 `503 gateway_all_keys_failed「所有 key 均失败（已尝试 无）」`（`attempted` 为空 = `selectKey` 里 `fresh` 为空 = 两个 key 都在 cooling，`gateway.mjs:463-464`）。

三类 403（都已区分处理）：
1. **`MODEL_NOT_IN_PLAN`**（`{"message":"MODEL_NOT_IN_PLAN: ... available in Provider and above plans","code":"FORBIDDEN"}`）—— 套餐不含该 model。**对两个 key 完全一致，换 key 无用。** 现在在 attempt 循环里提前拦截：记 `lastStatus/lastError`、**不冷却 key**、直接回 403 `gateway_model_not_in_plan`（`isModelNotInPlan()` at `gateway.mjs:250`，拦截点 ~1123）。
2. **`Authentication failed. Please check your credentials.`** —— **不是 key 失效**：同一个 key 打 `deepseek/deepseek-v4.1-flash` 得 200、打 `google/gemini-3.7-flash` 得它。根因是该 model 的后端 provider 没绑定。现在单列 `authModel` 冷却 = **30000ms**（`cooldownReason()` ~267 行）。
3. **Cloudflare 1010 / 真·401 / 429** —— 走原逻辑；`cooldownMs.unauthorized` 已从 1800000 调到 **180000**。

## 上游 relay 的 reasoning_effort 合法域
`commandcode.ai`（经 gateway）对 `reasoning_effort` 只接受 **`low | medium | high | xhigh | max`**；`none`/`minimal` 直接 400：`Invalid option: expected one of "low"|"medium"|"high"|"xhigh"|"max"`。**省略该字段**被接受（且仍有 reasoning_content）。**这个校验是 relay 层的，对所有 model 统一** —— 所以 pi-ai catalog 里的 `thinkingLevelMap` 描述的是别的 provider，不能当本 route 的依据。

## dsh `llm-pi-ai` 的 model 列表已按实测重写
84 个 → **60 个**（移除 10 个 `claude-*`：`/v1/models` 只给它们 `/messages`，而 route 是 `openai-completions`；移除 13 个 `plan_blocked`；移除 1 个 `gemini-3.7-flash`）。
- **14 个 true-thinking**（`ok_thinking`）→ `reasoningEfforts: {off: null, low, medium, high, xhigh, max}`：deepseek-v4-flash / v4-flash-fast / **v4.1-flash** / Kimi-K3 / Kimi-K2.7-Code / GLM-5.2 / Qwen3.8-Max / Qwen3.8-Max-0902 / Qwen3.8-Flash / Qwen3.7-Max / Qwen3.7-Plus / Qwen3.6-Plus / LongCat-2.0 / hy4-preview
- **46 个非 thinking** → **`reasoningEfforts: false`**（schema 接受：`z.union([z.const(false), reasoningEfforts])`）
- 依据：`dsh-llm-pi-ai/lib/index.js` 的 `resolveModelReasoning()` —— 手写 entry 没有 pi-ai 的 `base` 时，不声明就是 `reasoning: false`；而 `reasoningInfo()` 在 `!model.reasoning` 时返回 `{}` → UI 里那栏**根本没有选项**。
- **本 route 名 `commandcode-goat` 不在 pi-ai 内置 catalog 里**（`resolveRouteModels` 的 `catalogModels(provider)` 返回空 Map），所以 `base` 恒为 undefined，`reasoningEfforts` **必须手写**，无法自动继承。
- 探测工具（可重跑）：`~/.dsh/storages/tools/probe-all-models.py`（慢速、可 `--resume`、逐条落盘）、`rewrite-model-list.py`（按 verdict 重建 models 段，幂等）。**上游对短时大量不同 model 请求会节流**（伪装成 403 Authentication failed）→ 间隔 ≥5s，遇 3 次连续限流要 `sleep 35` 再续。
