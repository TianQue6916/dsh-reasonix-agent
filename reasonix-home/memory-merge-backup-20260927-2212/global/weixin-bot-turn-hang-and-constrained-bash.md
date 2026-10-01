---
id: mem-c564eabfbb0891431130c5b3295e7d08
revision: 1
created_at: "2026-09-20T06:45:50.5082698Z"
updated_at: "2026-09-20T06:45:50.5082698Z"
name: weixin-bot-turn-hang-and-constrained-bash
title: 微信 bot turn 卡死 + bash 被锁 ConstrainedLanguage（2026-09-20 排查处置）
description: 微信 bot 「回复不完整」排查：turn 卡死（无网络/无子进程/无事件三重证据）+ bot 的 bash 在 workspace-write 沙箱下被锁 ConstrainedLanguage；已改 tool_approval_mode=danger-full-access 并重启
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 微信 bot 回复中断 / turn 卡死 + bash 不可用（2026-09-20 排查与处置）

## 现象
微信 bot 消息“没有回复完整”：部分消息无回复，后续消息也没反应。

## 排查结论（三重交叉验证）
1. **回复未发出**：`bot-win-err.log` 中 14:23:32 的 `bot turn started` → 14:23:53 `bot turn completed`，**中间没有 `bot send completed`**（对比 14:22 那两条都有）。
2. **turn 卡死**：14:24:21 的长消息（1992 字符）`turn started` 后**再无 completed**。
3. **卡死硬证据**：
   - 无网络：bot 进程只有 1 条 TCP 连接（微信长轮询，启动时建立），**无到 api.commandcode.ai 的连接**
   - 无子进程：turn 期间未新增子进程
   - 无事件：`sessions-v4/<session>/events.frames` 停在 `seq 320`，`stats/2026-09-20.jsonl` 停在 14:29:45，之后 10 分钟零写入
   → 结论：**卡在本地逻辑（死锁/挂起），不是在等外部响应**
4. **附带发现：bot 的 bash 完全不可用**。subagent 实测：
   `shell startup/child-process check failed` + `Cannot set property. Property setting is supported only on core types in this language mode.`
   → bot 的 PowerShell 跑在 **ConstrainedLanguage**（`tool_approval_mode = "workspace-write"` 触发 Reasonix 的 Windows 写权限沙箱，`windows-sandbox-capabilities-v1/` 里 4 条 `"purpose":"workspace-write"` 记录）。桌面版是 `danger-full-access` 所以正常。

## 可疑点（未定论）
静止点正好是一次 **completion=14043 tokens 的超长流式输出**（reasoning 5996）。参照记忆 `dsh 流式中断与重试（TRANSPORT / Stream ended without finish_reason）`：若 GOAT 上游在超长流上中断而 bot gateway 没有 dsh 那样的重试/复位逻辑，就可能挂在“等流结束”。需观察是否复现。

## 处置（用户拍板）
1. `%APPDATA%\reasonix-bot\config.toml` 两处改为 `danger-full-access`：`[bot] tool_approval_mode`、`[desktop] default_tool_approval_mode`（备份 `config.toml.bak-20260920-fullaccess`）
2. 提权停掉 `reasonix-bot.exe`，监督脚本下一分钟自动拉起（14:44:09 重启，启动行 model = commandcode-goat/deepseek/deepseek-v4.1-flash）

## 可复用的排查手法（Windows Reasonix bot）
- **看时间戳静止点**：`%APPDATA%\reasonix-bot\stats\YYYY-MM-DD.jsonl` 的最后一条 ts + session `events.frames` 的 mtime，两者一致即可判定 turn 静止
- **区分“等网络”vs“卡本地”**：`Get-NetTCPConnection -OwningProcess <botPid>` + 子进程列表 + `Get-CimInstance Win32_Process | Where ParentProcessId -in botPids`
- **看沙箱原因**：`%APPDATA%\reasonix-bot\windows-sandbox-capabilities-v1\*.json`（`purpose` 字段）
- **读被占用的 session 文件**：用 `[System.IO.File]::Open($f,'Open','Read','ReadWrite')` 共享读，否则报被其他进程占用
- **注意 queue_mode = "steer"**：卡死的 turn 会把后续消息 steer 进去 → 表现为“持续无反应”，必须重启 gateway 才能恢复
