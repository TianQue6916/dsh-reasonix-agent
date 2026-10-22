# goat-gateway: attemptsPerKey 2 -> 1  (2026-10-07)
# WHY: gateway firstChunkTimeoutMs=180000 x attemptsPerKey=2 = 360s retry budget,
#      but dsh stall-guard stallMs=240000 kills the turn first => user sees "interrupt".
#      180s x 1 = 180s < 240s, so gateway returns a terminal error before the guard fires.
# HOW: exact equal-length replace of a JSON scalar, backup first, then validate JSON.
# NOTE: reversible -> change "attemptsPerKey": 1 back to 2 and POST /_gateway/reload
$ErrorActionPreference = 'Stop'
$log = 'C:\Users\27063\.dsh\logs\elev-fix-attempts.log'
function W($m) { $l = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m; Write-Host $l; Add-Content -Path $log -Value $l -Encoding UTF8 }
$dir = 'D:\Toolbox\goat-gateway'
$p = Join-Path $dir 'config.json'
W "=== elevated=$([bool](New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) ==="
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$bak = Join-Path $dir ("config.json.bak-" + $ts)
Copy-Item -LiteralPath $p -Destination $bak -Force
W ("backup = " + $bak)
$s = [IO.File]::ReadAllText($p)
$needle = '"attemptsPerKey": 2'
if ($s.IndexOf($needle) -lt 0) { W "ABORT: needle not found"; exit 1 }
$s2 = $s.Replace($needle, '"attemptsPerKey": 1')
W ("len before={0} after={1} (delta={2}, expect 0)" -f $s.Length, $s2.Length, ($s2.Length - $s.Length))
[IO.File]::WriteAllText($p, $s2, (New-Object System.Text.UTF8Encoding($false)))
try {
  $j = Get-Content -LiteralPath $p -Raw | ConvertFrom-Json
  W ("verify config.json OK  attemptsPerKey={0}  maxAttemptsPerRequest={1}  firstChunkTimeoutMs={2}  upstreamTimeoutMs={3}" -f $j.attemptsPerKey, $j.maxAttemptsPerRequest, $j.upstream.firstChunkTimeoutMs, $j.upstreamTimeoutMs)
} catch { W ("verify config.json FAIL: " + $_.Exception.Message); exit 1 }
try {
  $k = Get-Content -LiteralPath (Join-Path $dir 'keys.json') -Raw | ConvertFrom-Json
  W ("verify keys.json OK  count=" + @($k.keys).Count)
} catch { W ("verify keys.json FAIL: " + $_.Exception.Message); exit 1 }
W "RESULT: ok=True"
