$ErrorActionPreference = 'Stop'
$Log = 'C:\Users\27063\.dsh\logs\backup-watchdog-register.log'
function W($m){ $l = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m; Add-Content -Path $Log -Value $l -Encoding UTF8 }
New-Item -ItemType Directory -Force -Path (Split-Path $Log) | Out-Null
W ('=== elevated={0} ===' -f ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
$name = 'ReasonixBackupWatchdog'
$arg  = '"C:\Users\27063\reasonix-ops\run-hidden.vbs" "C:\Users\27063\reasonix-ops\backup-watchdog.ps1"'
$A = New-ScheduledTaskAction -Execute 'C:\Windows\System32\wscript.exe' -Argument $arg
$T1 = New-ScheduledTaskTrigger -Daily -At '23:45'
$T2 = New-ScheduledTaskTrigger -AtStartup
$T2.Delay = 'PT5M'
$S = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
$d = 'Watchdog for ReasonixGitHubBackup: alerts (backup-watchdog.log + backup-alert.json) when the backup chain dies silently: missing call path, stale repo HEAD > 30h, unpushed commits.'
Register-ScheduledTask -TaskName $name -Action $A -Trigger @($T1,$T2) -Settings $S -Description $d -Force | Out-Null
$t = Get-ScheduledTask -TaskName $name
W ('registered: ' + $t.TaskName + ' | state=' + $t.State + ' | triggers=' + $t.Triggers.Count + ' | action=' + $t.Actions[0].Execute + ' ' + $t.Actions[0].Arguments)
$i = Get-ScheduledTaskInfo -TaskName $name
W ('next-run: ' + $i.NextRunTime)
