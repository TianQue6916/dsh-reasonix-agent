$log = 'C:\Users\27063\.dsh\logs\elev-fixkeys.log'
function W($m){ Add-Content -Path $log -Value ("{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) -Encoding UTF8 }
W 'START'
$dir = 'D:\80-系统\Toolbox\goat-gateway'
$kp  = Join-Path $dir 'keys.json'
$enc = New-Object System.Text.UTF8Encoding($false)
$bak = Get-ChildItem (Join-Path $dir 'keys.json.bak-*') | Sort-Object LastWriteTime -Descending | Select-Object -First 1
W ("backup = " + $(if ($bak) { $bak.Name } else { '(none)' }))
if ($bak) {
  $s = [IO.File]::ReadAllText($bak.FullName)
  $i = $s.IndexOf('"name": "163"')
  $j = $s.IndexOf('"enabled": true', $i)
  $needle = '"enabled": true'
  if ($i -ge 0 -and $j -gt $i) {
    $s2 = $s.Substring(0, $j) + '"enabled": false' + $s.Substring($j + $needle.Length)
    [IO.File]::WriteAllText($kp, $s2, $enc)
    W 'rewrote keys.json from backup (len-correct splice)'
  } else { W 'SKIP: anchors not found in backup' }
}
try {
  $k = [IO.File]::ReadAllText($kp) | ConvertFrom-Json
  W 'JSON PARSE OK'
  foreach ($x in $k.keys) { W ("  key {0}: enabled={1} weight={2} priority={3}" -f $x.name, $x.enabled, $x.weight, $x.priority) }
} catch { W ('JSON PARSE FAIL: ' + $_.Exception.Message) }
W 'END'
