#Requires -Version 5.1
<#
  mc-io-tune-1.ps1 -- reduce Minecraft disk-write volume (stage 1, zero-risk items)

  Run ELEVATED: the dsh shell runs at Low integrity level, and Windows
  no-write-up blocks it from writing D:\ (no mandatory label). Same reason
  as install-smart-snapshot-v2.ps1.

  Principle: MOVE, never DELETE. Every action is reversible via -Rollback.
  Default is DRY RUN -- prints the plan, touches nothing. Pass -Apply to do it.

  Evidence this targets (measured 2026-10-10):
    * logs\latest.log = 125,592,861 B / 613,921 lines, line 1 is ALREADY a
      uwrad error; logs\debug.log = 154,374,709 B. Both written inside a
      single 40-minute session (10-10 00:00:00 -> 00:40:43).
      => unsafe-world-random-access-detector is spamming >=613k log lines.
    * mods\ contains 22 non-mod junk files (crash reports, error-report zips,
      a stale 1.21.1-NeoForge json, a PCL log, plus an update\ dir holding a
      superseded 28 MB DistantHorizons jar).
#>
param(
  [switch]$Apply,
  [switch]$Rollback
)

$ErrorActionPreference = 'Stop'

$V      = 'D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236'
$mods   = Join-Path $V 'mods'
$dis    = Join-Path $V 'mods-disabled'
$trash  = Join-Path $V 'zz_io-tune-trash-20261010'
$logDir = 'C:\Users\27063\.dsh\logs'
$log    = Join-Path $logDir 'mc-io-tune-1.log'

$lines = New-Object System.Collections.Generic.List[string]
function Say($m) { Write-Host $m; $lines.Add([string]$m) }

$elev = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Say "elevated = $elev"
Say "base     = $V"
Say "mode     = $(if ($Rollback) {'ROLLBACK'} elseif ($Apply) {'APPLY'} else {'DRY RUN'})"
Say ""

if (-not (Test-Path -LiteralPath $V)) { Say "FATAL: base dir not found"; exit 2 }

# ---- inventory -------------------------------------------------------------
$uwrad = @(Get-ChildItem -LiteralPath $mods -File -Filter 'unsafe-world-random-access-detector-*.jar' -ErrorAction SilentlyContinue)
$junk  = @(Get-ChildItem -LiteralPath $mods -File | Where-Object { $_.Name -notmatch '\.(jar|mp3)$' })
$updD  = Join-Path $mods 'update'
$updOk = Test-Path -LiteralPath $updD

Say "[A] disable (move to mods-disabled\): $($uwrad.Count) jar(s)"
foreach ($f in $uwrad) { Say ("      - " + $f.Name) }
Say "[B] junk in mods\ (move to zz_io-tune-trash-20261010\): $($junk.Count) file(s), $([math]::Round((($junk | Measure-Object Length -Sum).Sum)/1MB,2)) MB"
foreach ($f in $junk) { Say ("      - " + $f.Name + "  (" + [math]::Round($f.Length/1MB,2) + " MB)") }
if ($updOk) { Say "[C] stale update\ dir present -> would move it too" } else { Say "[C] no update\ dir" }
Say ""
$lines | Set-Content -LiteralPath $log -Encoding UTF8

# ---- guard: never touch a live game ----------------------------------------
$mc = @(Get-Process -Name 'javaw','java' -ErrorAction SilentlyContinue)
if ($mc.Count -gt 0) {
  Say "FATAL: Minecraft/Java is running (PID $($mc.Id -join ', ')). Close the game first."
  $lines | Set-Content -LiteralPath $log -Encoding UTF8
  exit 3
}
Say "java procs = 0 (safe)"
Say ""

# ---- rollback --------------------------------------------------------------
if ($Rollback) {
  $n = 0
  foreach ($f in $uwrad) {
    $b = Join-Path $dis $f.Name
    if (Test-Path -LiteralPath $b) { Move-Item -LiteralPath $b -Destination $f.FullName -Force; Say ("[restore] " + $f.Name); $n++ }
  }
  if (Test-Path -LiteralPath $trash) {
    Get-ChildItem -LiteralPath $trash -File | ForEach-Object {
      Move-Item -LiteralPath $_.FullName -Destination (Join-Path $mods $_.Name) -Force
      Say ("[restore] " + $_.Name); $n++
    }
    $tu = Join-Path $trash 'update'
    if (Test-Path -LiteralPath $tu) { Move-Item -LiteralPath $tu -Destination $updD -Force; Say "[restore] update\"; $n++ }
  }
  Say ""
  Say "RESULT: rollback complete, $n item(s) restored"
  $lines | Set-Content -LiteralPath $log -Encoding UTF8
  exit 0
}

if (-not $Apply) {
  Say "(DRY RUN -- nothing was changed. re-run with -Apply to execute.)"
  $lines | Set-Content -LiteralPath $log -Encoding UTF8
  exit 0
}

# ---- apply -----------------------------------------------------------------
$moved = 0
if (-not (Test-Path -LiteralPath $dis)) { New-Item -ItemType Directory -Force -Path $dis | Out-Null }
foreach ($f in $uwrad) {
  $b = Join-Path $dis ($f.BaseName + '.disabled')
  Move-Item -LiteralPath $f.FullName -Destination $b -Force
  Say ("[disable] " + $f.Name); $moved++
}
New-Item -ItemType Directory -Force -Path $trash | Out-Null
foreach ($f in $junk) {
  Move-Item -LiteralPath $f.FullName -Destination (Join-Path $trash $f.Name) -Force
  Say ("[junk]    " + $f.Name); $moved++
}
if ($updOk) { Move-Item -LiteralPath $updD -Destination (Join-Path $trash 'update') -Force; Say "[junk]    update\"; $moved++ }

Say ""
Say "RESULT: moved $moved item(s)"
Say "  disabled jar -> $dis"
Say "  junk         -> $trash"
Say "  rollback     -> rerun this script with -Rollback"
$lines | Set-Content -LiteralPath $log -Encoding UTF8
