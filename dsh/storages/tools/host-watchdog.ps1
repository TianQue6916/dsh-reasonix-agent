#requires -Version 5.1
<#
  host-watchdog.ps1 -- external liveness probe for the dsh desktop host.

  WHY THIS EXISTS
  ---------------
  When the desktop host's event loop stalls, everything INSIDE the process dies
  with it: timers stop, plugin logs stop, the session jsonl stops growing. A
  freeze therefore leaves no evidence in the host itself.

  This probe lives OUTSIDE the process. Every 2 s it polls the host's loopback
  listeners and records
    - http_code and response time per listening port
    - host CPU-time delta over the sample interval
    - host RSS, thread count, handle count

  A stall shows up as TIMEOUT while the process is still alive. The CPU delta
  then separates the two failure modes:
    delta ~ 0          -> loop is blocked waiting (sync wait / native call / socket)
    0 < delta <= 2000  -> JS spinning on one core (infinite loop / regex backtrack)
    delta > 2000       -> more than one core busy (native workers + JS)

  The host is identified by its command line (app.asar\...\dsh-desktop-host\...).
  The listening ports are random per launch, so they are discovered each sample
  instead of being hard-coded.

  Log: ~/.dsh/logs/host-watchdog.log
  Run DETACHED from dsh (scheduled task) so it survives a host freeze.

  Usage: powershell -NoProfile -ExecutionPolicy Bypass -File host-watchdog.ps1
         powershell ... -File host-watchdog.ps1 -MaxIterations 5   # self-test
#>
param([int]$MaxIterations = 0)

$ErrorActionPreference = 'Continue'

$LogPath        = Join-Path $env:USERPROFILE '.dsh\logs\host-watchdog.log'
$IntervalMs     = 5000
$ProbeTimeoutS  = 3
$HeartbeatEvery = 15      # samples between heartbeat lines (75 s at 5 s)
$MaxLogBytes    = 5MB

function Write-Line([string]$text) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'), $text
  try { Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8 } catch { }
}

$logDir = Split-Path -Parent $LogPath
if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
try {
  if ((Test-Path -LiteralPath $LogPath) -and (Get-Item -LiteralPath $LogPath).Length -gt $MaxLogBytes) {
    Remove-Item -LiteralPath ($LogPath + '.1') -Force -ErrorAction SilentlyContinue
    Move-Item -LiteralPath $LogPath -Destination ($LogPath + '.1') -Force
  }
} catch { }

if ($null -eq (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
  Write-Line 'FATAL: curl.exe not found on PATH'
  exit 1
}

function Find-DshHost {
  Get-CimInstance Win32_Process -Filter "Name='DeepSeek Harness.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*dsh-desktop-host*' } |
    Select-Object -First 1
}

function Probe-Port([int]$port) {
  $out = & curl.exe -s -o NUL -w '%{http_code}|%{time_total}' --max-time $ProbeTimeoutS "http://127.0.0.1:$port/" 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($out)) { return ('{0}=TIMEOUT' -f $port) }
  return ('{0}={1}' -f $port, $out)
}

Write-Line ('=== host-watchdog start pid={0} interval={1}ms ===' -f $PID, $IntervalMs)

$prevHostPid = 0
$prevCpuMs   = $null
$iter        = 0
$frozenCount = 0

while ($true) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $iter++

  $h = Find-DshHost
  $hostPid   = 0
  $wsMb      = 0
  $cpuMs     = 0
  $thr       = 0
  $hnd       = 0
  $hostPorts = @()

  if ($null -ne $h) {
    $hostPid = [int]$h.ProcessId
    $proc = Get-Process -Id $hostPid -ErrorAction SilentlyContinue
    if ($null -ne $proc) {
      $wsMb  = [int]($proc.WorkingSet64 / 1MB)
      $cpuMs = [int]$proc.TotalProcessorTime.TotalMilliseconds
      $thr   = $proc.Threads.Count
      $hnd   = $proc.HandleCount
    }
    $hostPorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
                   Where-Object { $_.OwningProcess -eq $hostPid } |
                   Select-Object -ExpandProperty LocalPort | Sort-Object -Unique)
  }

  # The verdict is driven ONLY by the host's own listeners. Ports 8788 (gateway) and
  # 3080 (web profile) belong to OTHER processes -- a slow gateway (0.74 s observed,
  # vs 1.3 ms for the host) must never make the host look frozen. They are still
  # probed, but reported separately as "aux:" and excluded from the verdict.
  $hostParts = @()
  foreach ($p in $hostPorts) { $hostParts += (Probe-Port $p) }
  $auxParts = @()
  foreach ($p in @(8788, 3080)) { if ($hostPorts -notcontains $p) { $auxParts += (Probe-Port $p) } }
  $auxLine = if ($auxParts.Count -gt 0) { ' aux: ' + ($auxParts -join ' ') } else { '' }
  $probeLine = ($hostParts -join ' ')

  $state = if ($null -eq $h) { 'NO-HOST' }
           elseif ($probeLine -match 'TIMEOUT') { 'FROZEN' }
           elseif ($hostParts.Count -eq 0) { 'NO-PORT' }
           else { 'OK' }

  if ($hostPid -eq 0) {
    $cpuText = 'cpu=n/a'
    $prevCpuMs = $null
  } elseif ($null -ne $prevCpuMs -and $hostPid -eq $prevHostPid) {
    $cpuText = 'cpu=+{0}ms/{1}ms' -f ($cpuMs - $prevCpuMs), $IntervalMs
  } else {
    $cpuText = 'cpu={0}ms(first)' -f $cpuMs
  }
  if ($hostPid -ne 0) { $prevCpuMs = $cpuMs }
  $prevHostPid = $hostPid

  $detail = '{0} pid={1} ws={2}MB {3} thr={4} hnd={5} probes: {6}{7}' -f $state, $hostPid, $wsMb, $cpuText, $thr, $hnd, $probeLine, $auxLine

  if ($state -eq 'FROZEN') {
    $frozenCount++
    Write-Line ('[FROZEN #{0}] {1}' -f $frozenCount, $detail)
  } elseif ($iter -eq 1 -or ($iter % $HeartbeatEvery) -eq 0 -or $state -ne 'OK') {
    Write-Line $detail
  }

  if ($MaxIterations -gt 0 -and $iter -ge $MaxIterations) { break }

  $sleep = $IntervalMs - [int]$sw.ElapsedMilliseconds
  if ($sleep -lt 200) { $sleep = 200 }
  Start-Sleep -Milliseconds $sleep
}

Write-Line ('=== host-watchdog exit after {0} samples ===' -f $iter)
