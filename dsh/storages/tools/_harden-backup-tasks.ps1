$ErrorActionPreference = 'Stop'
$Log = 'C:\Users\27063\.dsh\logs\backup-tasks-harden.log'
$Tdir = 'C:\Users\27063\.dsh\backups\tasks'
function W($m){ $l = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m; Add-Content -Path $Log -Value $l -Encoding UTF8 }
New-Item -ItemType Directory -Force -Path (Split-Path $Log) | Out-Null
New-Item -ItemType Directory -Force -Path $Tdir | Out-Null
W ('=== elevated={0} ===' -f ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))

function Snap($name){
  $t = Get-ScheduledTask -TaskName $name
  $s = $t.Settings
  [pscustomobject]@{
    Name=$name; Triggers=$t.Triggers.Count
    StartWhenAvailable=$s.StartWhenAvailable
    NoStartOnBatteries=$s.DisallowStartIfOnBatteries
    StopOnBatteries=$s.StopIfGoingOnBatteries
    TimeLimit=$s.ExecutionTimeLimit
    Exec=$t.Actions[0].Execute
    Args=$t.Actions[0].Arguments
  }
}
function Show($o){ W ('  {0}: triggers={1} startWhenAvailable={2} noStartOnBatt={3} stopOnBatt={4} limit={5}' -f $o.Name,$o.Triggers,$o.StartWhenAvailable,$o.NoStartOnBatteries,$o.StopOnBatteries,$o.TimeLimit); W ('    action: {0} {1}' -f $o.Exec,$o.Args) }

foreach($n in 'ReasonixGitHubBackup','DshConfigAutocommit'){
  $xml = Export-ScheduledTask -TaskName $n
  $f = Join-Path $Tdir ('{0}.pre-20261022.xml' -f $n)
  Set-Content -LiteralPath $f -Value $xml -Encoding UTF8
  W ('XML 备份: ' + $f + '  (' + (Get-Item -LiteralPath $f).Length + ' B)')
}
W '--- BEFORE ---'
foreach($n in 'ReasonixGitHubBackup','DshConfigAutocommit'){ Show (Snap $n) }

# 1) ReasonixGitHubBackup: 允许电池 + 错过就补跑 + 开机后 10 分钟补跑（Action 一字不动）
$t1 = Get-ScheduledTask -TaskName 'ReasonixGitHubBackup'
$t1.Settings.StartWhenAvailable        = $true
$t1.Settings.DisallowStartIfOnBatteries = $false
$t1.Settings.StopIfGoingOnBatteries     = $false
$t1.Settings.ExecutionTimeLimit         = 'PT30M'
if (-not ($t1.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger' })) {
  $boot = New-ScheduledTaskTrigger -AtStartup
  $boot.Delay = 'PT10M'
  $t1.Triggers += $boot
}
Register-ScheduledTask -TaskName 'ReasonixGitHubBackup' -InputObject $t1 -Force | Out-Null

# 2) DshConfigAutocommit: 只放开电池限制（其余不动）
$t2 = Get-ScheduledTask -TaskName 'DshConfigAutocommit'
$t2.Settings.DisallowStartIfOnBatteries = $false
$t2.Settings.StopIfGoingOnBatteries     = $false
Register-ScheduledTask -TaskName 'DshConfigAutocommit' -InputObject $t2 -Force | Out-Null

W '--- AFTER ---'
foreach($n in 'ReasonixGitHubBackup','DshConfigAutocommit'){ Show (Snap $n) }
W ('github-backup next-run: ' + (Get-ScheduledTaskInfo -TaskName 'ReasonixGitHubBackup').NextRunTime)
W ('watchdog next-run:      ' + (Get-ScheduledTaskInfo -TaskName 'ReasonixBackupWatchdog').NextRunTime)
