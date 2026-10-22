# mc-io-trace.ps1 -- per-directory write attribution while Minecraft runs.
# Records, once per interval:
#   - \PhysicalDisk(_Total)\Disk Write Bytes/sec   (device level, includes kernel writeback)
#   - \Process(javaw*)\IO Write Bytes/sec          (process level syscall bytes)
#   - byte/file totals of the three suspected trees (saves / journeymap / logs)
# The gap between device and process numbers is kernel cache writeback lag.
param(
  [int]$Minutes = 15,
  [int]$IntervalSec = 10,
  [string]$Root = 'D:\50-游戏\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236'
)
$ErrorActionPreference = 'Continue'
$logDir = Join-Path $env:USERPROFILE '.dsh\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
$out = Join-Path $logDir ('mc-io-trace-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.csv')
$dirs = @(
  [pscustomobject]@{ n = 'saves'; p = 'saves\机械动力' },
  [pscustomobject]@{ n = 'jmap';  p = 'journeymap' },
  [pscustomobject]@{ n = 'logs';  p = 'logs' }
)
function Snap {
  $r = [ordered]@{}
  foreach ($d in $dirs) {
    $m = Get-ChildItem (Join-Path $Root $d.p) -Recurse -File -Force -ErrorAction SilentlyContinue |
         Measure-Object -Property Length -Sum
    $r[$d.n + '_MB'] = [math]::Round(([double]$m.Sum) / 1MB, 2)
    $r[$d.n + '_n']  = [int]$m.Count
  }
  return $r
}
function DevW {
  try {
    $c = Get-Counter -Counter '\PhysicalDisk(_Total)\Disk Write Bytes/sec' -MaxSamples 1 -ErrorAction Stop
    return [math]::Round($c.CounterSamples[0].CookedValue / 1MB, 3)
  } catch { return -1 }
}
function JavaW {
  try {
    $c = Get-Counter -Counter '\Process(*)\IO Write Bytes/sec' -MaxSamples 1 -ErrorAction Stop
    $s = 0.0
    foreach ($x in $c.CounterSamples) { if ($x.InstanceName -like 'javaw*' -or $x.InstanceName -like 'java*') { $s += $x.CookedValue } }
    return [math]::Round($s / 1MB, 3)
  } catch { return -1 }
}

# ---- main loop ----
$hdr = 'ts,elapsed_s,dev_write_MBps,javaw_write_MBps,untracked_MBps,javaw_alive'
foreach ($d in $dirs) { $hdr += ',' + $d.n + '_MB,' + $d.n + '_n' }
'delta_' + $hdr | Set-Content -LiteralPath $out -Encoding UTF8
$prev = Snap
$prevTs = Get-Date
$t0 = $prevTs
$end = $t0.AddMinutes($Minutes)
$k = 0
while ((Get-Date) -lt $end) {
  Start-Sleep -Seconds $IntervalSec
  $k++
  $now = Get-Date
  $cur = Snap
  $dev = DevW
  $jw  = JavaW
  $alive = (Get-Process -Name javaw -ErrorAction SilentlyContinue) -ne $null
  $line = $now.ToString('HH:mm:ss') + ',' + [math]::Round(($now - $t0).TotalSeconds, 0) + ',' +
          $dev + ',' + $jw + ',' + [math]::Round($dev - $jw, 3) + ',' + [int]$alive
  foreach ($d in $dirs) {
    $line += ',' + $cur[$d.n + '_MB'] + ',' + $cur[$d.n + '_n']
  }
  $line | Add-Content -LiteralPath $out -Encoding UTF8
  $delta = 'delta,' + [math]::Round(($now - $prevTs).TotalSeconds, 0) + ',,,,'
  foreach ($d in $dirs) {
    $delta += ',' + [math]::Round([double]$cur[$d.n + '_MB'] - [double]$prev[$d.n + '_MB'], 2) + ','
  }
  $delta | Add-Content -LiteralPath $out -Encoding UTF8
  $prev = $cur
  $prevTs = $now
}
'# DONE rounds=' + $k | Add-Content -LiteralPath $out -Encoding UTF8
