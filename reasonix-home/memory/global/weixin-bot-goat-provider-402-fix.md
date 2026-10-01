---
id: mem-0dff6e626fabb1dfd0d9ce859466f63f
revision: 1
created_at: "2026-09-20T06:22:59.926319Z"
updated_at: "2026-09-20T06:22:59.926319Z"
name: weixin-bot-goat-provider-402-fix
title: 微信 bot HTTP 402：bot home 配置落后于桌面版，已切 GOAT（2026-09-20）
description: 微信 bot 回复出错（HTTP 402）根因与修复：reasonix-bot home 的 config.toml 仍是官方 DeepSeek provider 且官方已欠费 -0.22；已补 COMMANDCODE_API_KEY 并切到 commandcode-goat（两处配置面需同步的教训）
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 微信 bot 报“出错” — 根因是 bot home 的 provider 配置落后于桌面版（2026-09-20 修复）

## 现象
微信端向 bot 发消息，bot 回复出错。日志：`level=WARN msg="turn error" err="provider \"deepseek · Chat Completions\" credits or subscription quota exhausted (HTTP 402)"`

## 根因（两个叠加）
1. **bot home 的配置没跟上桌面版**：`C:\Users\27063\AppData\Roaming\reasonix-bot\config.toml` 仍是旧配置——`default_model = "deepseek/deepseek-v4-flash"`、`provider_access = ["deepseek"]`、三个 provider 全指 `https://api.deepseek.com` + `DEEPSEEK_API_KEY`。而桌面版已是 `commandcode-goat/deepseek/deepseek-v4.1-flash`。
2. **官方 key 已欠费**：`https://api.deepseek.com/user/balance` 返回 `is_available: false`，`total_balance: "-0.22"` → 所有官方调用 402。

关键点：bot gateway 用独立 home（`check_bot_leader.ps1` 里 `$env:REASONIX_HOME = reasonix-bot`），**读的是 reasonix-bot 自己的 config.toml 和 .env，不会跟随桌面版的 GOAT 切换**。且 bot 的 `.env` 当时只有 `DEEPSEEK_API_KEY`，连 `COMMANDCODE_API_KEY` 都没有。

## 修复（已落地并验证）
1. 把 `COMMANDCODE_API_KEY` 行从 `%APPDATA%\reasonix\.env` 追加到 `%APPDATA%\reasonix-bot\.env`（用脚本复制该行，不打印值）。
2. 改 `%APPDATA%\reasonix-bot\config.toml`：
   - `default_model` → `commandcode-goat/deepseek/deepseek-v4.1-flash`
   - `provider_access` → `["commandcode-goat"]`
   - 从桌面版 config.toml 正则提取 `[[providers]]` 中 `name = "commandcode-goat"` 整段（约 3198 字符）插入到主 `[tools]` 段之前
   - 备份：`config.toml.bak-20260920-goat-switch`
3. 重启 gateway：提权 `Stop-Process` 掉 `reasonix-bot.exe`（Session 0，必须 UAC），监督脚本下一分钟自动用新配置拉起。

验证：启动行变为 `reasonix bot starting (model: commandcode-goat/deepseek/deepseek-v4.1-flash, channels: weixin)`，且 `bot send completed` —— 回复链路恢复，无 402。

## 教训
- **Reasonix 有三个独立配置面**：桌面/CLI 用 `%APPDATA%\reasonix\`，bot gateway 用 `%APPDATA%\reasonix-bot\`。改 provider / model / key 时**两处都要改**，否则 bot 会静默跑在旧 provider 上。
- `config.toml.opencode-go-v10.json` 只是 Reasonix 自己的 config schema 版本标记（version/committed/config_hash），不是外部覆盖机制，不会吃掉手改。
- 遇 HTTP 402 先查 `balance_url` 返回的余额，不要盲目改代码。
- 当前官方 DeepSeek 余额：**-0.22 CNY（is_available=false）**，如需用官方必须先充值。
- bot home 的独立目录设计（避免双 gateway）导致配置漂移，以后升级/切换模型后应同时校对两边。
