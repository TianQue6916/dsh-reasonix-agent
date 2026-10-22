---
id: mem-7e3a09dbdf79fdbe1c8d7a469f9eb6c4
revision: 1
created_at: "2026-10-04T11:29:49.599Z"
updated_at: "2026-10-04T11:29:49.599Z"
name: dsh-compaction-threshold-and-audit-pitfalls-20261004
description: "dsh auto-compaction 的真实阈值判据链、audit 脚本 v1 的两个测量坑、token-meter Junction 事实"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## auto-compaction 阈值（2026-10-04 源码确证）

`@deepseek-ai/dsh-compaction-basic/lib/index.js`（web/headless/desktop 三端共用同一文件，经 Junction 指向全局 npm 包）：

- `:15 const DEFAULT_THRESHOLD_RATIO = .8;` / `:17 DEFAULT_RETAIN_RATIO = .16`
- `:124-142 resolveCompactSpec(policy, contextWindow, reservedCompletionTokens)`：
  `messageBudgetTokens = contextWindow − reservedCompletionTokens`；
  `pressureBudgetTokens = messageBudgetTokens − policy.headroomTokens`；
  **`thresholdTokens = floor(min(contextWindow × thresholdRatio, pressureBudgetTokens))`**；
  `retainTokens = floor(messageBudgetTokens × retainRatio)`
- `:63 const headroomTokens = config.headroomTokens ?? 65536;`
- `:940-941 if (measurement.totalTokens < spec.thresholdTokens) return null;`
- `:576 shadowedTokenCount = selectedNodes.reduce((t,n)=>t+n.heuristicTokens, 0)` ← **这是被压节点的 char/4 估算，不是触发账本**

代入生产 web（model `deepseek/deepseek-v4.1-flash`，`contextWindow 1000000`，`defaultMaxTokens 65536`）：
`threshold = floor(min(800000, (1000000−65536)−65536)) = 800000`，`retainTokens = floor(934464×0.16) = 149514`。

## 两个测量坑（v1 `storages/tools/compaction-audit.py` 踩过，勿重蹈）

1. **`realBefore` 不可靠**：`compaction/summary` 之前的事件序列是
   `step/start → user/message* → assistant/attempt → step/end → turn/end → command/run → compaction/start`，
   **通常没有 `assistant/message`**。v1 取的是日志里更早的任意一条 ⇒ 报出的 `%window` 与真实触发占用无关。
   修正版：`~/.dsh/storages/tools/compaction-audit2.py`（改报「周期内 prompt 峰值」+ summarizer 真实 prompt 拆分）
2. **`measure().totalTokens`（真正触发值）从不写进 event log** ⇒ 只能靠运行期探针取得。
   `compaction/start|end` 的 data 只有 `compactionId/sourceCommandId/turn`，没有 measurement。

## 可信的观测量

- `compaction/summary.data.usage` = summarizer 自己的请求；`inputTokens + cacheRead + cacheWrite` = **被压掉文本的真实 token 量**。
  cacheRead≈0（实测 128）⇒ summarizer 每次构造**全新 prompt**，吃被压段原文。
- `assistant/message.data.usage`：`prompt = inputTokens + cacheReadTokens + cacheWriteTokens`；
  provider 自报 `totalTokens = prompt + outputTokens`（实测 `2040+80000+2566 = 84606` 对得上）。
  注意 `cacheReadTokens` 常报 `null` ⇒ 算出的 prompt 是**下界**。

## 结构性事实

`~/.dsh/profiles/node_modules/@deepseek-ai/dsh-token-meter` 是指向
`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-token-meter` 的 **Junction**
⇒ 三端共用一份；`[patch:usage-first-baseline]` 补丁位于 `lib/index.js:654-666`，**位置正确且在生效**。

`~/.dsh/plugins/tm-usage-first.mjs` plugin **未 apply**（其无条件 `log('installed …')` 在 `logs/host-stdio.log` 零命中，
而 `--dump-config` 里 entry 存在）⇒ 疑 `inject:['tokenMeter']` 未满足，待查。

## 仍未定案

触发账本（`measure().totalTokens`）实测 800,000 阈值 vs 同周期主 prompt 峰值仅 167,765 ⇒ 差 4.8×，
被压段真实量 951,425。矛盾点定位完成，**结论需一次带探针的 dsh 重启**。
