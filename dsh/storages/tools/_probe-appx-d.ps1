$log = 'C:\Users\27063\.dsh\storages\tools\_probe-appx-d.log'
$o = @("=== " + (Get-Date).ToString('s') + " ===")
$all = Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue
$o += "AllUsers packages: " + ($all | Measure-Object).Count
$onD = $all | Where-Object { $_.InstallLocation -like 'D:*' }
$o += "installed on D: " + ($onD | Measure-Object).Count
$onD | Select-Object -First 20 | ForEach-Object { $o += ("   {0,-55} {1}" -f $_.Name, $_.InstallLocation) }
$o += "--- default volume / package store ---"
try { (Get-AppxDefaultVolume).PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { $o += ("   {0} = {1}" -f $_.Name, $_.Value) } } catch { $o += "   ERR $_" }
$o += "--- volume for D: ---"
try {
  $v = Get-AppxVolume -ErrorAction Stop
  $v | ForEach-Object { $o += ("   {0}  mount={1}  offline={2}  system={3}  media={4}" -f $_.PackageStorePath, $_.MountPoint, $_.IsOffline, $_.IsSystemVolume, $_.MediaType) }
} catch { $o += "   Get-AppxVolume ERR: $($_.Exception.Message)" }
$o | Set-Content -LiteralPath $log
