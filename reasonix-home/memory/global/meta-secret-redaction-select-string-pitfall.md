---
id: mem-f84ab53d733da625271a3a8b7b56567a
revision: 1
created_at: "2026-09-20T01:52:41.8873941Z"
updated_at: "2026-09-20T01:52:41.8873941Z"
name: meta-secret-redaction-select-string-pitfall
title: 教训：校验含密钥配置时禁用 Select-String 打印整行
description: 教训：用 Select-String 校验含密钥的配置文件会打印整个匹配行，导致 API key 明文进入会话记录（2026-09-20 对 SE Settings.json 的真实案例）；含正确脱敏写法与事后补救
activation: relevant
metadata:
  type: feedback
  scope: global
---

# 教训：校验含密钥的配置文件时绝不能用 Select-String 直接打印

## 事件（2026-09-20）
改完 SubtitleEdit 的 `Settings.json`（里面含 GOAT API key）后，我用
```powershell
Select-String -LiteralPath $f -Pattern '"DeepSeekUrl": "[^"]*"', '"DeepSeekApiKey": "[^"]{0,10}'
```
想“只显示前 10 个字符”做校验——**结果 `Select-String` 返回的是整个匹配行（`$_.Line`），不是匹配片段**，把 93 字符的 API key 明文打进了工具输出与会话记录。

## 铁律
1. **凡是校验/查看含 secret 的文件（.env、settings.yaml、Settings.json、config）**，禁止 `Select-String … | ForEach-Object { $_.Line }` 这种“打印整行”写法。
2. 正确做法：用 `[regex]::Match()` 取值后**自己截断**，或者只判存在性：
   ```powershell
   $m = [regex]::Match($raw, '"DeepSeekApiKey"\s*:\s*"([^"]*)"')
   "len=$($m.Groups[1].Value.Length) prefix=$($m.Groups[1].Value.Substring(0,5))***"
   ```
3. 更稳的做法：根本不要把 secret 文件当纯文本读，改为“读 JSON → 取字段长度/前后缀”或只做 `-match` 布尔判定（`if ($raw -match $pattern) { '已设置' }`）。
4. 事后补救：立即告知用户并建议轮换 key（自己发现也主动报告，不隐瞒）。

## 附带教训
- 读 API 响应时用 PS 5.1 的 `Invoke-RestMethod` 会把 UTF-8 中文字节按 ISO-8859-1 解 → mojibake（`æä»¥ä»å¤©`）；必须 `$r.RawContentStream.ToArray()` + `UTF8.GetString()`。
- 验证截图/文件名时先 `Get-ChildItem` 列目录：SE 的“另存为”产物是 `<原名>.zh-CN.srt`，只查原文件会误判为“保存失败”。
