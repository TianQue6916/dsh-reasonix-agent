# replay 成本 tile 消失的根因与补丁（2026-09-30）

## 现象
用 muse（或 Kimi/GLM/MiniMax/…）跑完一个 session，replay 的 Overview 里**整个成本 tile
不显示** —— 不是显示 $0，是不渲染。

## 根因
`@mingozhou/dsh-replay` `src/core/cost.ts` 的 `estimateCost`：
- `pricing.find(p => models.some(m => p.match.test(m)))` —— first-match-wins；
- 命中不了就 `return undefined`；
- `OverviewView.tsx:230` 写的是 `...(cost !== undefined ? [{...}] : [])` —— undefined 就不渲染。

原 `DEFAULT_PRICING` 只有 5 条（deepseek/claude/gpt/openai/gemini），而本地 62 个 model 里
约 50 个命中不了（muse-spark、Kimi、GLM、MiniMax、mimo、Qwen、LongCat、Step、hy、
nemotron、inkling、stealth、laguna、ling、grok）→ 这些 session 的成本 tile 静默消失。

## 修复
`patch-replay-pricing.mjs`：在 Gemini 条目后追加 15 条 vendor 估算 + 末尾 `/./` fallback
（保证未来新 model 永不静默消失）。21 条，62/62 命中。
产物 4 个 × 2 profile = 8 文件：`src/core/cost.ts`、`lib/core.js`、`lib/client.js`、`lib/viewer.js`。

## 验证链
1. `node --check` × 7 全部通过（含 minified viewer.js）。
2. 62 个 model id 全量 `estimateCost` → miss=0。
3. 真实 session 端到端（`--C-Users-27063--/session-a0d5fbf8-…`，13878 events，多 frame zstd 按
   magic 0x28B52FFD 切片解码）→ 把 model 名换成 muse 重跑 buildTimeline+estimateCost，
   得到 `$98.57 [Muse Spark]`；未知 model 得到 `[Other (est.)]`。
4. `replay-all-patches.mjs --check` 5 项全 OK。
5. 生效方式：web 的 `lib/client.js` 由 loader 每次请求 `readFileSync` 读盘 → **刷新页面即可**，
   无需重启 dsh；`viewer.js` 影响导出的 HTML。

## 已知残留（未修）
`estimateCost` 是 **session 级** 单费率：一个 session 混用多个 vendor 时，按**第一个**命中的规则
把**全部** token 计价，label 也只显示那一个。实测 `session-a0d5fbf8-…` 的 models 含
`meta/muse-spark-1.3-contributor`，成本仍显示 `$45.80 [DeepSeek]` —— muse 的 token 被按
DeepSeek 费率算且未单独列出。
真要"muse 单独计费"需 per-step 归属：`usageSamples` 已带 turn/step，`assistant/message` 带
`source.model`，数据足够；改 `cost.ts` + `timeline.ts` + `OverviewView` 调用点即可。

## 价格口径（重要）
这些 USD 数字是**估算**，不是实付。GOAT 套餐按 **credits** 计费（5h/14 · 周/35 · 月/70），
upstream 的 `/v1/models` 只返回 id/name/context_length/supported_endpoints，**不暴露 per-model
USD 价**；`/alpha/billing/credits` 也只给 credits。UI 文案已标 `≈ 成本({label},估算)`。

## 重放
```bash
node ~/.dsh/storages/tools/replay-all-patches.mjs          # 全部重放
node ~/.dsh/storages/tools/replay-all-patches.mjs --check  # 只报告
```
`pnpm install` / dsh 升级 / profile 重建会把 node_modules 手工补丁冲掉 —— 这些时机后必跑。
