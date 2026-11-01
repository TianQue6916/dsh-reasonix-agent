' Run a bash -lc command with no console window (for scheduled tasks).
' Usage: wscript.exe run-hidden.vbs "TRIGGER=scheduler /d/daily-kit/daily.sh close >> /d/daily-kit/daily.log 2>&1"
Dim sh, cmd
If WScript.Arguments.Count = 0 Then WScript.Quit 2
cmd = WScript.Arguments(0)
Set sh = CreateObject("WScript.Shell")
sh.Run "C:\Git\usr\bin\bash.exe -lc " & Chr(34) & cmd & Chr(34), 0, False
