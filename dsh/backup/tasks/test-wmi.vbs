On Error Resume Next
Dim svc, startup, proc, rc, pid
Set svc = GetObject("winmgmts:{impersonationLevel=impersonate}!\.\root\cimv2")
If Err.Number <> 0 Then WScript.Echo "ERR GetObject " & Err.Number & " " & Err.Description : WScript.Quit 1
Set startup = svc.Get("Win32_ProcessStartup").SpawnInstance_
startup.ShowWindow = 0
Set proc = svc.Get("Win32_Process")
rc = proc.Create("cmd.exe /c exit 7", Null, startup, pid)
WScript.Echo "rc=" & rc & " pid=" & pid & " errno=" & Err.Number & " " & Err.Description
