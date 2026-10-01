' run-hidden.vbs - run a PowerShell script with NO visible window (for Task Scheduler)
' Usage: wscript.exe "<this file>" "<absolute script path>" [extra args...]
' Equivalent to:
'   powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "<script>" [args]
' but the host is wscript (GUI subsystem) and the child is started with a hidden
' window, so no terminal window ever appears on the desktop. Waits for the child
' and forwards its exit code to Task Scheduler.
Option Explicit
Dim sh, fso, ps1, cmd, i, rc
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
If WScript.Arguments.Count = 0 Then WScript.Quit 2
ps1 = WScript.Arguments(0)
If Not fso.FileExists(ps1) Then WScript.Quit 3
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
For i = 1 To WScript.Arguments.Count - 1
  cmd = cmd & " " & WScript.Arguments(i)
Next
rc = sh.Run(cmd, 0, True)
WScript.Quit rc
