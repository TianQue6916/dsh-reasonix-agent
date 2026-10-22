---
id: mem-d77fddafcaa8857c56c78b323d1fbf10
revision: 1
created_at: "2026-10-06T15:17:03.565Z"
updated_at: "2026-10-06T15:17:03.565Z"
name: dsh-web-3080-logon-task-REDACTED
description: "开机命令行窗口元凶 = Task Scheduler 任务 dsh-web-3080（LogonTrigger PT20S）；已禁用；含 schtasks 坏掉的绕行手法与 caller-trace 探针"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 元凶：Task Scheduler 任务 `\dsh-web-3080`

开机弹出命令行窗口（三行：`启动 ollama serve (port 11434)` / `启动 dsh web  port=3080  workspace=C:\Users\27063  mode=Serve` / `已在 3080 运行。`）的来源，**2026-10-06 23:14 定位并禁用**。

- 任务 XML 在 `C:\Windows\System32\Tasks\dsh-web-3080`（UTF-16）。**目录 `ls` 报 Permission denied，但按文件名 `cat` 能直接读** —— 这是绕开本机坏掉的 `schtasks` 的关键手法。
- 触发器：`<LogonTrigger><Enabled>true</Enabled><UserId>27063</UserId><Delay>PT20S</Delay></LogonTrigger>`
- 动作：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\27063\.dsh\launch-dsh.ps1" -Mode Serve`
- Principal：`InteractiveToken` + `RunLevel>LeastPrivilege`

**本机 `schtasks` 与 `Get-ScheduledTask` 在非提权下一律报错**：
- `schtasks /query ...` → `ERROR: The system cannot find the path specified.`（连从 `C:\Windows\System32` 里跑也一样）
- Git Bash 里还会被 MSYS 路径转换搞成 `ERROR: Invalid argument/option - 'C:/Git/query'.`（需 `MSYS_NO_PATHCONV=1`）
- `Get-ScheduledTask` → `ObjectNotFound ... HRESULT 0x80070003`
- ⇒ **查计划任务必须提权 + 直接读 XML 文件**，别依赖 schtasks。

## 禁用脚本（幂等、可逆）

`~/.dsh/storages/tools/disable-dsh-web-autostart.ps1`（2588 B）
- 用法：`Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\Users\27063\.dsh\storages\tools\disable-dsh-web-autostart.ps1'`
- 只 `Disable` 不 `Delete`；重新启用：`Enable-ScheduledTask -TaskName 'dsh-web-3080'`（或提权 `schtasks /change /tn dsh-web-3080 /enable`）
- 日志：`~/.dsh/logs/disable-dsh-web-autostart.log`
- 实测结果：`before: state=Ready triggers=1` → `disable via CIM: OK` → `after: state=Disabled`

## caller-trace 探针（已装进 launch-dsh.ps1）

在 `$null = New-Item -ItemType Directory -Force -Path $LogDir` 之后插入 `try{...}catch{}`：从 `$PID` 向上追 8 层父链（`ProcessId | Name | CommandLine`）+ 列两个 Startup 文件夹，追加写 `~/.dsh/logs/launch-dsh-caller.log`。5633 → 7396 B，备份 `launch-dsh.ps1.bak-20261006-pre-callertrace`。以后再出现「谁启动了 launch-dsh」的问题，看这个日志。

## 背景约束（为什么该关）

- 桌面版 dsh **不依赖** 3080（grep `~/.dsh/profiles/desktop/` 对 `3080` 零命中）。
- 但 desktop 与 web **共用** `DSH_HOME=~/.dsh` 与同一份 session 文件（`~/.dsh/sessions/<cwd>/session-<uuid>/session.v4.jsonl.zstd`），**无跨进程锁** ⇒ 同时开同一 workspace 会互相追加、互相踩。`launch-dsh.ps1` 的幂等只防 web↔web。
