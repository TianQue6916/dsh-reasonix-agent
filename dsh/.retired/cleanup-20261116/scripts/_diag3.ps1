$ErrorActionPreference='Stop'
foreach ($p in @('web','desktop')) {
  $dir = 'C:\Users\27063\.dsh\profiles\' + $p
  $gp  = $dir + '\node_modules\@local\dsh-plugin-goat-panel'
  Write-Output ("=== {0} ===" -f $p)
  Write-Output ("  Test-Path dir   : " + (Test-Path -LiteralPath $gp))
  Write-Output ("  Test-Path child : " + (Test-Path -LiteralPath ($gp + '\lib\client.js')))
  try {
    $it = Get-Item -LiteralPath $gp -Force
    Write-Output ("  Get-Item OK     : Attributes={0} LinkType=[{1}] LinkTarget=[{2}]" -f $it.Attributes, $it.LinkType, ($it.LinkTarget -join ','))
  } catch { Write-Output ("  Get-Item FAILED : " + $_.Exception.Message) }
  $c = $gp + '\lib\client.js'
  if (Test-Path -LiteralPath $c) {
    $f = Get-Item -LiteralPath $c
    $h = (Get-FileHash -LiteralPath $c -Algorithm SHA256).Hash.Substring(0,8).ToLower()
    Write-Output ("  client.js       : {0}B sha={1} mtime={2}" -f $f.Length, $h, $f.LastWriteTime)
  }
}
