---
id: mem-9b7f5813da8219ac4f2fe02a411634f2
revision: 1
created_at: "2026-09-30T13:29:38.971Z"
updated_at: "2026-09-30T13:29:38.971Z"
name: dsh-maxtokens-上限实测与校正-20260930
description: "上游 max_tokens 硬顶 393216、各 model 实测上限表、三 profile 的 maxTokens 已按实测校正（46 提高/38 降低）、prompt+max≤context 约束与并发写入者风险"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 上游硬约束（2026-09-30 实测，逐个 model 探明）

1. **relay 层**：`max_tokens` 合法域 `[0, 393216]`。`393216` → 200，`393217` → 400 `must be between 0 and 393216`。**"不限量"的工程上限就是 393216**（= 384K）。
2. **每个 model 有自己的上限**，超了 400，错误信息里直接给数字：
   - `Range of max_tokens should be [1, N]`（Qwen 系）
   - `The maximum tokens you requested exceeds the model limit of N`（MiniMax / Kimi / GLM）
   - `限制数值范围[1,N]`（z-ai）
   - 部分 model（Kimi-K2.5 / GLM-5 / MiniMax-M2.5）还额外要求 **`prompt_tokens + max_tokens ≤ context_window`**，所以顶到上限只在空 prompt 下成立。
3. 只有 **29/87** 个 model 能吃下 393216，一刀切必炸。

## 实测出的各 model 上限（带 ~7k token padding 复测确认）

| 上限 | model |
|---|---|
| 393216 | deepseek/deepseek-v4.1-flash、v4.1-flash-fast、v4-flash、v4-flash-fast、v4-flash-vision-exp、v4-pro、Kimi-K2.6、Kimi-K2.7-Code-Highspeed、Kimi-K3、GLM-5.1、GLM-5.2-Fast、gpt-5.6-luna/sol、gpt-6-luna、muse-spark-1.2/1.2-contributor/1.3/1.3-contributor、nemotron-3-ultra、stepfun Step-3.5/3.7/5-Preview、xai grok-4.5/4.6/4.7、tencent/hy4-preview、Qwen3.8-27B、MiniMax-M3、space-bunny-alpha |
| 262144 | moonshotai/Kimi-K2.7-Code |
| 196608 | moonshotai/Kimi-K2.5 |
| 131072 | Qwen3.7-Flash/Max/Plus、Qwen3.8-Flash/Max/Max-0902/Omni-Flash、LongCat-2.0、z-ai/glm-5.3-flash(+flashx)、zai-org/GLM-5.2/5.3、MiniMax-M2.5、tencent/hy3-paid、xiaomi/mimo-v2.5 |
| 98304 | zai-org/GLM-5 |
| 65536 | Qwen3.6-Plus、Qwen3.6-Max-Preview、google/gemini-3.8-flash、xiaomi/mimo-v2.5-pro |
| 32768 | poolside/laguna-s-2.1-free、inclusionai/ling-3.1-flash:free |

无法验证（保持原值）：MiniMax-M2.7、thinkingmachines/inkling、inkling-small（`No available providers match the 'only' filter`）、claude-sonnet-5-5（须走 `/provider/v1/messages`）。

## 已应用的改动

三个 profile 的 `commandcode-goat` 路由行：**desktop 40 处 / web 40 处 / headless 4 处** maxTokens 改为上表实测值（提高 46 / 降低 38）。备份 `cordis.patch.yml.bak-20260930-2128-pre-maxtok-ceiling`。

**重要背景**：原声明 262144 里有 **19 个 model 的真实上限低于它**（Qwen3.6/3.7/3.8 全家、zai-org GLM-5/5.2/5.3、z-ai/glm-5.3-flash、MiniMax-M2.5、Kimi-K2.5、xiaomi/mimo-v2.5(-pro)、tencent/hy3-paid、google/gemini-3.8-flash、poolside/laguna-s-2.1-free）——这些 model 在改动前**一调用就 400**，属于实际坏配置，不只是"上限不够大"。

验证链：`verify-maxtok.py` 结构 diff（desktop/web/headless 分别 40/40/4 处 maxTokens 叶子变化，非 maxTokens 字段 0 改动）+ `dsh --profile web|headless --dump-config` exit=0。

## 风险提示

`dsh-llm-pi-ai` 把模型级 `maxTokens` 当作每个请求的默认 `max_tokens`（`lib/index.js:677` 取值：`entry.maxTokens ?? base?.maxTokens ?? request.defaultMaxTokens`）。因此声明 393216 后，**长 prompt + 393216 输出**可能触发 `prompt_tokens + max_tokens ≤ context_window` 校验。若遇到 `maximum context length` 类 400，把该 model 的 maxTokens 降到 ~262144 即可。

## 环境副作用（避坑）

`~/.dsh/profiles/*/cordis.patch.yml` **可能有并发写入者**（本次实测到 21:13→21:28 期间有另一个进程写入了 `thinking-anchor` plugin 注册 + thinking-language directive 文本，+20 行）。改动前后务必留备份 + 结构 diff，不要假设只有自己在改这个文件。
