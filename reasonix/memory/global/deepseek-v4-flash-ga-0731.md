---
id: mem-f257f309d7f46b15fdf4ecfcebddbc9f
revision: 2
created_at: "2026-08-03T11:33:47.320266067Z"
updated_at: "2026-09-30T12:32:55.519Z"
name: deepseek-v4-flash-ga-0731
description: "DeepSeek V4 Flash 正式版 0731 上线 + 2026-08-03/04 网页版补充：与 Pro 预览版对比、分工结论、flash 的 JSON tool-call bug"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# deepseek-v4-flash-ga-0731

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

---

## 网页版对话补充（2026-08-03 / 08-04 抓取，归档页 `DS_Flash正式版超Pro预览版`、`DS_DeepSeek今早异常原因`）

### 与 V4-Pro 预览版的正面对比（当时的口径）
| 维度 | V4-Flash 正式版 | V4-Pro 预览版 |
|---|---|---|
| 规模 | 284B 总参 / 13B 激活 | 1.6T 总参 / 49B 激活 |
| API 价 | 输入 ¥1 / 输出 ¥2（每百万 tokens） | 输入 ¥12 / 输出 ¥24 |
| 定位 | 性价比 + agent/工具调用/规划 | 硬核推理上限（数学/STEM/竞赛级代码） |
| 基准 | Terminal Bench 2.1 **82.7**；Artificial Analysis 智能指数 **50** | Terminal Bench 2.1 67.9；智能指数 44（两者测试集不同，仅供参考） |

### 当时的可用范围与分工结论
- 2026-08-03 时点：Flash 正式版**仅 API 公测**，App / 网页端还体验不到；Pro 正式版"近期发布"
- 分工结论：**复杂计算机理论推理继续交给 Pro（预览版）**；agent 类、工具调用、批量化任务给 Flash 正式版
- 注意基准的可信边界：部分成绩在 DeepSeek 自研 **Harness** 框架下测得，框架未公开 → 是「模型 + 框架」的组合成绩，需独立评测复核

### 2026-08-04 早上 flash 不稳定的两种公开解释
1. 调用量暴增（8-01 单日约 8 万亿 tokens，服务器压力）
2. 社区反馈 bug：**强制工具调用 + 长 prompt 时约 40–60% 概率生成格式错误的 JSON**（仅社区说法，未独立验证；若排查 dsh/GOAT 侧 tool call 解析失败，这是可疑原因之一）
