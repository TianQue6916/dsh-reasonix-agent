# 作用：缩短 gateway 上游「首字节」超时，并禁用已欠费的 163 号。
# 为什么要改：firstChunkTimeoutMs=180000 且 attemptsPerKey=2 ⇒ 同一 key 最坏 360s，
#   而 dsh 侧 stall-guard 的 stallMs=240000 会先把 turn 掐断（用户看到「中断」）。
# 危害：无。只改超时与一个已报 insufficient credits 的 key 的开关；备份在同目录与 C 盘。
$ErrorActionPreference='Stop'
$dir = 'D:\80-系统\Toolbox\goat-gateway'
$ts  = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = 'C:\Users\27063\.dsh\logs\elev-apply-gateway-timeout.log'
$bakd= 'C:\Users\27063\.dsh\backups\goat-gateway'
$null = New-Item -ItemType Directory -Force -Path $bakd
function W($m){ Add-Content -Path $log -Value ("{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) -Encoding UTF8 }
W "=== start ts=$ts ==="

$enc = New-Object System.Text.UTF8Encoding($false)

# ---- 1) keys.json : 163 enabled true -> false ----
$kp = Join-Path $dir 'keys.json'
$s  = [IO.File]::ReadAllText($kp)
Copy-Item $kp (Join-Path $dir "keys.json.bak-$ts-pre-163-disable") -Force
Copy-Item $kp (Join-Path $bakd "keys.json.$ts") -Force
$i = $s.IndexOf('"name": "163"')
if ($i -lt 0) { W 'keys.json: 163 block NOT FOUND -> skip' }
else {
  $j = $s.IndexOf('"enabled": true', $i)
  if ($j -lt 0) { W 'keys.json: 163 already disabled or shape changed -> skip' }
  else {
    $s2 = $s.Substring(0,$j) + '"enabled": false' + $s.Substring($j + '"enabled": true'.Length)
    [IO.File]::WriteAllText($kp, $s2, $enc)
    W 'keys.json: 163 enabled -> false  WRITTEN'
  }
}

# ---- 2) config.json : firstChunkTimeoutMs 180000 -> 45000 ----
$cp = Join-Path $dir 'config.json'
$c  = [IO.File]::ReadAllText($cp)
Copy-Item $cp (Join-Path $dir "config.json.bak-$ts-pre-firstchunk45s") -Force
Copy-Item $cp (Join-Path $bakd "config.json.$ts") -Force
$old = '"firstChunkTimeoutMs": 180000'
$new = '"firstChunkTimeoutMs": 45000'
if ($c.Contains($new)) { W 'config.json: already 45000 -> skip' }
elseif ($c.Contains($old)) {
  [IO.File]::WriteAllText($cp, $c.Replace($old,$new), $enc)
  W 'config.json: firstChunkTimeoutMs 180000 -> 45000  WRITTEN'
} else { W 'config.json: firstChunkTimeoutMs=180000 NOT FOUND -> skip' }

# ---- 3) verify ----
try {
  $k = [IO.File]::ReadAllText($kp) | ConvertFrom-Json
  foreach ($x in $k.keys) { W ("verify keys: {0} enabled={1} weight={2} priority={3}" -f $x.name,$x.enabled,$x.weight,$x.priority) }
} catch { W ("verify keys FAILED: " + $_.Exception.Message) }
try {
  $cf = [IO.File]::ReadAllText($cp) | ConvertFrom-Json
  W ("verify config: firstChunkTimeoutMs=" + $cf.upstream.firstChunkTimeoutMs + " attemptsPerKey=" + $cf.attemptsPerKey + " maxAttemptsPerRequest=" + $cf.maxAttemptsPerRequest)
} catch { W ("verify config FAILED: " + $_.Exception.Message) }
W "=== end ==="
