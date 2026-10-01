<#
  install-tasks.ps1 — 注册 / 卸载 goat-gateway 的计划任务

    Goat-Gateway            用户登录时启动网关（无窗口）；也可 schtasks /run 手动拉起
    Goat-Gateway-Watchdog   每 1 分钟体检，连续两次失败就重启上面那个任务

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install-tasks.ps1 -Start
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install-tasks.ps1 -Uninstall
#>
param(
  [switch]$Uninstall,
  [switch]$Start
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$startVbs = Join-Path $root 'start-gateway.vbs'
$runHidden = Join-Path $root 'run-hidden.vbs'
$watchdogPs1 = Join-Path $root 'watchdog.ps1'
$wscript = Join-Path $env:WINDIR 'system32\wscript.exe'
$uid = "$env:USERDOMAIN\$env:USERNAME"

if ($Uninstall) {
  foreach ($n in 'Goat-Gateway', 'Goat-Gateway-Watchdog') {
    & schtasks /end /tn $n 2>$null | Out-Null
    & schtasks /delete /tn $n /f 2>$null | Out-Null
    Write-Host "removed task: $n"
  }
  exit 0
}

foreach ($f in @($startVbs, $runHidden, $watchdogPs1)) {
  if (-not (Test-Path $f)) { throw "缺少文件: $f" }
}

$principal = New-ScheduledTaskPrincipal -UserId $uid -LogonType Interactive -RunLevel Limited

# ── 任务 1：网关本体 ────────────────────────────────────────────────────
$act1 = New-ScheduledTaskAction -Execute $wscript -Argument "`"$startVbs`""
$trig1 = New-ScheduledTaskTrigger -AtLogOn -User $uid
$set1 = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Goat-Gateway' -Action $act1 -Trigger $trig1 `
  -Principal $principal -Settings $set1 -Force `
  -Description 'Command Code GOAT 多 key 网关（轮询 + 故障转移），供 reasonix / dsh 使用' | Out-Null
Write-Host "registered: Goat-Gateway" -ForegroundColor Green

# ── 任务 2：看门狗 ──────────────────────────────────────────────────────
$act2 = New-ScheduledTaskAction -Execute $wscript -Argument "`"$runHidden`" `"$watchdogPs1`""
$trig2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$set2 = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName 'Goat-Gateway-Watchdog' -Action $act2 -Trigger $trig2 `
  -Principal $principal -Settings $set2 -Force `
  -Description 'goat-gateway 看门狗：每分钟体检，挂了自动拉起' | Out-Null
Write-Host "registered: Goat-Gateway-Watchdog" -ForegroundColor Green

if ($Start) {
  & schtasks /run /tn 'Goat-Gateway' | Out-Null
  Write-Host "started: Goat-Gateway" -ForegroundColor Green
}
