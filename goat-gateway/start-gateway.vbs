' start-gateway.vbs — 以「无窗口」方式启动 goat-gateway。
'
' 注意：这里是 Run(..., 0, False) —— 启动后立即返回，不等 node。
' 原因：若用等待模式（True），一旦任务被 schtasks /end 终止，wscript 被杀而 node 会变成
' 孤儿继续占用 8788 端口，导致「重启」实际没重启、新进程又因端口冲突退出。
' 现在任务只负责「点火」；进程存活由 /health + watchdog.ps1 判定和管理。
Option Explicit
Dim sh, fso, here, script, node, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
script = here & "\gateway.mjs"
If Not fso.FileExists(script) Then WScript.Quit 3

node = "C:\Program Files\nodejs\node.exe"
If Not fso.FileExists(node) Then node = "node.exe"

sh.CurrentDirectory = here
cmd = """" & node & """ """ & script & """"
sh.Run cmd, 0, False
WScript.Quit 0
