---
id: "55267ea6-81b5-4f7f-8ed6-5ef7298db369"
title: "dsh 自动压缩阈值失真取证：compaction 判据的 heuristic 账本 vs contextPressure 真实 usage 双口径对决（2026-10-04）"
description: "2026-10-04 调查结论：UI「上下文已用」（contextPressure.projectedTokens，provider 真实 usage 锚）与 dsh-compaction-basic 的触发判据（dsh-token-meter measure().totalTokens，CHARS_PER_TOKEN=4 heuristic 账本）是两套独立口径；13 次压缩的比率取证显示前 10 次健康（0.60–0.76）、第 11 次起账本比真实大 9.50–10.56×，转折点在 per-step 快照注入（plan-anchor/git-context/thinking-anchor）上线之后；给出「调 thresholdRatio 无效」的量化论证与两条修法（改判据口径 / 削 per-step 重注入），并记录两个未闭环点。"
status: "active"
created_at: "2026-10-04T03:32:36.128Z"
updated_at: "2026-10-04T03:32:36.128Z"
content_hash: "d68cb92fc871cc799e23279c109c61c5daad25594186ec21acc8da8903983720"
source_paths:
  - "profiles/node_modules/@deepseek-ai/dsh-compaction-basic/lib/index.js"
  - "profiles/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js"
  - ".agent-presets/anchored-standard/plan-anchor.mjs"
  - ".agent-presets/anchored-standard/git-context.mjs"
  - ".agent-presets/anchored-standard/thinking-anchor.mjs"
  - "profiles/web/cordis.patch.yml"
session_ids:
  - "62146b7c-4f66-496b-ab89-e7d586d66272"
memory_body_ids:
  []
---

# dsh 自动压缩阈值失真取证（2026-10-04）

调查起因：用户观察到 UI「上下文已用」的数字与「自动压缩在很高比例才触发」不一致，怀疑是渲染 bug。
结论：**不是渲染 bug，是两套独立口径在算同一个词**；且后者的 heuristic 账本从某个时间点起膨胀约 10 倍。

## 1. 两套口径（核心机制）

| 口径 | 数据来源 | 该 session 当时的值 |
|---|---|---|
| UI「上下文已用」 | `contextPressure.projectedTokens` = provider 回报的真实 usage + 其后 heuristic 增量 | 81,309 + 2,596 ≈ 83,905（≈8.4%） |
| 自动压缩触发判据 | `dsh-token-meter.measure(session).totalTokens` = 纯 heuristic 累加账本（`CHARS_PER_TOKEN = 4`） | 426,729（≈42.7%） |

判据位置 `~/.dsh/profiles/node_modules/@deepseek-ai/dsh-compaction-basic/lib/index.js:940-941`：

```js
const spec = resolveCompactSpec(policy, info.context.contextWindow, reservedCompletionTokens(agent, info.defaultMaxTokens));
if (measurement.totalTokens < spec.thresholdTokens) return null;
```

判据**从不读** `contextPressure`，只看自己的 `measure()`。
⇒ UI 那个数字其实离真相更近；「压缩在 80% 触发而 UI 显示 8%」是两个账本，不是显示错误。

## 2. 硬证据：13 次压缩的账本 vs 真实比率

方法：每次 compaction 都会调一次 summarization LLM，该调用自带真实 `usage`；把它与该次宣称压缩掉的 heuristic token 数对齐。
数据源：`~/.dsh/sessions/--C-Users-27063--/session-a0d5fbf8-…/session.v4.jsonl.zstd`（24,752 条事件全量重放）。

| # | seq | shadowedTokens(heuristic) | 该次 summary 调用真实 prompt | 比率 |
|---|---|---|---|---|
| 1–10 | 1401 … 16134 | 185,953 – 435,920 | 249,933 – 671,569 | **0.60 – 0.76**（heuristic 低估，健康） |
| **11** | 19010 | **548,267** | **57,735** | **9.50** |
| **12** | 20717 | **546,888** | **56,119** | **9.75** |
| **13** | 23225 | **654,411** | **61,979** | **10.56** |

前 10 次完全正常 —— heuristic 对中文低估 1.3–1.7× 是 `CHARS_PER_TOKEN = 4` 的预期行为。
**第 11 次开始账本突然比真实大 10 倍。**

独立旁证链（goat-gateway 日志）：10-04 请求的 `bytes / prompt_tokens` 中位 **3.45**（请求体始终 ≈ 3.45 × provider 报的 prompt）；
10-04 真实 prompt 上限只有 **144,407**；对照 9-30 前后 prompt 峰值达 **677,362** —— 那时压缩在真实 60%+ 触发，行为正确。

**⇒ 转折点 = per-step 快照注入上线之后。**

## 3. 账本膨胀的来源

`plan-anchor.mjs` / `git-context.mjs` / `thinking-anchor.mjs` 都是 `agent/pre-step` + `{prepend: true}`，每 step 各注入一份快照。
而 `~/.dsh/profiles/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js:1061`：

```js
if (firstAttempt) for (const message of decision.messages) this.session.append("user/message", message, { surfaceOp: "append" });
```

**每 step 无条件 append 一份。**

当前 window 实测（`surfaceOp:"append"` 事件全量清点）：

- 合计 1,286 节点 / **1,766,933 字符**（heuristic ≈ 441,733）
- `assistant/message` 256 节点 / 754,219 字符
- **`user:plan-anchor` 256 节点 / 560,386 字符（每份 2,189 字符）← 单一最大项，占 32%**
- `tool/result` 257 / 329,803；`git-context` 255 / 78,632；`thinking-anchor` 256 / 36,864

图案极其规整：**每 step 恰 5 个 append（1 assistant + 1 tool + 3 inject）**，257 steps × 5 = 1285 ✓

UI 侧 `AUTO_COMPACT_RATIO` 是**硬编码 `.8`**，注释自承：

> DSH does not publish the configured ratio to plugins/clients, so the reserve band mirrors the default — deployments tuning `thresholdRatio`/`modelPolicies` should adjust it to match.

⇒ 那根「自动压缩预留」80% 色带**永远画在 80%，与实际配的 ratio 无关**。

## 4. 可执行结论

**单纯调 `thresholdRatio` 解决不了问题。** 账本阈值 800,000 对应真实 prompt 约 150K；就算把 ratio 拉到 1.0（账本 1M 封顶），真实触发点也只到 ~18% —— 账本涨得比真实快，抬阈值只是把触发点从 17% 挪到 18%。

真正的杠杆有两个：

1. **改判据口径（治本）**：patch `dsh-compaction-basic/lib/index.js:940` 那条判定，让阈值比较用 `contextPressure.projectedTokens`（真实 usage 锚）而非 `measure().totalTokens`。改动小、可回滚、可验证。
2. **削账本累积（治标）**：改 `~/.dsh/profiles/web/cordis.patch.yml` 的 compaction 组 —— 给 `compaction-basic` 显式 config，并把 per-step 重注入降频/减量。

## 5. 未闭环

- 社区「最佳 compaction 阈值」经验的调研 subagent（`2c0ead8c-9b10-4be6-9269-417d89d00267`）仍在运行、未回收；阈值定档依赖它。
- 一个未定案的机制点：账本里 272 份 plan-anchor 的字符量（2.3M 字符/window）与真实请求体量（~500KB）差 9×。按 `deriveMessages()` / `buildRequest` 读到的代码**没有任何环节裁 messages** —— 要么存在一处尚未定位的收窄点，要么 `measure()` 累加本身重复计入。**不影响上面的结论（比率是实测的），且修法 1 能绕过它。**

## 关联文档

- `7ffee013-e0cd-425c-9209-1bce9cc84239` —— `plan-anchor.mjs` 每步重注入 PLAN.md head 的实现交接（本文的 per-step 注入量取证以它为背景）。
- `19c32572-d660-489d-b304-5f1efd54d08a` —— 该插件的选型调研与 A/B/C 三杠杆。
