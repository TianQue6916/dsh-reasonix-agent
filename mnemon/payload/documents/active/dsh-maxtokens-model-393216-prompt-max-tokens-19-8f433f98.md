---
id: "8f433f98-dfa5-46f4-a8a6-1b9a3810bdc2"
title: "dsh 模型 maxTokens 上限实测与逐 model 校正（393216 硬顶、prompt+max_tokens 约束、19 个超限坏配置）"
description: "2026-09-30 在 ~/.dsh 对 87 个 model 的 max_tokens 真实上限做的三轮探测与 profiles/desktop|web|headless 校正：393216 全局硬顶、每 model 上限差异、prompt_tokens+max_tokens ≤ context_window 的隐藏约束（Kimi-K2.5/GLM-5/MiniMax-M2.5）、19 个声明值超真实上限导致一调用就 400 的坏配置、改动前备份+结构 diff 验证法，以及 profile 文件存在并发写入者的警告。"
status: "active"
created_at: "2026-09-30T13:31:03.263Z"
updated_at: "2026-09-30T13:31:03.263Z"
content_hash: "41c867fb3c8c575444975925f99ff088d7f6df9ae6163fa9bcb25cfa968caf38"
source_paths:
  - "profiles/desktop/cordis.patch.yml"
  - "profiles/web/cordis.patch.yml"
  - "profiles/desktop/cordis.patch.yml.bak-20260930-2128-pre-maxtok-ceiling"
  - ".agent-presets/anchored-standard/thinking-anchor.mjs"
session_ids:
  - "2a49cc0f-3e44-4eca-9396-00ec2b10a1a0"
memory_body_ids:
  []
---

# dsh 模型 maxTokens 上限实测与校正（2026-09-30）

## 背景与结论

任务起点是"把输出上限开到不限量"。实测结论：**不存在无上限**，`max_tokens` 有全局硬顶且每个 model 另有自己的上限，一刀切必炸。

- 全局硬顶：`393216`（= 384K）。`393216 → 200`；`393217 → 400 must be between 0 and 393216`。
- **只有 29/87 个 model 能吃满 393216**，其余上限更低，必须逐 model 校正。

## 关键约束（由上游错误原文引出，非推测）

1. **`prompt_tokens + max_tokens ≤ context_window`**——"顶到上限"只在空 prompt 下成立。原文示例：
   `This model's maximum context length is 262144 tokens. However, you requested 262144 output tokens and your prompt contains 195 characters`
   受影响：Kimi-K2.5、zai-org/GLM-5、MiniMaxAI/MiniMax-M2.5。因此这三个不能取上限峰值，改用降序探测所得的安全值（196608 / 98304 / 131072）。
2. 部分 model 的上限远低于 context_window，报错原文形如：
   - `Range of max_tokens should be [1, 65536]`（Qwen 系）
   - `The maximum tokens you requested exceeds the model limit of 202752`（GLM-5）
   - `限制数值范围[1,131072]`（z-ai 系）

## 实测方法（三轮，可复用）

1. **无 prompt 顶格探测**：直接请求 393216，筛出被硬顶拒绝的。
2. **真实规模 padding 复测**：加约 7k token 的真实规格 prompt，验证 `prompt+max_tokens` 约束。结果 **33/33 通过**，得到 33 个 model 的确认值。
3. **降序探测**：对仍未解出上限的已声明 model，从高到低二分/降序找可接受的最大值，得到 8 个新值。
4. 少数 model 全梯队失败，属**无法验证**而非低上限，保持原值不动：
   - `MiniMaxAI/MiniMax-M2.7`、`thinkingmachines/inkling`、`thinkingmachines/inkling-small` → `No available providers match ...`（无可用 provider）
   - `claude-sonnet-5-5` → `must be called via /provider/v1...`（调用路径不同）

## 校正结果

改动仅限 `commandcode-goat` 路由行，最终 **提高 46 / 降低 38 / 不变 2 / 无法验证 8**。

| profile | 改动处数 | 验证 |
|---|---|---|
| desktop | 40 处 maxTokens | 结构 diff：仅 40 个 maxTokens 叶子变化，其它字段 0 改动 |
| web | 40 处 | 同上 + `dsh --profile web --dump-config` exit=0 |
| headless | 4 处 | 同上 + `--dump-config` exit=0 |

headless 四处：`deepseek/deepseek-v4-pro`、`deepseek/deepseek-v4.1-flash`、`gpt-5.6-sol`、`moonshotai/Kimi-K3`，均 `262144 → 393216`。
备份文件：`profiles/desktop/cordis.patch.yml.bak-20260930-2128-pre-maxtok-ceiling`。生效方式：HMR，**开新会话即生效**。

## 挖出的真 bug：19 个 model 声明值 > 真实上限

这批 model 原声明 `262144`，但真实上限更低，**改动前一旦调用就会 400**：

```
Qwen/Qwen3.6-Plus, Qwen/Qwen3.6-Max-Preview        真实 65536
Qwen/Qwen3.7-Max, 3.7-Plus, 3.7-Flash              真实 131072
Qwen/Qwen3.8-Max, 3.8-Max-0902, 3.8-Flash          真实 131072
zai-org/GLM-5.3, GLM-5.2                           真实 131072
z-ai/glm-5.3-flash                                 真实 131072
zai-org/GLM-5                                      真实  98304
MiniMaxAI/MiniMax-M2.5                             真实 131072
moonshotai/Kimi-K2.5                               真实 196608
xiaomi/mimo-v2.5 / mimo-v2.5-pro                   真实 131072 / 65536
google/gemini-3.8-flash                            真实  65536
tencent/hy3-paid                                   真实 131072
poolside/laguna-s-2.1-free                         真实  32768
```

## 风险提示

dsh 把模型级 `maxTokens` 当作每个请求的默认 `max_tokens`（见 `dsh-llm-pi-ai/lib/index.js:677`）。声明 393216 后，若某次 prompt 特别长，可能触发上文第 1 条 context 校验；真遇到 `maximum context length` 类 400，把该 model 降回约 262144 即可。

## 环境警告：profile 文件有并发写入者

改动窗口内（21:13 → 21:28）有另一个进程往 `profiles/desktop/cordis.patch.yml` 写入 `thinking-anchor` plugin 注册与 thinking-language directive 文本，行数 +20（1236/1140 → 1256/1160），与本次 maxTokens 改动同窗口同文件。本次改动未被覆盖（已逐项核对），但**手改 profile 前必须假定存在并发写入者**：先做改动前备份，并用"改动前备份 + 结构 diff（只比对目标叶子字段）"确认改动集干净，而不是只看行数或时间戳。

本次 diff 佐证的另一处差异（非本任务改动）：`deepseek/deepseek-v4.1-flash` 的 `reasoningEfforts` 由 `low/medium/high/xhigh` 收窄为 `low/high`。

## 关联

- `ccaf7418-968f-43b9-b194-486ffe04727c` — desktop profile 移植与 Electron 独占守卫（同一批 `cordis.patch.yml`，验证方法同源）
- `fa611c46-9dc6-42aa-93a8-1002be2468bd` — goat-gateway 403 taxonomy 与 reasoningEfforts 按真实能力设置（本轮"撤回批量档位审计"的依据即该文档记录的 GOAT route 实测结论）
- `1c10152c-903f-48df-b23e-2f44c6c126f1` — 记忆分层与 runtime Source 边界

## 一处被撤回的结论（避免重犯）

同一会话曾按 model name 跨 provider 匹配 catalog 来批量清理 `reasoningEfforts` 档位，**方法不成立已撤回**：`claude-fable-5` 会匹配到 amazon-bedrock、`grok-4.5` 匹配到 github-copilot，属不同 provider 的线上编码方式，不能用于判断 GOAT route 能力；profile 中的 6 档声明源自 GOAT route 实测（14 个 `ok_thinking` model 接受全部 5 档），与"模型自身 catalog 只声明 3 档"是两个层面的事实。正确路径是逐 model 确认厂商官方档位文档。
