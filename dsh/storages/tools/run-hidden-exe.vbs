' run-hidden-exe.vbs -- 隐藏窗口运行一条完整命令行，并等待其退出。
' 用法：wscript.exe run-hidden-exe.vbs "<完整命令行>"
'
' === 为什么用 WMI Win32_Process.Create 而不是 WScript.Shell.Run ===
' 2026-11-11 实测 A/B 对照（同一个命令行，同一个 python 子进程）：
'   A 直接用 CreateProcess 传 lpCommandLine：
'       -Command "Set-Location 'C:\Users\27063'; & 'x.exe' 1> 'a.log'"
'     -> 子进程 argv: -Command 后面是【一个】元素，引号对完整保留。
'   B 经 WScript.Shell.Run 传同样的字符串：
'     -> 子进程 argv: 被按空格拆成 6 个元素 "Set-Location" / "'C:\Users\27063';" / "&" / ...
'     WshShell.Run 自己会解析并重新拼装命令行，嵌套引号在这一步被吃掉。
'   含 -Command "a; b" 形态的任务（ocr_p002）会直接坏掉，而且是静默坏掉。
' Win32_Process.Create 是货真价实的 CreateProcess，lpCommandLine 原样透传，即 A 的行为。
'
' === 为什么用 ShowWindow=0 而不是 CreateFlags=CREATE_NO_WINDOW ===
' CREATE_NO_WINDOW (0x08000000) 让 console 程序完全不分配 console，但那样子进程的
' stdout/stderr 句柄无效，CPython 会把 sys.stdout 置成 None —— 脚本里一句 print()
' 就 AttributeError 崩（ocr_part003.py:5 的 sys.stdout.reconfigure 更是直接炸）。
' ShowWindow=0 走 STARTF_USESHOWWINDOW + SW_HIDE：console 照常分配，只是窗口从创建起
' 就不显示，子进程的 stdout 仍然有效。这才是语义无损的做法。
'
' === 代价 ===
' WMI 拿不到子进程退出码（Create 只返回 ReturnValue 和 ProcessId），所以本脚本一律以 0
' 退出。Task Scheduler 的 LastTaskResult 对这批任务不再是脚本的真实退出码。
Option Explicit

Dim cmd, svc, startup, procObj, rc, pid, q, n, wd

If WScript.Arguments.Count <> 1 Then WScript.Quit 2
cmd = WScript.Arguments(0)

' 继承 wscript 的当前目录 —— Task Scheduler 的 WorkingDirectory 是设在宿主上的
wd = CreateObject("WScript.Shell").CurrentDirectory

Set svc = GetObject("winmgmts:{impersonationLevel=impersonate}!\.\root\cimv2")
Set startup = svc.Get("Win32_ProcessStartup").SpawnInstance_
startup.ShowWindow = 0

Set procObj = svc.Get("Win32_Process")
rc = procObj.Create(cmd, wd, startup, pid)
If rc <> 0 Then WScript.Quit rc

' 等子进程退出，让 Task Scheduler 的 MultipleInstances / ExecutionTimeLimit 继续有效
n = 0
Do
  WScript.Sleep 200
  Set q = svc.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE ProcessId=" & pid)
  If q.Count = 0 Then Exit Do
  n = n + 1
  If n > 36000 Then Exit Do   ' 2 小时兜底
Loop

WScript.Quit 0
