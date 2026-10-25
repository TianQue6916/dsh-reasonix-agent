$out    = "C:\Users\27063\.dsh\logs\wake-guard-setup.log"
$ps     = "C:\Program Files\PowerShell\7\pwsh.exe"
$script = "C:\Users\27063\.dsh\storages\tools\wake-guard.ps1"

"===== $(Get-Date -Format "yyyy-MM-dd HH:mm:ss") REBUILD =====" | Out-File $out -Encoding utf8

try {
    $before = @(Get-ScheduledTask -TaskName "WakeGuard" -ErrorAction SilentlyContinue).Count
    ("before: task count = " + $before) | Out-File $out -Append -Encoding utf8

    Unregister-ScheduledTask -TaskName "WakeGuard" -Confirm:$false -ErrorAction SilentlyContinue
    "unregistered (if existed)" | Out-File $out -Append -Encoding utf8

    $argStr = ("-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " + [char]34 + $script + [char]34)
    ("argStr = " + $argStr) | Out-File $out -Append -Encoding utf8

    $action    = New-ScheduledTaskAction -Execute $ps -Argument $argStr
    $trigger   = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew -StartWhenAvailable

    $task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings
    $task.Triggers[0].Delay = "PT20S"

    Register-ScheduledTask -TaskName "WakeGuard" -InputObject $task -Force -ErrorAction Stop | Out-Null
    "REGISTERED OK" | Out-File $out -Append -Encoding utf8

    $v = Get-ScheduledTask -TaskName "WakeGuard" -ErrorAction Stop
    ("verify: state=" + $v.State + " delay=" + $v.Triggers[0].Delay + " user=" + $v.Principal.UserId) | Out-File $out -Append -Encoding utf8
    ("tasks file exists = " + (Test-Path "C:\Windows\System32\Tasks\WakeGuard")) | Out-File $out -Append -Encoding utf8
} catch {
    ("ERROR: " + $_.Exception.Message) | Out-File $out -Append -Encoding utf8
    ("STACK: " + $_.ScriptStackTrace) | Out-File $out -Append -Encoding utf8
}

try {
    "-- manual trigger --" | Out-File $out -Append -Encoding utf8
    Start-ScheduledTask -TaskName "WakeGuard" -ErrorAction Stop
    Start-Sleep -Seconds 20
    $i = Get-ScheduledTaskInfo -TaskName "WakeGuard"
    ("LastRunTime=" + $i.LastRunTime + " LastResult=" + $i.LastTaskResult) | Out-File $out -Append -Encoding utf8
} catch {
    ("TRIGGER ERROR: " + $_.Exception.Message) | Out-File $out -Append -Encoding utf8
}

"-- wake-guard.log tail --" | Out-File $out -Append -Encoding utf8
Get-Content "C:\Users\27063\.dsh\logs\wake-guard.log" -Encoding utf8 -Tail 3 | Out-File $out -Append -Encoding utf8
