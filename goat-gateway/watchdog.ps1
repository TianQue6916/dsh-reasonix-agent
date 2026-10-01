<#
  watchdog.ps1 — goat-gateway 看门狗（由计划任务 Goat-Gateway-Watchdog 每 1 分钟运行）

  逻辑：
    1. 连查两次 /health，都失败才判定为「真的挂了」（避免网络抖动误杀）
    2. 结束计划任务 → 清掉脱管的 node（占用 8788 端口那个）→ 重新点火
  日志：logs\watchdog.log
#>
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $root 'logs\watchdog.log'
$taskName = 'Goat-Gateway'
$port = 8788

function Write-Log([string]$msg) {
  [IO.File]::AppendAllText($log, "$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') $msg`r`n")
}

function Test-Gateway {
  try {
    $r = Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 5
    return [bool]$r.ok
  }
  catch { return $false }
}

if (Test-Gateway) {
  # 顺带刷新 GOAT 额度缓存（≥4 分钟才刷一次）——供 reasonix statusline 秒读，避免状态栏卡在联网查询上
  try {
    $cache = Join-Path $env:TEMP 'goat-usage-cache.json'
    $stale = $true
    if (Test-Path $cache) { $stale = ((Get-Date) - (Get-Item $cache).LastWriteTime).TotalSeconds -gt 240 }
    if ($stale) {
      & (Join-Path $root 'goat-usage.ps1') -Force -Brief 2>$null | Out-Null
      Write-Log 'quota cache refreshed'
    }
  } catch {}
  exit 0
}
Start-Sleep -Seconds 5
if (Test-Gateway) { exit 0 }

Write-Log 'DOWN -> restarting'

# 1) 结束任务（幂等；任务通常已是 Ready，因为 vbs 点火后即退出）
& schtasks /end /tn $taskName | Out-Null
Start-Sleep -Seconds 2

# 2) 清掉仍占着端口但已无响应的 node（脱管进程必须显式杀，否则新实例会因端口冲突退出）
$stale = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($opid in $stale) {
  Write-Log "killing unresponsive pid=$opid holding port $port"
  Stop-Process -Id $opid -Force -ErrorAction SilentlyContinue
}
if ($stale.Count) { Start-Sleep -Seconds 3 }

# 3) 点火
& schtasks /run /tn $taskName | Out-Null

for ($i = 0; $i -lt 8; $i++) {
  Start-Sleep -Seconds 5
  if (Test-Gateway) {
    Write-Log 'RECOVERED'
    exit 0
  }
}

Write-Log 'RESTART FAILED (still down after 40s) — 手动排查：cd D:\Toolbox\goat-gateway; node gateway.mjs'
exit 1
