---
id: mem-7beda8e821fd7ab528471942242fcdae
revision: 2
created_at: "2026-09-08T17:09:54.709908075Z"
updated_at: "2026-09-08T17:51:51.281820607Z"
name: api-调用默认-command-code-goat-套餐-key-而非-deepseek-官方
title: API 默认 Command Code GOAT + 官方防护 + dsh 强制显式（2026-09-09 双机落地）
description: 用户拍板：API 默认 Command Code GOAT；2026-09-09 官方 web_search 隔离 + dsh 强制显式铁律（禁关键词判定）双机落地全档案
activation: relevant
metadata:
  type: feedback
  scope: global
---

## 规则（2026-09 用户拍板）
- 所有 LLM/API 请求（dsh、Reasonix、子代理等）最先默认 Command Code GOAT 套餐 key（COMMANDCODE_API_KEY / api.commandcode.ai）
- 不默认 DeepSeek 官方 key（DEEPSEEK_API_KEY / api.deepseek.com）；官方 key 仅兜底且需先确认余额
- 教训：曾默认官方 key，两天把用户官方余额用光
- 现行配置（2026-09-10 全面升级 v4.1）：`~/.reasonix/config.toml` `default_model=commandcode-goat/deepseek/deepseek-v4.1-flash`，`vision_model` 同指 v4.1 flash（实测 v4.1 具备视觉，6 色盲测全对）；`~/.dsh/settings.yaml` 的 `agent-default-model` 与 `fallbacks.rootChain` 均为 `deepseek/deepseek-v4.1-flash`；官方 provider 段已压缩为 1 个 `deepseek-official` 兜底段

## 2026-09-09 官方余额防护改造（双机已落地）
**根因（stats 实证）**：Reasonix config.toml 4 个官方 provider（deepseek-flash/deepseek-pro/deepseek/deepseek-oai）曾开 web_search=true（官方 server-side 搜索，注释明言会增 token/费用）→ 一旦用 web_search 工具自动落官方；provider_access 含 deepseek 使桌面可手动选官方。9-06 23 次 + 9-07 5 次官方调用（usage_source=web-search）即此路径。dsh 侧（~/.dsh/settings.yaml + 主力机）本来就全 GOAT 安全。
**已做（本机+主力机）**：官方 provider 全部显式 web_search=false；provider_access=["commandcode-goat"]；官方 key 保留原值可回退。改动前备份：本机 ~/.reasonix/backup-goat-guard-20260909-014044/；主力机 AppData\Roaming\reasonix\config.toml.bak-goat-guard-20260909。

## 2026-09-09 dsh 强制显式铁律（禁止关键词自动判定）
- 旧 dsh-remote（54-59 行关键词列表）与主力机 dsh-gate-conc.ps1（$HARD_PATTERNS）按任务文本关键词（证明/推导/审计/数学/实分析…）自动升 pro——不灵活，用户拍板废除
- 新契约：调用方（Reasonix agent）必须显式为被调用端指定模型+effort。`dsh-remote -pro "任务"`（=pro+max）或 `dsh-remote -m <model> -e <effort> "任务"`；裸调用（无模型）两端均报错 exit 2 并打印用法；effort 缺省补 high
- conc.ps1 参数契约重构：$Pro string→switch（显式 pro 意图），任务文本独立走 Position=0 的 TaskText——修复裸调用文本落 $Pro 造成隐式 pro 的 PowerShell 位置绑定陷阱
- 技能：dsh-gate SKILL.md v2.0→v2.1.0（删关键词触发）；dsh-mode 81/115 行同步修正
- 双机同步：memory/skills/global-workspace 自动双向同步（改本机即达主力机）；config.toml/.env/.local/bin 被排除需双机各自改（本任务已双机完成）

## 正式指令
- ~/.reasonix/global-workspace/REASONIX.md「API 默认走 Command Code GOAT」+「官方余额防护 + dsh 强制显式铁律」小节

## 2026-09-10 全面升级 v4.1 flash（pro 弃用，全链路落地）
- **用户拍板**：「v4.1 全面上线，全部改掉」「v4.1 flash 全面超越 pro，不管什么任务都暂时用 flash，难任务多查资料多给提示词多优化几轮」+「注意 v4flash 也换成 v4.1」+「v4.1 也有视觉」
- **GOAT 实测（`GET /provider/v1/models`，69 模型）**：deepseek 系共 5 个——`deepseek/deepseek-v4.1-flash`、`deepseek/deepseek-v4-pro`、`deepseek-v4-flash`、`deepseek-v4-flash-fast`、`deepseek-v4-flash-vision-exp`；**无 v4.1-pro、无独立 v4.1-vision**
- **v4.1 视觉实证（本机直连 GOAT chat/completions）**：给 v4.1 发 6 张纯色 PNG（红/绿/蓝/黄/紫/橙），**6/6 回答正确、0 错误**。⚠️ GOAT 网关 `completion_tokens_details.image_tokens` 恒为 0（连官方 vision 专用模型也是 0），**该字段不可作为视觉能力判据**
- **官方 api.deepseek.com 实测**：`GET /models` 只返回 2 个 id —— `deepseek-flash`（**已去掉 v4 前缀**！）、`deepseek-v4-pro`；**官方无 v4.1**
- **落地清单**：config.toml（default_model + vision_model + GOAT vision_models 全指 v4.1；GOAT models 移除 vision-exp；删陈旧 model_overrides）；`~/.dsh/settings.yaml`（agent-default-model + fallbacks + 从 models 列表移除 v4-flash/v4-flash-fast/vision-exp）；**官方 4 段压缩为 1 段 `deepseek-official`**（模型 id 修正为官方真实 id `deepseek-flash`/`deepseek-v4-pro`）；subtitleedit SKILL.md（DeepSeekModel + dsh 调用改 v4.1）；global-workspace/REASONIX.md；dsh-gate SKILL.md v2.2；bilingual-ocw-translator v3.2
- **备份**：本机 `~/backups/20260910-v41-flash/`（config.toml.before-v41-full、settings.linux.before-v41-full.yaml、subtitleedit SKILL.md、REASONIX.md）；主力机 `.bak-20260910-v41`
