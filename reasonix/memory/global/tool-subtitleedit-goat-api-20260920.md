---
id: mem-a6e30aa052bac535c46b34e3273bbed9
revision: 1
created_at: "2026-09-20T01:52:12.5278751Z"
updated_at: "2026-09-20T01:52:12.5278751Z"
name: tool-subtitleedit-goat-api-20260920
title: SubtitleEdit 接入 Command Code GOAT（2026-09-20）
description: SubtitleEdit 翻译引擎已改指 Command Code GOAT：Settings.json 三个字段（DeepSeekUrl/Model/ApiKey）、端到端实测数据、reasoning 占比与速度对比、两个验证坑（.zh-CN.srt 产物名 + PS 5.1 编码 mojibake）、改法与回退
activation: relevant
metadata:
  type: user
  fact_type: reference
  scope: global
---

# SubtitleEdit 翻译引擎已改指 Command Code GOAT（2026-09-20）

## 改了什么（只有 3 个字段，其余零改动）
`D:\20-工具\Subtitle Edit\Subtitle Edit\Settings.json` → `AutoTranslate` 块：
- `DeepSeekUrl`: `https://api.deepseek.com/chat/completions` → `https://api.commandcode.ai/provider/v1/chat/completions`
- `DeepSeekModel`: `deepseek-v4-flash` → `deepseek/deepseek-v4.1-flash`
- `DeepSeekApiKey`: DeepSeek 官方 key（长度35） → GOAT key（取自 `C:\Users\27063\.dsh\.env` 的 `COMMANDCODE_API_KEY`，长度 93、`user_` 开头）

**引擎槽位仍叫 DeepSeek**（SE 的引擎名），所以 skills/subtitleedit 的整套 GUI 流程与 `se-*.ps1` 脚本零改动 ✓

## 关键事实
- GOAT 端点：**必须完整路径** `https://api.commandcode.ai/provider/v1/chat/completions`；`/v1/chat/completions` 与 `/chat/completions` 都 404。返回标准 OpenAI `chat.completion` 形状。
- **端到端实测通过**：8 行英文字幕 → 30 秒译完（exit 0），译文 110 个中文字符，术语格式符合用户 prompt 铁律（`一个 hash function（散列函数）将任意大小的数据映射到固定大小.`）。
- **批量实测**：50 行（5.8KB 请求体）单请求 → `finish=stop`、50/50 全译无截断、耗时 48s。
- **reasoning 占大头**：50 行请求 completion 11153 tokens 中 reasoning=9382（84%），故速度主要花在思考上。速度对比：原 DeepSeek 直连约 37s/请求（1275 行 16 分钟），GOAT 约 48s/请求 → 同量级，无显著退化。
- **`max_tokens` 无需设置**：SE 不发该字段时 GOAT 默认额度够用。反面实测：`max_tokens=2048` 时 reasoning 占 1977 → content 被截断（译文半截）。若将来配置里出现该字段，必须 ≥8192。

## 两个坑（都会误导判断）
1. **产物文件名**：`se-translate-one.ps1` 走“另存为”分支，译文保存为 **`<原名>.zh-CN.srt`**（如 `test-goat.zh-CN.srt`），**不覆盖原文件**；原文件 mtime 会变但内容仍为英文。只查原文件会误判为“保存失败”。
2. **PowerShell 5.1 编码**：`Invoke-RestMethod`/`Invoke-WebRequest` 读 JSON 响应按 ISO-8859-1 解码 → 中文变 `æä»¥ä»å¤©` mojibake（**不是 API 问题**）。必须 `$r.RawContentStream.ToArray()` + `UTF8.GetString()` 显式解码。

## 改法与回退
- 改前必须**关闭 SE**（SE 退出会写回 Settings.json 覆盖改动）。文件是 **UTF-8 无 BOM**，写回用 `UTF8Encoding($false)`。
- **禁止** `ConvertFrom-Json` → `ConvertTo-Json` 回写这 106KB 嵌套配置（`-Depth` 会截断、结构会重排）。用正则只替换那 3 个字段的字面值。
- 备份（含原 DeepSeek 官方 key）：`Settings.json.bak-20260920-goat`。回退 = 拷回该文件（同样需先关 SE）。
- SE 支持手输任意模型名（官方确认），故改用 GOAT 的 `provider/model` 形式不会受下拉限制。
- 其他可用槽位（本次未动）：SE 还有专门的 `OpenAI Compatible` 引擎（`OpenAiCompatibleUrl/Model/ApiKey/Prompt`），任何 OpenAI 兼容服务都能接。

## 测试产物（可复查）
- `C:\Users\27063\AppData\Local\Temp\se-goat-test\test-goat.srt`（英文原）
- `C:\Users\27063\AppData\Local\Temp\se-goat-test\test-goat.zh-CN.srt`（GOAT 译文，953B）
- 脚本：`C:\Users\27063\.reasonix\global-workspace\scripts\subtitleedit\se-translate-one.ps1 -Srt <path> -TimeoutMin 8`

## 技能
`skills/subtitleedit/SKILL.md` 第四节已重写为 GOAT 配置表 + 实测数据 + 两个坑（description 同步更新）。
