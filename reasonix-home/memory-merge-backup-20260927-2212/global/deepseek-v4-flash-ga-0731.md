---
id: mem-f257f309d7f46b15fdf4ecfcebddbc9f
revision: 1
created_at: "2026-08-03T11:33:47.320266067Z"
updated_at: "2026-08-03T11:33:47.320266067Z"
name: deepseek-v4-flash-ga-0731
title: DeepSeek V4 Flash 正式版（0731 同名升级）
description: DeepSeek V4 Flash 正式版 0731 上线：同名原地升级，模型 id 不变，Reasonix 零改动自动生效
metadata:
  type: user
  fact_type: reference
  scope: global
---

# DeepSeek V4 Flash 正式版上线（同名原地升级）

## 关键事实（2026-07-31 官方更新日志）
- **DeepSeek-V4-Flash 正式版（版本号 `DeepSeek-V4-Flash-0731`）API 上线公测**
- **切换机制 = 同名原地升级**：模型 id 不变（仍是 `deepseek-v4-flash`），服务端直接替换该 id 指向的权重，客户端（Reasonix 等）零改动自动生效
- 0731 与 Preview 模型结构、尺寸完全一致，仅重新做了后训练（post-training）
- Agent 能力大幅增强，官方基准远超 V4-Pro-Preview：Terminal Bench 2.1: 82.7、NL2Repo: 54.2、Cybergym: 76.7、DeepSWE: 54.4、Toolathlon verified: 70.3、DSBench-Hard: 59.6
- 价格不变：输入 ¥1/百万 tokens（缓存命中 ¥0.02）、输出 ¥2/百万 tokens，并发 2500
- 正式版原生支持 Responses API 格式并针对性适配 Codex
- **DeepSeek-V4-Pro 正式版尚未发布**，Pro API 未改动；官方称"尽快发布"（2026-08 初 Pro 将支持 Responses API）

## Reasonix 侧状态
- `~/.reasonix/config.toml` 无需修改：`default_model = "deepseek/deepseek-v4-flash"` 已正确，2026-07-31 起所有 flash 调用自动为正式版
- 实测验证：`GET /models` 返回 `deepseek-v4-flash`、`deepseek-v4-pro` 两个 id；chat/completions 调用正常

**How to apply:** 未来若 DeepSeek 再升级模型版本，先查 https://api-docs.deepseek.com/zh-cn/updates 更新日志确认是"同名原地升级"还是"新 id"——前者无需动配置，后者才需要改 `config.toml` 中三处模型名。
