---
id: mem-4eb1d1ed0dc50d266b5caddc9fb2eda4
revision: 1
created_at: "2026-09-27T02:10:54.470Z"
updated_at: "2026-09-27T02:10:54.470Z"
name: correction-deepseek-v41-flash-has-native-vision-20260927
description: "纠错：DeepSeek V4.1 Flash 原生多模态（非 text-only），dsh 与 GOAT 网关均支持图片透传；modlens 非必需（仅对确认 text-only 的模型如 v4-pro 生效）"
metadata:
  type: user
  fact_type: feedback
  scope: global
---

# 纠正：DeepSeek V4.1 Flash **原生有视觉**，modlens 非必需（2026-09-27）

## 一、我错在哪
我基于 `liustack/modlens` README 的说法（"DeepSeek's flagship chat models and GLM-5.3 itself are **text-only** and cannot read images"）判断"用户看不到图"，并据此装了 modlens。**没先查证 v4.1 的实际能力** —— 用户直接指出「v4.1 不是有视觉吗」，查证后确认用户是对的。

## 二、证据（三条独立来源）
| 来源 | 内容 |
|---|---|
| `litianshuo110/dsh-ds-vision-auto-route` | **[DEPRECATED]** "DeepSeek V4.1 Flash is **natively multimodal**; DeepSeek Harness 0.1.5-rc.2+ ships `deepseek-flash` with image input, so this routing plugin is no longer needed." |
| `NousResearch/hermes-agent` 源码 `agent/models_dev.py` | `("deepseek","deepseek-v4-flash"): _DEEPSEEK_FLASH_VISION` / `("deepseek","deepseek-v4.1-flash"): _DEEPSEEK_FLASH_VISION`；注释："Native DeepSeek V4.1-Flash is multimodal (api-docs.deepseek.com/guides/vision)" |
| `lidge-jun/opencodex` 源码 | "The Go gateway's `deepseek-v4.1-flash` was declared text-only from jawcode metadata and **was measured natively multimodal on 2026-09-19**" |
| vllm-ascend 文档 `DeepSeek-V4.1-Flash.md` | 调优参数点名 "image sizes" |

## 三、端到端链路核查（本机）
1. **模型**：`settings.yaml.imported` 第 5 行 `model: deepseek/deepseek-v4.1-flash` = 用户在用的主模型，原生多模态 ✓
2. **harness**：dsh 0.1.5-rc.2+ 支持 image input；本机有 `dsh-attachment-local`（附件存储）✓
3. **网关**：`D:\Toolbox\goat-gateway\gateway.mjs` 是**透明代理** —— 唯一的 `content` 字符串化在 `sessionFingerprint()` 里（第 297 行，仅用于按首条 user message 算会话粘 key 的 hash），转发路径是原样 Buffer + 重设 content-length（第 614-627 行）→ **图片能透传** ✓

## 四、modlens 的真实适用边界（留着还是卸掉）
modlens 的自述判定逻辑：**"only a model its metadata positively confirms text-only is taken over, anything unconfirmed is left alone"** —— 也就是说：
- 对 **v4.1-flash**（多模态）：**不接管**（无害也无用）
- 对 **v4-pro**（若确为 text-only）：会给它加一个 `(modlens vision)` 包装 entry → 有实际价值
- 对**元数据缺失**的模型（GOAT 网关的模型列表就没有 capability/vision 字段）：**不接管** → 安全

→ **结论**：modlens 留着无害（且对 v4-pro 这类 text-only 模型有用），但**不是刚需**；若只跑 v4.1-flash 可以卸掉。

## 五、真正的验证方法（比读文档都强）
往 dsh 聊天框**直接粘一张图**：
- 能正常识别 → v4.1 视觉端到端可用，modlens 纯属冗余
- 报错/看不见 → 才需要查 harness 或网关的图片通路

## 六、教训
**不要用第三方插件的营销文案去推断用户自己模型的能力** —— 应该先查该模型的官方文档/源码标记，或者直接实测。这次是用户比我更了解自己的工具链（v4.1 有视觉）。
