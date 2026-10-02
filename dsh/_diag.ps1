foreach ($p in @('web','desktop')) {
  $nm = 'C:\Users\27063\.dsh\profiles\' + $p + '\node_modules\@local\dsh-plugin-goat-panel'
  Write-Output ('--- ' + $p)
  Write-Output ('    path      = ' + $nm)
  Write-Output ('    TestPath  = ' + (Test-Path -LiteralPath $nm))
  $it = Get-Item -LiteralPath $nm -Force -ErrorAction SilentlyContinue
  Write-Output ('    LinkType  = ' + [string]$it.LinkType + '   Target=' + [string]$it.Target)
  $c = Join-Path $nm 'lib\client.js'
  Write-Output ('    client    = ' + (Test-Path -LiteralPath $c))
  if (Test-Path -LiteralPath $c) {
    $f = Get-Item -LiteralPath $c -Force
    Write-Output ('    len=' + $f.Length + ' sha=' + (Get-FileHash -LiteralPath $c -Algorithm SHA256).Hash.Substring(0,8) + ' mtime=' + $f.LastWriteTime)
  }
}
