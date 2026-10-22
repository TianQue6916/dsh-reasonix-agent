#Requires -Version 5.1
# WHY: 2026-10-07 19:49-19:54 CST, the desktop App showed "本轮运行失败 / 当前请求的额度已用尽".
#      Root cause: the only funded key (`qq`) got hammered by upstream Cloudflare Error 1102
#      (Worker exceeded resource limits) + ECONNRESET, gateway failed over to `deepseek-official`,
#      whose balance is -0.22 CNY -> upstream 402 "Insufficient Balance" -> gateway COOLDOWN reason=quota
#      -> 402 body relayed to dsh -> dsh-llm normalizes to code QUOTA -> ui-chat renders message.failure.quota.
#      `deepseek-official` today: 12 gateway appearances, 8x status=402, 0x OK. It is a dead key that
#      converts a transient network blip into a terminal, misleading "quota exhausted" error.
# WHAT: flip ONLY the `enabled` flag of the key named `deepseek-official` in keys.json.
# HOW : length-safe splice computed from '"enabled": true'.Length (NOT a hardcoded 15 -- the 2026-10-07
#       14:06 incident was an off-by-one that ate the following comma and broke the JSON).
# NOTE: keys.json is mtime-hot-reloaded by gateway (loadKeys), and POST /_gateway/reload forces it.
#       Backup written next to the file as keys.json.bak-<stamp>.
# ROLLBACK: set it back to true (or copy the .bak over) and reload.

$ErrorActionPreference = 'Stop'
$Log = 'C:\Users\27063\.dsh\logs\elev-disable-official.log'
$KeysPath = 'D:\80-系统\Toolbox\goat-gateway\keys.json'
function W($m) { $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m; Add-Content -Path $Log -Value $line -Encoding UTF8; Write-Host $line }

New-Item -ItemType Directory -Force -Path (Split-Path $Log) | Out-Null
W ("=== elevated={0} ===" -f ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))

$bak = "$KeysPath.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
Copy-Item -LiteralPath $KeysPath -Destination $bak -Force
W ("backup = " + $bak)

$s = [IO.File]::ReadAllText($KeysPath)
$lenBefore = $s.Length
$anchor = '"name": "deepseek-official"'
$i = $s.IndexOf($anchor)
if ($i -lt 0) { throw "anchor '$anchor' not found in keys.json" }
$needle = '"enabled": true'
$j = $s.IndexOf($needle, $i)
if ($j -lt 0) { throw "no '$needle' after the deepseek-official anchor (already disabled?)" }
W ("anchor@{0}  enabled@{1}  needleLen={2}" -f $i, $j, $needle.Length)
$s2 = $s.Substring(0, $j) + '"enabled": false' + $s.Substring($j + $needle.Length)
W ("len before={0} after={1} (delta={2}, expect +1)" -f $lenBefore, $s2.Length, ($s2.Length - $lenBefore))
[IO.File]::WriteAllText($KeysPath, $s2, (New-Object System.Text.UTF8Encoding($false)))

try {
  $all = Get-Content $KeysPath -Raw | ConvertFrom-Json
  W "verify keys.json: JSON PARSE OK"
  foreach ($k in $all.keys) { W ("  key {0}: enabled={1} weight={2} priority={3}" -f $k.name, $k.enabled, $k.weight, $k.priority) }
} catch {
  W ("verify keys.json FAIL: " + $_.Exception.Message)
  Copy-Item -LiteralPath $bak -Destination $KeysPath -Force
  W "restored from backup"
  throw
}
W "RESULT: ok=True"
