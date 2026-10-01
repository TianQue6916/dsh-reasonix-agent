---
id: mem-fbe026fa9f1b2771322babe1fc12d254
revision: 1
created_at: "2026-09-28T08:57:57.302Z"
updated_at: "2026-09-28T08:57:57.302Z"
name: rule-long-running-process-needs-job
description: "长命进程必须用 job 工具而非前台 bash；以及一条会挂住的命令为什么不报错、我犯过的报告失真错误"
metadata:
  type: user
  fact_type: feedback
  scope: global
---

**规则（2026-09-28 因一次 51 分钟挂起事故确立）**

## 事故
我在一条**前台 bash 命令**里用 `powershell -Command "Start-Process ... dsh ..."` 启动了一个长期运行的 dsh web 实例。该子进程**继承了 bash → powershell 的 stdout/stderr 管道**，只要它还活着，bash 就认为命令没结束 → `tool/call` 在 15:58:20 发出，`tool/result` 直到 16:49:33（用户按停止）才回来，**挂 51 分钟**。

## 规则
1. **长命进程一律用 `job_*` 工具**（`job_list` / `job_output` / `job_kill`），**不要**用前台 bash + `&` / `Start-Process`。`&` 也不保险：即使进程存活，bash 仍可能因管道未关闭而不返回。
2. 如果确实必须在 bash 里起后台进程，**彻底分离三件套**：`> file 2>&1 < /dev/null &`，并用 `disown`；`Start-Process` 还必须配 `-RedirectStandardOutput/-RedirectStandardError` **且父进程不等待**（MSYS 层仍可能等）。
3. **一条会挂住的命令的危险在于它不报错**：`tool/result` 永远不来，模型侧表现为"一直在等"，用户侧表现为"卡住不动"。
4. **写报告时必须区分"我真实跑通的命令"和"我尝试但挂住的命令"**。这次我犯的错：第一次 `Start-Process` 尝试挂死后，我在新 turn 里用别的方式重做并成功，却在报告里把第一次描述成"子进程随父 PowerShell 退出被杀" —— 与事实不符（它是被用户按停止打断的）。更正已记入 `dsh-goal-stop-mechanism`。
5. 判断"是否卡死"的正确入口：在 session 文件里找 `tool/call` 与其 `tool/result` 的时间差，以及 `turn/end` 的 `reason.kind`。
