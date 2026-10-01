#Requires -Version 5.1
<#
  stop-reasonix-bot-elevated.ps1 — 停掉 reasonix 侧的微信 bot（需要管理员权限）。

  【为什么必须提权】
    reasonix-bot.exe 是 Session 0 的进程。普通用户会话里 Stop-Process / taskkill /F
    一律返回 "Access is denied"（2026-09-30 实测），必须有管理员令牌。

  【它做什么】
    1. 列出当前 reasonix-bot.exe
    2. 逐个 Stop-Process -Force
    3. 等 3 秒复查；若仍有残留则报错退出（不谎报成功）
    4. 顺便看一眼 dsh 侧 daemon 是否接管
  不做任何其它系统改动；不改注册表、不改服务、不改计划任务。
#>
$ErrorActionPreference = 'Continue'
$log = Join-Path $env:USERPROFILE '.dsh\logs\stop-reasonix-bot.log'
function W([string]$m) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  Write-Host $line
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}
$null = New-Item -ItemType Directory -Force -Path (Split-Path $log)

W '=== 提权停 reasonix-bot ==='
W ('elevated = ' + ([Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)))

$before = @(Get-CimInstance Win32_Process -Filter "Name='reasonix-bot.exe'" -ErrorAction SilentlyContinue)
W ('found ' + $before.Count + ' process(es)')
foreach ($p in $before) {
  W ("  stopping PID {0} (started {1})" -f $p.ProcessId, $p.CreationDate)
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 3

$after = @(Get-CimInstance Win32_Process -Filter "Name='reasonix-bot.exe'" -ErrorAction SilentlyContinue)
if ($after.Count -gt 0) {
  W ('FAIL: ' + $after.Count + ' 个进程仍在（PID ' + (($after | ForEach-Object { $_.ProcessId }) -join ',') + '）')
  W '如果你看到这条，把本窗口的内容发我。'
  exit 1
}
W 'OK: reasonix-bot.exe 已全部停止'

# dsh 侧 daemon 是否接管
$pidFile = Join-Path $env:USERPROFILE '.dsh\wechat-bridge\daemon.pid'
if (Test-Path -LiteralPath $pidFile) {
  $dpid = 0
  try { $dpid = [int]((Get-Content -LiteralPath $pidFile -Raw).Trim()) } catch {}
  $dp = if ($dpid -gt 0) { Get-CimInstance Win32_Process -Filter "ProcessId=$dpid" -ErrorAction SilentlyContinue } else { $null }
  if ($dp) { W ("OK: dsh 侧 daemon 在跑 PID {0} ({1})" -f $dp.ProcessId, $dp.Name) }
  else { W 'WARN: dsh 侧 daemon 未运行 —— 微信会暂时无人应答，请在 dsh 面板里点启动' }
} else {
  W 'WARN: 找不到 daemon.pid —— dsh 侧 daemon 尚未启动过'
}
W '=== 结束 ==='
Start-Sleep -Seconds 3
