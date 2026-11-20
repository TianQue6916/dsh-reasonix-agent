---
id: mem-36f45e493db9266d66069d6d476e5305
revision: 1
created_at: "2026-11-19T16:38:53.666Z"
updated_at: "2026-11-19T16:38:53.666Z"
name: dsh-restart-once-schtasks-self-delete-20261120
description: "schtasks 一次性重启任务不自删会在当晚再次 taskkill dsh；已修 restart-dsh.cmd 加自删行并删残留任务"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论（2026-11-20 定案）

`~/.dsh/tools/restart-dsh.cmd` 原本**没有自删行**。用
`schtasks /create /tn dsh-restart-once /tr "C:\Users\27063\.dsh\tools\restart-dsh.cmd" /sc once /st 23:59 /f` + `schtasks /run`
做「agent 重启自己」时：`/run` 只负责立刻跑一次，任务本身跑完**不会自我删除**，`TimeTrigger StartBoundary` 留在系统里，到点再触发一次。

**2026-11-19 23:59:00 就是这么把 dsh 杀掉的**：23:59:00 触发 → 脚本 `timeout /t 8` → 23:59:08 `taskkill /F /IM "DeepSeek Harness.exe"`（5 个进程）→ 23:59:14 新进程起来。创建者不是用户，是 dsh 自己的 agent：`session-ec0ce405` 事件 idx 6280，`time=1795021043480`（2026-11-19 00:57:23），turn 94 step 9 的 bash tool-call，`source.kind = model`。

## 已修（2026-11-20 00:38）

- 残留任务已删：`schtasks /delete /tn dsh-restart-once /f` → `SUCCESS`；复核 `schtasks /query /tn dsh-restart-once` → `ERROR: The system cannot find the file specified.`
- `restart-dsh.cmd` 末尾追加 `schtasks /delete /tn dsh-restart-once /f >nul 2>&1` 与 `exit /b 0`（**必须补 exit 0**：任务已删时 schtasks 返回 1，否则 Task Scheduler 记 `LastTaskResult=1` 看起来像失败）
- 备份：`restart-dsh.cmd.bak-20261120-003710-preselfdel`
- **行尾必须 CRLF**：python `open(p).read()` 默认把 CRLF 吃成 LF，再 `newline=''` 写回就变 LF-only `.cmd`；用 `open(p,'rb')` + 二进制归一，或写时 `newline='\r\n'`。校验 `file restart-dsh.cmd` 应显示 `with CRLF line terminators`
- dry-run 验证件：`C:\Users\27063\.dsh\.learn\run\restart-dsh.dryrun.cmd`（taskkill/start 换成 echo、日志重定向到 `dryrun.log`），实际跑 exit 0

## 今后规则

- `/st` **不要拿未来钟点当占位**；要么「现在 + 2 分钟」，要么 `/run` 之后立刻 `schtasks /delete`
- 排查「dsh 怎么突然关了」三件套：① `(Get-CimInstance Win32_Process -Filter "Name='DeepSeek Harness.exe'").CreationDate` ② `schtasks /query /fo csv /nh | findstr dsh` 看 `LastRunTime` ③ `logs/restart-dsh.log` 里的 `taskkill` 输出
- 本机 `Microsoft-Windows-TaskScheduler/Operational` 日志**没有**该时段记录，不能靠它反查触发；改从任务 XML 的 `<Date>` 与 session log 里的 tool-call 定位
