$ErrorActionPreference = 'Continue'
$log = 'C:\Users\27063\.dsh\storages\tools\_remove-appxvolume-d.log'
Set-Content -LiteralPath $log -Value ("=== " + (Get-Date).ToString('s') + " ===")
function W([string]$s) { Add-Content -LiteralPath $log -Value $s }

function Snap([string]$p) {
  if (-not (Test-Path -LiteralPath $p)) { return "MISSING" }
  $f = Get-ChildItem -LiteralPath $p -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum
  return ("files={0} sizeMB={1:N1}" -f $f.Count, ($f.Sum/1MB))
}

$tgt = 'D:\80-系统\WindowsApps'
W ("[:0] before snapshot: " + (Snap $tgt))

$volBefore = @(Get-AppxVolume -ErrorAction SilentlyContinue)
W ("[:1] volumes before = " + $volBefore.Count)
foreach ($v in $volBefore) { W ("      " + $v.PackageStorePath + "  system=" + $v.IsSystemVolume + " offline=" + $v.IsOffline) }

$pkOnD = @(Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue | Where-Object { $_.InstallLocation -like 'D:*' })
W ("[:2] registered packages on D = " + $pkOnD.Count)

$volD = $volBefore | Where-Object { $_.PackageStorePath -like 'D:*' }
if (-not $volD) {
  W "[:3] no D volume -> nothing to do"
} elseif ($pkOnD.Count -gt 0) {
  W "[:3] ABORT: packages still registered on D"
} else {
  W ("[:3] calling Remove-AppxVolume -Volume '" + $volD.PackageStorePath + "'")
  try {
    Remove-AppxVolume -Volume $volD.PackageStorePath -ErrorAction Stop
    W "[:4] Remove-AppxVolume returned OK"
  } catch {
    W ("[:4] ERR: " + $_.Exception.GetType().Name + " | " + $_.Exception.Message)
  }
}

$volAfter = @(Get-AppxVolume -ErrorAction SilentlyContinue)
W ("[:5] volumes after = " + $volAfter.Count)
foreach ($v in $volAfter) { W ("      " + $v.PackageStorePath + "  system=" + $v.IsSystemVolume) }
W ("[:6] after snapshot: " + (Snap $tgt))
$li = Get-Item -LiteralPath 'D:\WindowsApps' -Force -ErrorAction SilentlyContinue
W ("[:7] D:\WindowsApps = " + $(if ($li) { "attributes=" + $li.Attributes + " target=" + ($li.Target -join ';') } else { "GONE" }))
W ("[:8] default volume = " + (Get-AppxDefaultVolume).PackageStorePath)
W "=== done ==="
