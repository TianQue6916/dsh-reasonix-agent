<#
  restart-gateway.ps1 — 安全重启 goat-gateway（让 gateway.mjs 的改动生效）

  为什么需要它：keys.json 有 mtime 热重载，但 gateway.mjs 的**代码**改动必须重启进程。
  为什么要延迟触发：dsh 自己的模型调用就走 127.0.0.1:8788，重启会打断正在进行的流，
  所以调用方应当在「没有活跃请求」的窗口里执行本脚本。

  流程：停监听 8788 的进程 → 等端口释放 → 跑 Goat-Gateway 任务 → 校验新进程起来了。
  日志：本目录 logs/restart-gateway.log
#>
$ErrorActionPreference = 'Continue'
$Port   = 8788
$LogDir = Join-Path $PSScriptRoot 'logs'
$Log    = Join-Path $LogDir 'restart-gateway.log'
$null = New-Item -ItemType Directory -Force -Path $LogDir

function W([string]$m) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  Add-Content -Path $Log -Value $line -Encoding UTF8
}

function PidOnPort([int]$p) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if ($c) { return [int]$c[0].OwningProcess }
  return 0
}

$old = PidOnPort $Port
W ("restart requested; current owner of ${Port} = {0}" -f ($(if ($old) { $old } else { '(none)' })))

if ($old) {
  Stop-Process -Id $old -Force -ErrorAction SilentlyContinue
  for ($i = 0; $i -lt 20; $i++) { Start-Sleep -Milliseconds 300; if (-not (PidOnPort $Port)) { break } }
  $still = PidOnPort $Port
  if ($still) { W ("FAIL: port ${Port} still held by $still after kill"); exit 1 }
  W "old process stopped, port released"
}

$null = & schtasks /Run /TN 'Goat-Gateway' 2>&1
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  $new = PidOnPort $Port
  if ($new) { W ("OK: gateway back up on ${Port}, new PID $new"); exit 0 }
}
W 'FAIL: gateway did not come back within 20s (检查 Goat-Gateway-Watchdog 会不会兜底)'
exit 1
