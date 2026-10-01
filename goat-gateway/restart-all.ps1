<#
  restart-all.ps1 — 延迟重启 goat 三件套（gateway / quota-http / dsh web）
  ---------------------------------------------------------------------
  为什么必须「延迟 + 脱离调用方管道」：
    请求这次重启的 agent 自己就跑在这条链路上 —— dsh web 是它的宿主进程、
    goat-gateway 是它跟 LLM 通信的出口。立刻重启会把 in-flight 请求连同
    还没写完的回复一起打断；而如果被调用方的管道继承着，调用方会一直等到
    子进程退出才返回。所以：Start-Process + UseShellExecute（不继承管道），
    并且先 sleep 再动手。

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File restart-all.ps1 -DelaySeconds 90
    powershell -NoProfile -ExecutionPolicy Bypass -File restart-all.ps1 -SkipDsh
  日志：logs\restart-all.log
#>
param(
  [int]$DelaySeconds = 90,
  [switch]$SkipDsh,
  [switch]$SkipGateway
)
$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
$log = Join-Path $root 'logs\restart-all.log'
function Write-Log([string]$m) {
  try { [IO.File]::AppendAllText($log, "$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') $m`r`n") } catch {}
}
function Get-PidOnPort([int]$port) {
  @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique)
}
function Test-Health([string]$url) {
  try { $r = Invoke-RestMethod -Uri $url -TimeoutSec 5; return [bool]$r.ok } catch { return $false }
}

Write-Log "scheduled delay=${DelaySeconds}s skipGateway=$SkipGateway skipDsh=$SkipDsh pid=$PID"
Start-Sleep -Seconds $DelaySeconds

# ---------- 1) goat-gateway (8788) ----------
if (-not $SkipGateway) {
  foreach ($opid in Get-PidOnPort 8788) { Write-Log "gateway stop pid=$opid"; Stop-Process -Id $opid -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
  & schtasks /run /tn 'Goat-Gateway' 2>&1 | Out-Null
  Write-Log 'gateway schtasks /run Goat-Gateway'
  $ok = $false
  for ($i = 0; $i -lt 12; $i++) { Start-Sleep -Seconds 3; if (Test-Health 'http://127.0.0.1:8788/health') { $ok = $true; break } }
  if ($ok) { Write-Log 'gateway UP' } else { Write-Log 'gateway STILL DOWN (watchdog 会在 1 分钟内兜底)' }
}

# ---------- 2) quota-http (8790) ----------
$vbs = Join-Path $root 'start-quota-http.vbs'
foreach ($opid in Get-PidOnPort 8790) { Write-Log "quota-http stop pid=$opid"; Stop-Process -Id $opid -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1
if (Test-Path $vbs) {
  & cscript //nologo $vbs | Out-Null
  $okq = $false
  for ($i = 0; $i -lt 10; $i++) { Start-Sleep -Seconds 1; if (Test-Health 'http://127.0.0.1:8790/health') { $okq = $true; break } }
  if ($okq) { Write-Log 'quota-http UP' } else { Write-Log 'quota-http STILL DOWN' }
} else { Write-Log 'quota-http: start-quota-http.vbs 不存在，跳过' }

# ---------- 3) dsh web (3080) ----------
if (-not $SkipDsh) {
  $launch = Join-Path $env:USERPROFILE '.dsh\launch-dsh.ps1'
  foreach ($opid in Get-PidOnPort 3080) { Write-Log "dsh stop pid=$opid"; Stop-Process -Id $opid -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 3
  if (Test-Path $launch) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $launch -Mode Serve 2>&1 | Out-Null
    Write-Log 'dsh launch-dsh.ps1 -Mode Serve 已执行'
  } else { Write-Log "dsh: 找不到 $launch" }
  $okd = $false
  for ($i = 0; $i -lt 15; $i++) { Start-Sleep -Seconds 2; if (@(Get-PidOnPort 3080).Count -gt 0) { $okd = $true; break } }
  if ($okd) { Write-Log 'dsh UP (3080 已监听)' } else { Write-Log 'dsh STILL DOWN' }
}
Write-Log 'done'
