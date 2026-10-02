$ErrorActionPreference='Continue'
foreach ($p in @('web','desktop')) {
  $base = "C:\Users\27063\.dsh\profiles\$p"
  Write-Output "=== $p ==="
  Write-Output "-- pnpm-lock: $([bool](Test-Path -LiteralPath "$base\pnpm-lock.yaml"))  package-lock: $([bool](Test-Path -LiteralPath "$base\package-lock.json"))"
  $nm = "$base\node_modules\@local"
  if (Test-Path -LiteralPath $nm) {
    Get-ChildItem -LiteralPath $nm -Force | ForEach-Object {
      $it = Get-Item -LiteralPath $_.FullName -Force
      $lt = $it.LinkType; $tg = $it.Target -join ','
      $sz = if ($it.PSIsContainer) { '' } else { "$($it.Length)B" }
      Write-Output ("  {0}  LinkType={1}  Target={2}  mtime={3}  {4}" -f $_.Name, $lt, $tg, $it.LastWriteTime, $sz)
    }
  } else { Write-Output "  @local MISSING" }
  $gp = "$nm\dsh-plugin-goat-panel\lib\client.js"
  if (Test-Path -LiteralPath $gp) {
    $h = (Get-FileHash -LiteralPath $gp -Algorithm SHA256).Hash.Substring(0,16)
    $i = Get-Item -LiteralPath $gp
    Write-Output "  goat-panel/client.js = $($i.Length)B sha=$h mtime=$($i.LastWriteTime)"
  } else { Write-Output "  goat-panel/client.js MISSING (path test: $(Test-Path -LiteralPath "$nm\dsh-plugin-goat-panel"))" }
  $pm = "$base\.plugin-manager"
  if (Test-Path -LiteralPath $pm) {
    $c = Get-ChildItem -LiteralPath $pm -Force -Recurse -ErrorAction SilentlyContinue
    Write-Output "  .plugin-manager entries=$($c.Count)"
    $c | Select-Object -First 30 | ForEach-Object { Write-Output ("    " + $_.FullName.Substring($pm.Length)) }
  }
}
