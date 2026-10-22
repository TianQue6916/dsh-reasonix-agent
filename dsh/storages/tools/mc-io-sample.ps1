param([int]$Minutes = 25, [int]$IntervalSec = 5)
$ErrorActionPreference = 'Continue'
$logs = 'C:\Users\27063\.dsh\logs'
if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Force -Path $logs | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$csv = Join-Path $logs ("mc-io-$stamp.csv")
$end = (Get-Date).AddMinutes($Minutes)
Set-Content -LiteralPath $csv -Value 'ts,disk_write_MBps,javaw_write_MBps,system_write_MBps,top_proc,top_MBps,pages_out_per_s,mem_avail_MB' -Encoding UTF8
$n = 0
while ((Get-Date) -lt $end) {
  $t = Get-Date -Format 'HH:mm:ss'
  $d = 0.0; $j = 0.0; $s = 0.0; $tn = '-'; $tv = 0.0; $po = 0.0; $ma = 0
  try {
    $r = Get-Counter -Counter @('\PhysicalDisk(_Total)\Disk Write Bytes/sec','\Process(*)\IO Write Bytes/sec','\Memory\Pages Output/sec','\Memory\Available MBytes') -ErrorAction Stop
    foreach ($cs in $r.CounterSamples) {
      $pp = $cs.Path; $v = $cs.CookedValue
      if ($pp -like '*physicaldisk*') { $d = $v / 1MB }
      elseif ($pp -like '*pages output*') { $po = $v }
      elseif ($pp -like '*available mbytes*') { $ma = [int]$v }
      elseif ($pp -like '*io write bytes/sec*') {
        $in = $cs.InstanceName
        if ($in -like 'javaw*' -or $in -like 'java*') { $j += $v }
        if ($in -eq 'system') { $s = $v }
        if ($in -ne '_total' -and $in -ne 'idle' -and $v -gt $tv) { $tv = $v; $tn = $in }
      }
    }
  } catch { }
  Add-Content -LiteralPath $csv -Value ("{0},{1},{2},{3},{4},{5},{6},{7}" -f $t, [math]::Round($d,3), [math]::Round($j/1MB,3), [math]::Round($s/1MB,3), $tn, [math]::Round($tv/1MB,3), [math]::Round($po,1), $ma)
  $n++
  Start-Sleep -Seconds $IntervalSec
}
Add-Content -LiteralPath $csv -Value "# DONE samples=$n"
