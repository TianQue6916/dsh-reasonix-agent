$prof = 'C:\Users\27063\.dsh\profiles'
foreach ($p in @('web','desktop')) {
  Write-Output ('===== profile ' + $p)
  $pj = Get-Content (Join-Path $prof ($p + '\package.json')) -Raw | ConvertFrom-Json
  foreach ($k in $pj.dependencies.PSObject.Properties) {
    $v = [string]$k.Value
    if ($v -match '^(file|link):') {
      $srcWin = ($v -replace '^(file|link):','') -replace '/','\'
      $nm = Join-Path $prof ($p + '\node_modules\' + $k.Name)
      $kind = 'MISSING'
      if (Test-Path $nm) {
        $it = Get-Item $nm -Force
        if ($it.LinkType) { $kind = $it.LinkType } else { $kind = 'COPY' }
      }
      $sig = ''
      $nmc = Join-Path $nm 'lib\client.js'
      $srcC = Join-Path $srcWin 'lib\client.js'
      if ((Test-Path $nmc) -and (Test-Path $srcC)) {
        $a = (Get-FileHash $nmc -Algorithm SHA256).Hash.Substring(0,8)
        $b = (Get-FileHash $srcC -Algorithm SHA256).Hash.Substring(0,8)
        $same = 'STALE'; if ($a -eq $b) { $same = 'SAME ' }
        $sig = $same + ' nm=' + $a + ' src=' + $b
      } elseif ((Test-Path $nm) -and (Test-Path $srcWin)) {
        # no client.js: compare whole dir file count+mtime of index
        $sig = '(no lib/client.js)'
      }
      Write-Output ('  ' + $k.Name + '  [' + $kind + ']  ' + $sig)
    }
  }
}
