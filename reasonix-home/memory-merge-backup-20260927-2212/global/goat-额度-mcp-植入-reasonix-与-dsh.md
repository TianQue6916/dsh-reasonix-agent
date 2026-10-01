---
id: mem-b7c083866060279a52c3a4de7c8dd1cc
revision: 1
created_at: "2026-09-24T15:17:20.3665965Z"
updated_at: "2026-09-24T15:17:20.3665965Z"
name: goat-额度-mcp-植入-reasonix-与-dsh
description: 把 GOAT 额度以 MCP 方式植入 Reasonix 与 dsh（一个零依赖 stdio server 两边共用）：配置命令、工具名规则、preset 收窄与并发缓存两个大坑
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 交付（2026-09-24）：一个 stdio MCP server，Reasonix 与 dsh 共用植入

### MCP server
- `D:\Toolbox\goat-gateway\mcp-goat-quota.mjs` —— **零依赖**（仅 node 内置模块），手写 JSON-RPC stdio MCP
- 工具：`goat_quota`（参数 `account` 可选、`raw` 可选）→ 返回 5h/周/月的百分比+已用/上限+重置时间+月剩余 + 阈值告警提示
- 数据源：`goat-usage.ps1 -Json -CacheSeconds 60 -CacheFile <独立缓存>`（账户元数据，不消耗额度）
- 自检：`echo <jsonrpc行> | node mcp-goat-quota.mjs`（连打多次验证并发安全）

### Reasonix 植入（已实测 agent 可调用）
```
reasonix mcp add goat-quota -- node D:\Toolbox\goat-gateway\mcp-goat-quota.mjs
```
- 全局写入 `config.toml`；`reasonix mcp list` 显示 `goat-quota (stdio)`
- 会话里工具名：`mcp__goat-quota__goat_quota`（实测 agent 自己调用并总结出正确数据）

### dsh 植入（已实测 headless 首轮可用）
两个 profile 的 `cordis.patch.yml` 各加一条（web 与 headless）：
```yaml
- id: mcp-goatquota
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: goatquota          # 无连字符，工具名可预测
    transport: stdio
    command: node
    args: ['D:/Toolbox/goat-gateway/mcp-goat-quota.mjs']
```
**关键**：headless 的 `bootstrapTools` 必须加上工具名，否则首轮看不到：
```yaml
bootstrapTools: [pwsh, str_replace_editor, mcp__goatquota__goat_quota]
```
- 工具名规则：`mcp__<serverName>__<tool>`
- 验证：`dsh --profile headless "查询 GOAT 套餐额度"` → 首轮直接调用成功

### 踩坑（重要）
1. **dsh 的 anchored-standard preset 会收窄工具目录**：任何第三方工具（本地插件或 MCP）首轮都不可见，headless 一次性会话基本停在首轮 → **必须把它加进 `bootstrapTools`**（或 resident 集）。之前做的本地插件 `dsh-plugin-goat-quota` 因此从没被看到过，已改为 MCP 方案
2. **并发写缓存 → “Unexpected end of JSON input”**：多个调用同时写 `%TEMP%\goat-usage-cache.json`，读者拿到半截 JSON。修法三件套：
   - `goat-usage.ps1` 缓存改为**原子写**（写 `*.tmp-$PID` 再 `Move-Item -Force`）
   - `goat-usage.ps1` 新增 **`-CacheFile <path>`** 参数，MCP 用独立缓存文件（`os.tmpdir()/goat-quota-mcp-cache.json`）避免与挂件/看门狗争用
   - MCP server 解析失败时带 **`-Force`** 重试一次
3. PS 脚本改 param 时注意：文件里行尾可能是 `\n` 或 `\r\n`，直接 `.Replace` 容易未命中 → 用 `[regex]::Replace($t,'(?m)^\s*\[string\]\$KeysFile\s*$', ...)` 更可靠，**改完必须实测 `-CacheFile` 是否被识别**
4. Windows 上 node 调 PowerShell：`execFileSync('powershell', [...], { encoding:'utf8', windowsHide:true, maxBuffer:4MB })`

### 桌面挂件已停用
用户明确“不要图像了，只要额度，要植入 reasonix 和 dsh” → `GoatQuotaTray` 计划任务已 **Disable**（文件全部保留在 `D:\Toolbox\goat-gateway\`，含 `goat-tray.ps1`、`whalegirl-widget.cs`、`assets\pets\*`），随时可恢复。

### 仍可选的下一步（用户未确认）
若想让额度**每次对话自动出现**（而非主动问），需要 Reasonix 的 `SessionStart` / `UserPromptSubmit` hook：配置面在 `<Reasonix home>/settings.json`（项目级 `.reasonix/settings.json`），当时探测到写 `{"hooks":{...}}` 会报 `malformed`，schema 未解 → 待查。
