' run-quiet.vbs -- 无窗口启动任意程序（供 Task Scheduler 用，替代 console exe 直连）
' 用法：wscript.exe run-quiet.vbs "<exe>" ["<arguments 原样透传>"]
' windowStyle=0 (SW_HIDE) 从 CreateProcess 起就隐藏，进程本身不会闪窗。
Option Explicit
Dim sh, exe, args, cmd
If WScript.Arguments.Count = 0 Then WScript.Quit 2
exe = WScript.Arguments(0)
args = ""
If WScript.Arguments.Count > 1 Then args = WScript.Arguments(1)
cmd = Chr(34) & exe & Chr(34)
If Len(args) > 0 Then cmd = cmd & " " & args
Set sh = CreateObject("WScript.Shell")
sh.Run cmd, 0, False
