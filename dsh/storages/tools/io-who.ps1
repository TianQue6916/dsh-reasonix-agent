# io-who.ps1 -- attribute PhysicalDisk writes to processes via PDH
# 走 \Process(*) 实例表 + ID Process 配对, 绕开 Get-Process 的 IL 遮蔽
param([int]$Samples = 4, [int]$IntervalSec = 2)
$root = 'D:\50-游戏\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236'
Write-Output ("now = " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))

$gp = (Get-Process -ErrorAction SilentlyContinue | Measure-Object).Count
$pc = (Get-Counter '\Process(*)\ID Process' -ErrorAction SilentlyContinue).CounterSamples.Count
Write-Output "Get-Process count       = $gp"
Write-Output "PDH Process(*) instances = $pc"
Write-Output ""

Write-Output "ts,dev_MBps,procW_MBps,procO_MBps,modpage_MB,pgout_s"
$agg = @{}
for ($i = 0; $i -lt $Samples; $i++) {
  $cs = (Get-Counter -Counter @(
      '\PhysicalDisk(_Total)\Disk Write Bytes/sec',
      '\Process(*)\IO Write Bytes/sec',
      '\Process(*)\IO Other Bytes/sec',
      '\Process(*)\ID Process',
      '\Memory\Modified Page List Bytes',
      '\Memory\Pages Output/sec') -ErrorAction SilentlyContinue).CounterSamples
  $dev = 0.0; $mod = 0.0; $pg = 0.0
  foreach ($s in $cs) {
    $p = $s.Path.ToLower()
    if     ($p -like '*physicaldisk*disk write bytes/sec')   { $dev = [double]$s.CookedValue; continue }
    elseif ($p -like '*memory*modified page list bytes')     { $mod = [double]$s.CookedValue; continue }
    elseif ($p -like '*memory*pages output/sec')             { $pg  = [double]$s.CookedValue; continue }
    $n = $s.InstanceName
    if ([string]::IsNullOrEmpty($n)) { continue }
    if ($n -eq '_total' -or $n -eq 'idle') { continue }
    if (-not $agg.ContainsKey($n)) { $agg[$n] = @{ w=0.0; o=0.0; pid=0 } }
    if     ($p -like '*process*io write bytes/sec') { $agg[$n].w   += [double]$s.CookedValue }
    elseif ($p -like '*process*io other bytes/sec') { $agg[$n].o   += [double]$s.CookedValue }
    elseif ($p -like '*process*id process')         { $agg[$n].pid  = [int]$s.CookedValue }
  }
  $tw = 0.0; $to = 0.0
  foreach ($k in @($agg.Keys)) { $tw += $agg[$k].w; $to += $agg[$k].o }
  Write-Output ("{0},{1:N3},{2:N3},{3:N3},{4:N0},{5:N1}" -f (Get-Date -Format 'HH:mm:ss'), ($dev/1MB), ($tw/($i+1)/1MB), ($to/($i+1)/1MB), ($mod/1MB), $pg)
  if ($i -lt $Samples - 1) { Start-Sleep -Seconds $IntervalSec }
}

Write-Output ""
Write-Output "=== rank by IO Write Bytes/sec (avg), top 20 ==="
Write-Output "inst,PID,w_MBps,o_MBps"
$agg.GetEnumerator() | Sort-Object { -$_.Value.w } | Select-Object -First 20 | ForEach-Object {
  Write-Output ("{0},{1},{2:N3},{3:N3}" -f $_.Key, $_.Value.pid, ($_.Value.w/$Samples/1MB), ($_.Value.o/$Samples/1MB))
}
Write-Output ("=== instances tracked: {0} ===" -f $agg.Count)

Write-Output ""
Write-Output "=== mc-side file mtimes ==="
Get-ChildItem -LiteralPath "$root\saves" -Recurse -File -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'DistantHorizons*' } |
  Select-Object FullName, Length, LastWriteTime |
  Sort-Object FullName | Format-Table -AutoSize -Wrap
Write-Output "javaw alive = $((Get-Process -Name javaw -ErrorAction SilentlyContinue | Measure-Object).Count)"
