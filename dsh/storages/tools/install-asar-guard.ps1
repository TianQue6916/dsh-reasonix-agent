#Requires -Version 5.1
<#
  install-asar-guard.ps1 -- swap in the rebuilt app.asar whose four CORE client bundles
  carry the `source?.kind` null guard, then relaunch the App.

  WHY
    The desktop renderer loads the core client bundles from INSIDE app.asar, not from
    node_modules. Proved live 2026-10-07:
      curl --path-as-is --globoff -b jar.txt \
        "http://127.0.0.1:19387/plugins/??@deepseek-ai/dsh-client-ui-chat/client.js&rev=572d90f59a46"
      -> HTTP 200, 565106 B, 7 raw `source.kind` + 1 guarded == the ASAR copy (565053 B),
      NOT the on-disk %APPDATA%/npm/.../dsh-client-ui-chat/lib/client.js (565462 B, 0 raw / 8 guarded).
    So the earlier in-place node_modules patch never reached the App; rebuilding app.asar is
    the only way to hand the renderer the guard. Built by: asar-core-guard.mjs --build

  WHAT
    1. wait until every "DeepSeek Harness" process has exited        (skip: -SkipWait)
    2. rename the live app.asar to app.asar.bak-<stamp>
    3. copy the rebuilt asar into place; verify size + sha256 + the guard probe
    4. relaunch the App (Start Menu shortcut carries --no-sandbox)   (skip: -NoRelaunch)
    5. roll back to the backup if any step after the rename fails, and relaunch anyway

  USAGE
    powershell -NoProfile -ExecutionPolicy Bypass -File install-asar-guard.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File install-asar-guard.ps1 -SkipWait -NoRelaunch   # sandbox dry run

  MANUAL ROLLBACK
    Stop-Process -Name 'DeepSeek Harness' -Force
    Move-Item -Force "<resources>\app.asar.bak-<stamp>" "<resources>\app.asar"
#>
param(
  [string]$AsarPath    = 'C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\resources\app.asar',
  [string]$NewAsar     = 'C:\Users\27063\.dsh-lab\tmp\app.patched.asar',
  [string]$ExePath     = 'C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe',
  [string]$LnkPath     = 'C:\Users\27063\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness.lnk',
  [string]$LogPath     = 'C:\Users\27063\.dsh\logs\asar-guard-install.log',
  [string]$ProbeScript = 'C:\Users\27063\.dsh\storages\tools\asar-core-guard.mjs',
  [string]$ProcName    = 'DeepSeek Harness',
  [int]   $WaitMinutes = 45,
  [switch]$SkipWait,
  [switch]$NoRelaunch
)
$ErrorActionPreference = 'Stop'

$Stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogDir = Split-Path -Parent $LogPath
$null = New-Item -ItemType Directory -Force -Path $LogDir

function W([string]$m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Add-Content -LiteralPath $LogPath -Encoding UTF8 }

function Start-App() {
  if ($NoRelaunch) { W 'relaunch skipped (-NoRelaunch)'; return }
  if (Test-Path -LiteralPath $LnkPath) {
    Start-Process -FilePath $LnkPath
    W "relaunched App via shortcut: $LnkPath"
    return
  }
  Start-Process -FilePath $ExePath -ArgumentList '--no-sandbox'
  W "relaunched App via exe: $ExePath --no-sandbox"
}

W ''
W '================================================================'
W "=== install-asar-guard start  pid=$PID ==="
W "live asar : $AsarPath"
W "rebuilt   : $NewAsar"
if (-not (Test-Path -LiteralPath $NewAsar))  { W "RESULT: FAIL rebuilt asar missing: $NewAsar"; exit 1 }
if (-not (Test-Path -LiteralPath $AsarPath)) { W "RESULT: FAIL live asar missing: $AsarPath"; exit 1 }
$newLen = (Get-Item -LiteralPath $NewAsar).Length
$newSha = (Get-FileHash -LiteralPath $NewAsar -Algorithm SHA256).Hash
W "rebuilt size/sha: $newLen B / $newSha"
$node = $null
try { $node = (Get-Command node -ErrorAction Stop).Source } catch { W 'note: node not on PATH; sha256-only verification' }
W "node      : $node"

if ($SkipWait) {
  W '--- -SkipWait: not waiting for App exit ---'
} else {
  W '--- waiting for every App process to exit ---'
  $deadline = (Get-Date).AddMinutes($WaitMinutes)
  $tick = 0
  while ($true) {
    $procs = @(Get-Process -Name $ProcName -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) { break }
    if ((Get-Date) -gt $deadline) { W "RESULT: TIMEOUT after $WaitMinutes min ($($procs.Count) procs alive)"; exit 2 }
    $tick++
    if ($tick % 20 -eq 1) { W ("  still running: " + ($procs.Id -join ',')) }
    Start-Sleep -Seconds 3
  }
  W 'App processes gone; settling 6s for file handles'
  Start-Sleep -Seconds 6
}

$bak = "$AsarPath.bak-$Stamp"
$renamed = $false
for ($i = 1; $i -le 15; $i++) {
  try { Move-Item -LiteralPath $AsarPath -Destination $bak -Force; $renamed = $true; W "renamed live asar -> $bak (attempt $i)"; break }
  catch { W "rename attempt $i failed: $($_.Exception.Message)"; Start-Sleep -Seconds 2 }
}
if (-not $renamed) { W 'RESULT: FAIL could not rename the live asar (handles still held?)'; exit 3 }

function Undo([string]$reason) {
  W "ROLLBACK: $reason"
  try {
    if (Test-Path -LiteralPath $AsarPath) { Remove-Item -LiteralPath $AsarPath -Force }
    Move-Item -LiteralPath $bak -Destination $AsarPath -Force
    W "ROLLBACK ok: restored $bak -> $AsarPath"
  } catch {
    W "ROLLBACK FAILED: $($_.Exception.Message)"
    W "  manual recovery: Move-Item -Force ""$bak"" ""$AsarPath"""
  }
  try { Start-App } catch { W "WARN relaunch after rollback failed: $($_.Exception.Message)" }
  W 'RESULT: FAIL'
  exit 4
}

try { Copy-Item -LiteralPath $NewAsar -Destination $AsarPath -Force } catch { Undo "copy failed: $($_.Exception.Message)" }
$liveLen = (Get-Item -LiteralPath $AsarPath).Length
$liveSha = (Get-FileHash -LiteralPath $AsarPath -Algorithm SHA256).Hash
W "installed : $liveLen B / $liveSha"
if ($liveLen -ne $newLen -or $liveSha -ne $newSha) { Undo 'size/sha256 mismatch after copy' }

if ($node -ne $null -and (Test-Path -LiteralPath $ProbeScript)) {
  W '--- asar-core-guard --check <live asar> ---'
  $probe = & $node $ProbeScript --check $AsarPath 2>&1 | Out-String
  foreach ($line in ($probe -split "\r?\n")) { if ($line.Trim() -ne '') { W "  $line" } }
  if ($probe -notmatch 'RESULT: ok=true') { Undo 'guard probe did not report ok=true on the installed asar' }
} else {
  W 'note: guard probe skipped'
}

try { Start-App } catch { W "WARN relaunch failed: $($_.Exception.Message) (start it manually; the asar is already patched)" }
W "backup kept: $bak"
W 'RESULT: ok=True'
exit 0
