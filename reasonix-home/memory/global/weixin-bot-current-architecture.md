---
id: mem-8f4adb0d50ee8a6144ed419f7cf09eca
revision: 1
created_at: "2026-09-28T04:52:41.882Z"
updated_at: "2026-09-28T04:52:41.882Z"
name: weixin-bot-current-architecture
description: "微信 bot 现状架构基线：官方 iLink 协议、改名副本与独立 home、leader 由 bot 内置、凭据位置与 bot 配置形态"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 微信 bot 现状架构（迁 dsh 前的基线，2026-09-28 实测）

## 走的是腾讯官方 iLink，不是第三方逆向

```
base_url : https://ilinkai.weixin.qq.com     ← 腾讯官方 iLink AI 平台
user_id  : o9cq802gbUa4ccZXIxmu2hVNkvYc@im.wechat
token    : 58 chars   saved_at: 2026-08-10T13:40:40Z
```
→ **封号风险低**（官方协议）。这是与「wechaty/wcferry/ntchat 逆向个人号」的关键区别。

## 进程与启动方式

- `reasonix-bot.exe`（**原名 `reasonix.exe` 的改名副本**，来自
  `AppData\Roaming\npm\node_modules\@reasonix\cli-win32-x64\bin\reasonix.exe`）
- 启动命令：`reasonix-bot.exe bot start --channels weixin --dir "<AppData>\Roaming\reasonix\global-workspace"`
- **独立 home**：`$env:REASONIX_HOME = C:\Users\27063\AppData\Roaming\reasonix-bot`
- **为什么要改名**（2026-09-20 注释原话）：原名与桌面版 launcher `Reasonix.exe` 撞名，会让 launcher
  在确认 Session 0 候选进程归属时 access denied 而拒绝启动（表现为点图标毫无反应）
- 进程属于 **Session 0**：`Get-CimInstance Win32_Process` 读不到它的 `CommandLine`（实测为空）

## leader 语义：bot 自己内置，不是外部脚本

`bot_leader.log` **整分钟**写入（12:45:01 / 12:46:01 / …），但：
- `check_bot_leader.ps1`（`AppData\Roaming\reasonix\`，2026-09-20）**不被任何计划任务调用**
  （遍历所有 `Get-ScheduledTask` 的 Action 匹配 `bot|leader` = 空）
- `Goat-Gateway-Watchdog`（唯一整分钟触发、last 恰为 12:50:01）的 `watchdog.ps1`（70 行）里**没有** bot 逻辑
→ **结论：`reasonix-bot.exe` 内置 leader election**，每分钟 ping `192.168.1.13` / `100.79.96.82`
（局域网或 Tailscale 任一通即 alive），Linux 活则自己退出、失联则继续服务。
`check_bot_leader.ps1` 是**已被取代的早期外部实现**，迁移时不必管它。

日志形态：`2026-09-28 12:48:01 linux-down -> local gateway already running`

## 凭据位置（两处内容完全相同）

| 路径 | 用途 |
|---|---|
| `AppData\Roaming\reasonix\weixin\accounts\{default.json, cf29d3b9eb6f@im.bot.json, default.context-tokens.json}` | 桌面版 |
| `AppData\Roaming\reasonix-bot\weixin\accounts\` 同名三个文件 | bot home |

`default.json` 键：`{token, base_url, user_id, saved_at}`；`default.context-tokens.json` 另存上下文 token。

## bot 的独立配置与记忆

- `AppData\Roaming\reasonix-bot\config.toml`（19KB）含 `[bot]` 段：
  - `[bot]` + `ignore_self_messages = true` + `[bot.self_user_ids] weixin = []`
  - `[bot.control] token_env = "REASONIX_BOT_CONTROL_TOKEN"`
  - `[bot.pairing]`、`[bot.allowlist]`（`weixin_users = ["o9cq802gbUa4ccZXIxmu2hVNkvYc@im.wechat"]`）、
    `weixin_approvers` / `weixin_admins` / `weixin_groups`
  - 另支持 **QQ**（`[bot.qq]` app_secret_env）与 **Feishu/Lark**（`[bot.feishu]`）
- `AppData\Roaming\reasonix-bot\.env`：`DEEPSEEK_API_KEY` / `COMMANDCODE_API_KEY` / `REASONIX_BOT_CONTROL_TOKEN`
- **bot 有独立记忆**：`AppData\Roaming\reasonix-bot\memory\global\`（含 `weixin-bot-send-file-methods.md`）

## 迁移到 dsh 的两个待确认点

1. **哪个 dsh 插件能复用这套 iLink 凭据**（免重新扫码）—— 社区候选：`dsh-wechat`（★10，
  `pan17/dsh-wechat` 0.9.6，描述明确写「腾讯 iLink bot 协议」）、`@lanbaolu/dsh-wechat-bridge`（★4，0.9.0，
  也写 iLink，纯 Node 守护进程三端通用）、`dsh-chatnode-wechat`（★5，走 `github:`）、
  以及高星但带红线的 `@xmanrui/dsh-im`（★1513，9 渠道，caps 含 credentials+network 且**带红线**）。
2. **迁移期必须避免双 gateway 双响应**：reasonix 侧和 dsh 侧不能同时在线。安全顺序 = 先停/禁 reasonix 侧，
   再起 dsh 侧；回滚则反向。
