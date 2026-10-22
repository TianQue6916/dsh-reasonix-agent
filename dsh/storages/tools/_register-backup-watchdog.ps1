$ErrorActionPreference = 'Stop'
$name = 'ReasonixBackupWatchdog'
$arg  = '"C:\Users\27063\reasonix-ops\run-hidden.vbs" "C:\Users\27063\reasonix-ops\backup-watchdog.ps1"'
$A = New-ScheduledTaskAction -Execute 'C:\Windows\System32\wscript.exe' -Argument $arg
$T1 = New-ScheduledTaskTrigger -Daily -At '23:45'
$T2 = New-ScheduledTaskTrigger -AtStartup
$T2.Delay = 'PT5M'
$S = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
      -MultipleInstances IgnoreNew
$d = 'Watchdog for ReasonixGitHubBackup: alerts when the backup chain dies silently (missing call path / stale repo HEAD / unpushed commits).'
Register-ScheduledTask -TaskName $name -Action $A -Trigger @($T1,$T2) -Settings $S -Description $d -Force | Out-Null
$t = Get-ScheduledTask -TaskName $name
'registered: ' + $t.TaskName + ' | state=' + $t.State + ' | triggers=' + $t.Triggers.Count
