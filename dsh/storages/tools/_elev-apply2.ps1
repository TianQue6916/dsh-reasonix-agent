$log = 'C:\Users\27063\.dsh\logs\elev-apply2.log'
function W($m){ Add-Content -Path $log -Value ("{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) -Encoding UTF8 }
W 'START'
$dir = 'D:\80-系统\Toolbox\goat-gateway'
$ts  = Get-Date -Format 'yyyyMMdd-HHmmss'
$enc = New-Object System.Text.UTF8Encoding($false)
# 1) keys.json
try {
  $kp = Join-Path $dir 'keys.json'
  $s = [IO.File]::ReadAllText($kp)
  Copy-Item $kp (Join-Path $dir "keys.json.bak-$ts") -Force
  $i = $s.IndexOf('"name": "163"')
  $j = $s.IndexOf('"enabled": true', $i)
  if ($i -ge 0 -and $j -ge 0) {
    $s2 = $s.Substring(0,$j) + '"enabled": false' + $s.Substring($j + 16)
    [IO.File]::WriteAllText($kp, $s2, $enc)
    W 'keys.json OK: 163 -> enabled false'
  } else { W 'keys.json SKIP (anchor not found)' }
} catch { W ('keys.json FAIL: ' + $_.Exception.GetBaseException().Message) }
# 2) config.json
try {
  $cp = Join-Path $dir 'config.json'
  $c = [IO.File]::ReadAllText($cp)
  Copy-Item $cp (Join-Path $dir "config.json.bak-$ts") -Force
  $c2 = $c.Replace('"firstChunkTimeoutMs": 180000', '"firstChunkTimeoutMs": 45000')
  if ($c2 -ne $c) { [IO.File]::WriteAllText($cp, $c2, $enc); W 'config.json OK: firstChunkTimeoutMs 180000 -> 45000' }
  else { W 'config.json SKIP (no change)' }
} catch { W ('config.json FAIL: ' + $_.Exception.GetBaseException().Message) }
# 3) verify
try {
  $k = [IO.File]::ReadAllText((Join-Path $dir 'keys.json')) | ConvertFrom-Json
  foreach ($x in $k.keys) { W ("  key {0}: enabled={1} weight={2}" -f $x.name, $x.enabled, $x.weight) }
} catch { W ('verify keys FAIL: ' + $_.Exception.Message) }
try {
  $cf = [IO.File]::ReadAllText((Join-Path $dir 'config.json')) | ConvertFrom-Json
  W ("  cfg firstChunkTimeoutMs=" + $cf.upstream.firstChunkTimeoutMs)
} catch { W ('verify cfg FAIL: ' + $_.Exception.Message) }
W 'END'
