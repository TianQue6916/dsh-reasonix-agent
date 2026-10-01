<#
  stop-gateway.ps1 — 停止 goat-gateway（幂等）

  因为 node 是脱管进程，停止需要两步：结束计划任务 + 杀掉占用 8788 的进程。
  用法：powershell -NoProfile -ExecutionPolicy Bypass -File .\stop-gateway.ps1
#>
param([int]$Port = 8788)

$ErrorActionPreference = 'SilentlyContinue'
& schtasks /end /tn 'Goat-Gateway' | Out-Null

$killed = @()
foreach ($p in (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique) {
  Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
  $killed += $p
}
Start-Sleep -Seconds 1

if ($killed.Count) { Write-Host "stopped gateway (killed pid: $($killed -join ', '))" -ForegroundColor Yellow }
else { Write-Host "gateway was not listening on $Port" -ForegroundColor DarkGray }

try { Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 3 | Out-Null; Write-Host "WARN: 仍在响应，请手动检查" -ForegroundColor Red }
catch { Write-Host "confirmed: port $Port is down" -ForegroundColor Green }
