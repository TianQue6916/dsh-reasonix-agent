---
id: mem-4e30fdb224ab0f7cf5ab1dd4f1fabea1
revision: 2
created_at: "2026-09-20T01:27:40.78676Z"
updated_at: "2026-09-20T01:31:13.4102564Z"
name: tool-dsh-maxtokens-config-20260920
title: dsh 输出上限（maxTokens）配置档案（2026-09-20）
description: dsh 输出上限（maxTokens）配置：adapter 默认 32768 的来源、已设 defaultMaxTokens 65536 + 4 模型 262144、GOAT 各模型实测接受度表、验证方法与探测命令、以及放开后的长输出实测（中度成功 / 超长遇 TRANSPORT 中断）
activation: relevant
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh 输出上限（maxTokens）配置档案（2026-09-20）

## 背景
用户要求「让 dsh 不要有输出上限」。历史坑：长任务输出被截断（Strang 注扩写 30KB 只出 11 条）。

## 上限来源
dsh 的 `@deepseek-ai/dsh-llm-pi-ai` adapter 内置 **`DEFAULT_MAX_TOKENS = 32768`**。模型条目不写 `maxTokens` 就全部走它。解析链：`entry.maxTokens ?? base?.maxTokens ?? request.defaultMaxTokens`（provider 级字段名 `defaultMaxTokens`）。
注意：`settings.yaml` 里的 `maxTokensField: max_tokens` 只是**字段名映射**（请求体里用哪个键），不是值，不要误读为已设上限。

## 已做的修改（~/.dsh/settings.yaml；备份 settings.yaml.bak-20260920-maxTokens）
- provider 级（commandcode-goat）：**`defaultMaxTokens: 65536`** —— 全局兜底，窄上限模型（GLM/Gemini）也能接受
- 逐条 **`maxTokens: 262144`**：`deepseek/deepseek-v4-pro`、`deepseek/deepseek-v4.1-flash`、`moonshotai/Kimi-K3`、`gpt-5.6-sol`

## GOAT 实测接受度（直连 /provider/v1/chat/completions 探测，非推断）
| 模型 | 32768 | 65536 | 131072 | 262144 | 393216 |
|---|---|---|---|---|---|
| deepseek-v4.1-flash / v4-pro | ✓ | ✓ | ✓ | ✓ | ✓ |
| moonshotai/Kimi-K3、gpt-5.6-sol | - | - | - | ✓ | - |
| zai-org/GLM-5.3 | ✓ | ✓ | ✓ | ✗ | ✗ |
| google/gemini-3.8-flash | ✓ | ✓ | ✗ | ✗ | - |
| claude-*（8 个条目） | 走 `/provider/v1/messages`（Anthropic 形状）；在 chat/completions 下报 `must be called via /provider/v1/messages` |

**铁律**：设大值前必须逐模型确认，否则该模型任务以 400 失败（真实上限：GLM ≤ 131072、Gemini ≤ 65536）。

## 验证方法（改完必做）
1. `dsh --profile headless --dump-config` → 确认 schema 接受新字段（exit 0 无报错）
2. 跑一次 dsh-gate 调用，解压最新会话 `session.v3.jsonl.zstd` 看 `request/header` 的 `data.header.config` —— 应出现 `"maxTokens":262144`（**未配置时该字段不出现**），并伴 `adapterDefaults: {"maxTokens": true}`
3. gate 独立副本自动继承：`settings-<id>.yaml` 由全局 settings 全文替换 model/effort 生成，实测副本内含 1 处 `defaultMaxTokens` + 4 处 `maxTokens: 262144`

## 实测：放开上限后的长输出行为（同日）
- **中等长度**（要求 5000 汉字）：完整输出，结果文件 22.7KB / 6173 汉字，无截断 ✓
- **超长**（要求 30000 汉字 ≈ 40K tokens）：请求正常发出（config 已带 262144），但流式响应中途失败 —— 事件 `llm/retry` failure: `{"message":"Stream ended without finish_reason","code":"TRANSPORT"}`，随后 `llm/retry-started`（策略：maxRetries=5、退避 500ms→10s、抖动 0.1，覆盖 EMPTY_RESPONSE/RATE_LIMIT/SERVER/TIMEOUT/TRANSPORT）；该会话 15 分钟无新事件，最终手动停掉进程
- **结论**：max_tokens 放开解决的是「被上限截断」；一次生成几万字的**流式传输时长/稳定性**是独立瓶颈 → 长任务仍应分块（与既有翻译分块 ≤18KB 规范一致）。另一个可选缓解：用 `fs-observation-policy`/工具分块写盘 —— 或直接用 maxTokens 更小的稳健值。
- 诊断入口：会话事件里的 `llm/retry` / `llm/retry-started` / `assistant/attempt`；gate 无 kill 参数，卡住时按进程命令行字符串（含 TaskId）定位 node/runner 进程

## 未了疑点
`claude-*` 系列在 GOAT 上只能走 Anthropic Messages 形状，而 settings 里 provider 级写的是 `api: openai-completions` —— **dsh 能否正常调用 claude 系尚未验证**，需要时单独确认。

## 细节
`dsh-mode` 技能第六节末尾「输出上限（maxTokens）」小节；Linux 天阙机同步时需一并带上这两处配置。
