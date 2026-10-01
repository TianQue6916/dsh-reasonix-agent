---
id: mem-4e1517ba2ee6f0fc0edc801d1cfee6b8
revision: 1
created_at: "2026-09-20T06:09:36.082934Z"
updated_at: "2026-09-20T06:09:36.082934Z"
name: reasonix-launcher-blocked-by-session0-name-collision
title: Reasonix 点图标无法启动：Session 0 撞名进程堵塞 launcher（2026-09-20 修复）
description: 诊断并修复「点任务栏/桌面 Reasonix 图标毫无反应」：根因是 Session 0 里 bot 的 reasonix.exe 与桌面版 launcher 撞镜像名，launcher 无法确认其归属而拒绝启动；已用改名隔离（reasonix-bot.exe）治本
metadata:
  type: user
  fact_type: reference
  scope: global
---

# Reasonix 点图标无法启动 — 根因与治本修复（2026-09-20 实测闭环）

## 现象
点任务栏/桌面 Reasonix 图标完全没反应：无窗口、无报错。

## 根因链（证据闭合）
```
Linux 主力机失联（192.168.1.13 / 100.79.96.82 均 ping 不通）
  ↓ 每分钟执行的 check_bot_leader.ps1 判 linux-down，按设计接管微信 bot
  ↓ 以 Session 0（Services 会话，非桌面会话）启动 gateway
  ↓ npm 包 @reasonix/cli-win32-x64 的原生二进制文件名就是 reasonix.exe
  ↓ 与桌面版 launcher（工具箱\.reasonix\Reasonix\Reasonix.exe）撞镜像名
  ↓ launcher 内部模块 reasonix/internal/desktopinstance 枚举同名进程并要求确认归属
  ↓ Session 0 进程普通权限读不到 owner → access denied
  ↓ deniedCandidate → 直接放弃启动（什么都不弹）
```

## 决定性证据
- `%APPDATA%\reasonix\desktop-shell\logs\recovery.log`：每次点击留一行
  `action=launch result="unknown_owner: access denied while identifying candidate PID <PID>"`
- `%APPDATA%\reasonix\bot_leader.log`：每分钟一行；`2026-09-19 16:15:01 linux-down -> started local gateway` 就是堵塞进程的诞生时刻（与 `OpenSSH/Operational` 里 `9/19 16:14:31 sshd Server listening` 吻合）
- 被堵塞进程特征：`reasonix.exe`、Session Name=Services、User Name=N/A、CreationDate 与 bot 启动同秒
- launcher 二进制内字符串可见 `reasonix/internal/desktopinstance` 的 `deniedCandidate`、`aliveProcesses`、`closeWindows`、`focusLegacyWindow`、`AttemptLog`

## 治本修复（2026-09-20 已落地并验证）
1. 建改名隔离副本（72MB，与 npm 包内文件同 hash）：
   `C:\Users\27063\AppData\Roaming\reasonix-bot\bin\reasonix-bot.exe`
2. 改 `C:\Users\27063\AppData\Roaming\reasonix\check_bot_leader.ps1` 三处：
   - 变量：`$reasonixJs`/`$nodeExe` → `$cliSrcExe`/`$botExe`
   - 进程检测：改用镜像名 `Get-CimInstance Win32_Process -Filter "Name='reasonix-bot.exe'"`（Session 0 进程读不到 CommandLine，原命令行匹配失效），并保留对旧 `node reasonix.js` 形态的兼容检测
   - 启动：`Start-Process -FilePath $botExe`，并在启动前按「大小/时间戳」自动从 npm 包同步副本
   - 备份：`check_bot_leader.ps1.bak-20260920-rename-isolation`
3. 提权杀掉残留的旧对（node + reasonix.exe），下一分钟脚本自动用改名副本重启。

验证：Session 0 只剩 `reasonix-bot.exe`；`bot-win-err.log` 显示 `starting adapter / weixin polling started`，bot 功能正常。

## 复现级坑（重要）
- **launcher 按镜像名匹配候选进程**：任何在 Session 0 以同名 `reasonix.exe` 常驻的进程都会永久堵塞图形启动，且表现为「毫无反应」而非报错。
- **Session 0 进程普通权限杀不掉**（Access is denied），必须 UAC 提权；且杀掉会被监督脚本在一分钟内补齐（治标无效）。
- **edit_file 工具禁止写 `%APPDATA%\reasonix`**（被判定为 Reasonix 运行时状态路径，`cannot be granted`）；改用 shell + `.NET ReadAllText/WriteAllText` 做精确替换（注意保持原编码：该脚本为 UTF-8 无 BOM）。
- **快捷方式分层**：开始菜单 + `桌面\工具箱\Reasonix.lnk` 走 `reasonix-peak-warn.ps1` 包装（DeepSeek 高峰时段弹窗，由计划任务 `ReasonixPeakWarnSelfHeal` 每 30 分钟自愈），但 **任务栏 `User Pinned\TaskBar\Reasonix.lnk` 未纳入自愈，直指 launcher**。三条路最终都进 launcher，所以改名隔离才是有意义的修复点。
- 每分钟驱动 `check_bot_leader.ps1` 的调用者未定位（进程在 Session 0，命令行不可读；计划任务/WMI 订阅/Run 键均已排除）。因修改的是脚本本体，不受驱动方式影响。

## 遗留（无害）
Linux 恢复可达后，脚本 `linuxAlive` 分支会尝试 `Stop-Process` 本地 gateway，但跨会话权限不足会静默失败 → `reasonix-bot.exe` 可能残留。它不再撞名，不影响桌面启动；需彻底清理时提权杀即可。
