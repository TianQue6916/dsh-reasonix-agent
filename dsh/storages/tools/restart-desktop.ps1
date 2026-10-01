#Requires -Version 5.1
<#
  restart-desktop.ps1 — 重启官方桌面端（让 profile 改动生效）。

  【为什么需要】以下三项都只在**进程重启**时读取，不参与 HMR：
    1. ~/.dsh/plugins/deja/package.json 补的 version（PackageIdentityResolver 有进程级缓存）
    2. 新加的 commandcode-goat-anthropic provider
    3. dsh-wechat-bridge 的 autoStart=true（挂载时读）
  【为什么脱离进程树】从 dsh 内部 Start-Process 重启会被级联终止，
    所以由 Task Scheduler 拉起本脚本。
#>
$ErrorActionPreference = 'Continue'
$log = Join-Path $env:USERPROFILE '.dsh\logs\restart-desktop.log'
function W([string]$m) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  Write-Host $line; Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}
$null = New-Item -ItemType Directory -Force -Path (Split-Path $log)
$exe = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe'

W '=== 重启桌面端 ==='
$procs = @(Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue)
W ('stopping ' + $procs.Count + ' process(es)')
foreach ($p in $procs) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 5
$left = @(Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue).Count
if ($left -gt 0) { W ('WARN: 仍有 ' + $left + ' 个残留，二次强杀'); Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 3 }

W ('launching ' + $exe)
Start-Process -FilePath $exe
Start-Sleep -Seconds 25
$now = @(Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue)
W ('now running: ' + $now.Count + ' process(es)')

# 等 daemon 起来（autoStart=true 时应自动启动）
for ($i = 0; $i -lt 12; $i++) {
  $pidFile = Join-Path $env:USERPROFILE '.dsh\wechat-bridge\daemon.pid'
  if (Test-Path -LiteralPath $pidFile) {
    $dpid = 0
    try { $dpid = [int]((Get-Content -LiteralPath $pidFile -Raw).Trim()) } catch {}
    $dp = if ($dpid -gt 0) { Get-CimInstance Win32_Process -Filter "ProcessId=$dpid" -ErrorAction SilentlyContinue } else { $null }
    if ($dp) { W ('OK: wechat daemon 已自动启动 PID ' + $dp.ProcessId); break }
  }
  Start-Sleep -Seconds 5
  if ($i -eq 11) { W 'WARN: 25s 内未见 daemon，请在 dsh 面板手动点启动' }
}
W '=== 结束 ==='
