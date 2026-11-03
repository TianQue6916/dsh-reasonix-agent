$log = 'C:\Users\27063\.dsh\storages\tools\_probe-appxvolume-err.log'
Set-Content -LiteralPath $log -Value ("=== " + (Get-Date).ToString('s') + " ===")
function W([string]$s) { Add-Content -LiteralPath $log -Value $s }

W "--- Get-AppxVolume objects (full) ---"
foreach ($v in Get-AppxVolume) {
  W ("  PackageStorePath = " + $v.PackageStorePath)
  W ("  Name             = " + $v.Name)
  W ("  MountPoint       = " + $v.MountPoint)
  W ("  IsSystemVolume   = " + $v.IsSystemVolume)
  W ("  IsOffline        = " + $v.IsOffline)
  W ("  MediaType        = " + $v.MediaType)
  W ("  TotalSizeBytes   = " + $v.TotalSizeBytes)
  W ("  AvailableSpace   = " + $v.AvailableSpace)
  W ""
}

W "--- AppPackageLog for failed ActivityId ---"
try {
  Get-AppPackageLog -ActivityID 67e619ba-6a8c-000a-3990-41688c6add01 -ErrorAction Stop |
    Select-Object -First 25 | ForEach-Object { W ("  " + $_.Time + " [" + $_.Level + "] " + $_.Message) }
} catch { W ("  ERR: " + $_.Exception.Message) }

W "--- retry with volume OBJECT ---"
try {
  $vol = Get-AppxVolume | Where-Object { $_.PackageStorePath -like 'D:*' }
  Remove-AppxVolume -Volume $vol -ErrorAction Stop
  W "  OK (object form)"
} catch { W ("  ERR obj: " + $_.Exception.Message) }

W "--- volumes after retry ---"
Get-AppxVolume | ForEach-Object { W ("  " + $_.PackageStorePath + " system=" + $_.IsSystemVolume) }
