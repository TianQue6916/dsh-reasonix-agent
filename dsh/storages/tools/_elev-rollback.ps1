$log = 'C:\Users\27063\.dsh\logs\elev-rollback.log'
function W($m){ Add-Content -Path $log -Value ("{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) -Encoding UTF8 }
W 'START'
$dir = 'D:\80-系统\Toolbox\goat-gateway'
$cp  = Join-Path $dir 'config.json'
$enc = New-Object System.Text.UTF8Encoding($false)
$ts  = Get-Date -Format 'yyyyMMdd-HHmmss'
$old = [IO.File]::ReadAllText($cp)
Copy-Item $cp (Join-Path $dir "config.json.bak-$ts") -Force
W ("backup = config.json.bak-$ts")
$new = $old.Replace('"firstChunkTimeoutMs": 45000', '"firstChunkTimeoutMs": 180000')
if ($new -ne $old) {
  [IO.File]::WriteAllText($cp, $new, $enc)
  W 'config.json: firstChunkTimeoutMs 45000 -> 180000 (rolled back)'
} else { W 'SKIP: pattern 45000 not found' }
# verify BOTH files parse
foreach ($f in @('config.json','keys.json')) {
  try {
    $t = [IO.File]::ReadAllText((Join-Path $dir $f)) | ConvertFrom-Json
    if ($f -eq 'config.json') { W ("  verify " + $f + ": OK  firstChunkTimeoutMs=" + $t.upstream.firstChunkTimeoutMs + " attemptsPerKey=" + $t.upstream.attemptsPerKey) }
    else { W ("  verify " + $f + ": OK") }
  } catch { W ("  verify " + $f + " FAIL: " + $_.Exception.Message) }
}
W 'END'
