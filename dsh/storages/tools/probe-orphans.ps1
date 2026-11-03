$log = 'C:\Users\27063\.dsh\storages\tools\_probe-orphans.log'
Set-Content -LiteralPath $log -Value ("=== " + (Get-Date).ToString('s') + " ===")
function W([string]$s) { Add-Content -LiteralPath $log -Value $s }

$root = 'D:\80-系统\WindowsApps'
$pkgs = Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue
$fullNames = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
foreach ($p in $pkgs) { [void]$fullNames.Add($p.PackageFullName) }
W ("registered packages (AllUsers): " + $pkgs.Count)

$keep = @(); $orphan = @()
foreach ($d in (Get-ChildItem -LiteralPath $root -Force -Directory -ErrorAction SilentlyContinue)) {
  $sz = (Get-ChildItem -LiteralPath $d.FullName -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum)
  $row = [pscustomobject]@{ Name = $d.Name; MB = [math]::Round($sz.Sum/1MB,1); LastWrite = $d.LastWriteTime }
  if ($fullNames.Contains($d.Name)) { $keep += $row } else { $orphan += $row }
}
W ("--- MATCHED a registered PackageFullName (KEEP for now): " + $keep.Count)
$keep  | Sort-Object MB -Descending | ForEach-Object { W ("   KEEP  {0,-62} {1,9} MB  {2}" -f $_.Name, $_.MB, $_.LastWrite.ToString('yyyy-MM-dd')) }
W ("--- NOT in registry (orphan candidates): " + $orphan.Count)
$orphan | Sort-Object MB -Descending | ForEach-Object { W ("   ORPH  {0,-62} {1,9} MB  {2}" -f $_.Name, $_.MB, $_.LastWrite.ToString('yyyy-MM-dd')) }
W ("TOTAL orphan MB: " + [math]::Round((($orphan | Measure-Object MB -Sum).Sum),1))
W ("TOTAL keep   MB: " + [math]::Round((($keep   | Measure-Object MB -Sum).Sum),1))
W "--- where are the matched ones actually installed? ---"
foreach ($k in $keep) {
  $p = $pkgs | Where-Object { $_.PackageFullName -eq $k.Name } | Select-Object -First 1
  W ("   {0,-62} InstallLocation={1}" -f $k.Name, $p.InstallLocation)
}
