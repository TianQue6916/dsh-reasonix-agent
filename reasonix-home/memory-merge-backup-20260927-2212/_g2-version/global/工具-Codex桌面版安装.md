---
id: legacy-f248eae97089e5e13cc0aaa2
revision: 1
created_at: "2026-07-13T23:13:45.894035Z"
updated_at: "2026-07-13T23:13:45.894035Z"
name: 工具-codex桌面版安装
description: OpenAI Codex Desktop App v26.609.4994.0 安装与配置记录
metadata:
  type: user
  fact_type: reference
  scope: global
---

# Codex Desktop App 安装与配置（2026-06-15）

## 安装
- **版本**：OpenAI Codex v26.609.4994.0 (x64)
- **安装方式**：从 codexapp.agentsmirror.com/latest/win 下载 MSIX，`Add-AppxPackage` 安装
- **安装包存档**：`D:\Toolbox\Codex\Codex.Msix`（526MB）
- **快捷方式**：`D:\Toolbox\Codex.lnk`（指向 `shell:AppsFolder\OpenAI.Codex_2p2nqsd0c76g0!App`）

## DeepSeek API 配置
- **API Key**：`sk-REDACTED`（已设用户环境变量）
- **config.toml**：`~/.codex/config.toml`
  - model = "deepseek-v4-pro", provider = "deepseek"
  - base_url = "https://api.deepseek.com", env_key = "DEEPSEEK_API_KEY"
- ⚠️ Codex 用 Responses API，DeepSeek 用 Chat Completions API，可能有协议不匹配，需要 CC Switch 或 OpenRouter 桥接

## 技能同步（50个 Reasonix → 54个 Codex skills）
- 40 个目录型技能 → 复制到 `~/.codex/skills/<name>/SKILL.md`
- 10 个文件型技能 → 转为目录+SKILL.md
- 新增 4 个：`offline-wiki`, `aigc-deguessing`, `toolbox-locations`, `learning-profile`

## 记忆同步
- `~/.codex/AGENTS.md` — 用户身份、方舟计划、学习体系、通用规则
- 路由规则已编入技能 descriptions
- AIGC 降率经验、离线维基搜索代码、工具箱路径已转为技能 references
