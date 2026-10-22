# Register DshHostWatchdog as a detached scheduled task (no trigger: started manually),
# so it survives dsh/App restarts and keeps sampling the desktop host.
$ErrorActionPreference = 'Stop'
$name = 'DshHostWatchdog'
$script = 'C:\Users\27063\.dsh\storages\tools\host-watchdog.ps1'
if (-not (Test-Path $script)) { throw "missing: $script" }

$existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "existing task found (state=$($existing.State)) - unregistering"
  if ($existing.State -eq 'Running') { Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue }
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $name -Action $action -Settings $settings -Principal $principal `
  -Description 'External liveness probe for the dsh desktop host (event-loop stall detection).' | Out-Null
Write-Host "registered: $name"
Get-ScheduledTask -TaskName $name | Select-Object TaskName, State | Format-List
