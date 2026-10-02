---
id: legacy-dcbe8b3cb243e125856f7b9e
revision: 1
created_at: "2026-09-30T10:57:49.385722Z"
updated_at: "2026-09-30T10:57:49.385722Z"
name: dsh-replay-cost-tile-missing-model-rule
description: replay 成本 tile 对 muse 等 model 整个不渲染的根因（estimateCost undefined 短路）与 patch-replay-pricing.mjs 修复
metadata:
  type: user
  fact_type: reference
  scope: global
---

`@mingozhou/dsh-replay`（v0.4.1）Overview 的成本 tile 对 muse 等 model **整个不渲染**（不是显示 $0）。

**根因**：`src/core/cost.ts` 的 `estimateCost` 是 session 级 first-match-wins，
`pricing.find(p => models.some(m => p.match.test(m)))`，命中不了就 `return undefined`；
而 `src/client/components/OverviewView.tsx` 写的是 `...(cost !== undefined ? [{...}] : [])`
→ undefined 时 tile 直接不渲染。原 `DEFAULT_PRICING` 只有 5 条
（deepseek/claude/gpt/openai/gemini），本地 62 个 model 约 50 个命中不了：
muse-spark、Kimi、GLM、MiniMax、mimo、Qwen、LongCat、Step、hy、nemotron、
inkling、stealth、laguna、ling、grok。

**修复**：`~/.dsh/storages/tools/patch-replay-pricing.mjs` —— 在 Gemini 条目后追加 15 条
vendor 估算 + 末尾 `/./u` fallback（21 条，62/62 命中，未来新 model 不再静默消失）。
产物 4 个 × 2 profile = 8 文件：`src/core/cost.ts`、`lib/core.js`、`lib/client.js`、
`lib/viewer.js`。已接进 `replay-all-patches.mjs`（`pnpm install` / dsh 升级会冲掉 node_modules
手工补丁，之后必跑 `node ~/.dsh/storages/tools/replay-all-patches.mjs`）。
生效方式：web 的 `lib/client.js` 由 loader 每次请求 `readFileSync` 读盘 → 刷新页面即可，无需重启。

**残留（未修）**：`estimateCost` 是 session 级单费率，混用多 vendor 的 session 会按第一个命中的
规则给**全部** token 计价、label 也只显示那一个（实测含 muse-spark 的 session 仍显示
`$45.80 [DeepSeek]`）。要 per-model 正确需 per-step 归属：`usageSamples` 已带 turn/step，
`assistant/message` 带 `source.model`。

**价格口径**：USD 数字是**估算**，不是实付。GOAT 按 credits 计费（5h/14 · 周/35 · 月/70）；
upstream `/v1/models` 只返回 id/name/context_length/supported_endpoints，**不暴露 per-model USD**。
UI 文案本身已标 `≈ 成本({label},估算)`。

**验证链**：`node --check` × 7 通过；62 个 model id 全量 `estimateCost` → miss=0；
真实 session（`--C-Users-27063--/session-a0d5fbf8-…`，13878 events，多 frame zstd 按
magic `0x28B52FFD` 切片解码）换 model 名重跑 → `$98.57 [Muse Spark]`、未知 model →
`[Other (est.)]`；`replay-all-patches.mjs --check` 5 项全 OK。详见
`~/.dsh/storages/tools/README-replay-pricing.md`。
