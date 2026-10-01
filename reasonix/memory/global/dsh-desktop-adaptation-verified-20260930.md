---
id: mem-d829ec66ec306f44d6e481c42b34dc73
revision: 1
created_at: "2026-09-30T09:07:10.558Z"
updated_at: "2026-09-30T09:07:10.558Z"
name: dsh-desktop-adaptation-verified-20260930
description: "桌面端全量适配验收通过：网关连通、preset 生效、agent 跑在桌面端；含\"同时只开一个 Host\"约束与两处误判复盘"
metadata:
  type: user
  fact_type: project
  scope: global
---

# 桌面端全量适配：验收通过（2026-09-30 17:06 实测）

接 `dsh-desktop-profile-full-port-20260930`，这是**移植后的端到端验收结果**。

## 用户明确确认
「现在这句话是从桌面端发的」—— 该消息落进了 `session-a0d5fbf8`
（原 `profiles/web` 的会话），因为 **`~/.dsh/sessions` 是全局共享的**，
桌面端的会话列表能直接列出并 resume web 的会话。

## 验收证据链（全部实测）
| 项 | 证据 |
|---|---|
| 桌面端带插件启动 | `wechat-bridge/plugin.log` → `05:35:24Z`（本地 13:35:24）注册 17 条面板路由，桌面端 13:35:22 启动 |
| profile 移植被接受 | 重启前后 md5 逐一不变（`439cbd0f…`/`ea32d122…`/`3032af33…`） |
| **桌面端连上网关** | PID 36536 → `127.0.0.1:8788` **ESTABLISHED** |
| **桌面端在跑模型** | 网关日志 `status=200` / `model=deepseek/deepseek-v4.1-flash` / `clientUa="deepseek-harness/0.2.0-rc.2"` |
| **preset 生效** | 会话 header `agentPreset: anchored-standard`；会话内 `skill_search|skill_load` 命中 **280** 次 |
| **agent 确实跑在桌面端** | 该 session 文件 17:06:46 被写，末条记录就是当轮 `tool/call` |

⇒ **不需要额外配置**：`COMMANDCODE_API_KEY` 三级都未设也不影响（网关不校验入站 key）。

## ⚠️ 一个必须记住的约束：**同时只开一个 Host**
2026-09-30 17:06 实测：**3080 的 web dsh 已经停了**（只有 TIME_WAIT，无 LISTENING），
所以当时是桌面端独占。
`launch-dsh.ps1` 的头部注释早就写明风险：「会话按文件存……**没有跨进程锁**。
第二个实例打开同一个会话时，两个进程会同时追加同一文件 → 互相踩（表现为「无法同时对话」）」。
⇒ 桌面端与 `launch-dsh.ps1` 起的 3080 **不要同时开着去碰同一个会话**。
想回到浏览器版就停桌面端再跑 `~/.dsh/launch-dsh.ps1 -Mode Open`。

## 复盘：我一开始误判的两处
1. 把 `git-context` 注入的 **13:40**（最后一次 commit 时间）当成当前时间，
   于是一度以为"桌面端还没发过消息"。**当前时间要用 `date` 读，不要读 git 注入行。**
2. 看到 `~/.dsh/sessions/--C-Users-27063--/6ff72911-…/` 这个新目录就以为是桌面端的会话，
   实际它的 header 是 `"origin":"subagent","delegationDepth":1,"parentSession":"session-a0d5fbf8-…"`
   ⇒ 是我自己早先委派的 subagent。**判 session 归属必须读 header，不能只看目录新不新。**
