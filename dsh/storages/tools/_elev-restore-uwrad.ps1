#Requires -Version 5.1
# WHY: 2026-10-17 22:46 CST crash "Accessing LegacyRandomSource from multiple threads" @
#      ClientLevel.doAnimateTick:400. This is crash #26 of a series starting 2026-08-26.
#      Log forensics (194 x 2026-*.log.gz) show `unsafe_world_random_access_detector` was present in
#      42 consecutive launches from 2026-09-13-5 through 2026-10-10-8. During that window
#      (09-14 ~ 10-09, 26 days) there were ZERO crashes of this type; it crashed 12x before it was
#      installed and 13x after 2026-10-10 14:49 when it was moved to mods-disabled/.
#      Per-launch pack-set diff of 2026-10-09-2 -> 2026-10-10-1: the ONLY delta was
#      "- mod/unsafe_world_random_access_detector".
# WHAT: copy the jar back into mods/ (COPY, not MOVE -- the mods-disabled/ original is kept as the
#       rollback artifact, so undoing this is a single file delete).
# NOTE: com.ishland.uwrad @Redirects Level's random field init to CheckedThreadLocalRandom
#       (extends SingleThreadedRandomSource, no ThreadingDetector, per-thread FALLBACK).
#       It downgrades MC's fail-fast assertion into a log-and-degrade shim. Touches no save data.
# ROLLBACK: delete D:\...\mods\unsafe-world-random-access-detector-1.1.3+neoforge.jar
$ErrorActionPreference = 'Stop'
$Log = 'C:\Users\27063\.dsh\logs\elev-restore-uwrad.log'
function W($m) { $l = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m; Add-Content -Path $Log -Value $l -Encoding UTF8; Write-Host $l }
New-Item -ItemType Directory -Force -Path (Split-Path $Log) | Out-Null
W ("=== elevated={0} ===" -f ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))

$root = 'D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236'
$src  = Join-Path $root 'mods-disabled\unsafe-world-random-access-detector-1.1.3+neoforge.disabled'
$dst  = Join-Path $root 'mods\unsafe-world-random-access-detector-1.1.3+neoforge.jar'
$modsDir = Join-Path $root 'mods'
W ("src = $src")
W ("dst = $dst")
W ("src exists       = " + (Test-Path -LiteralPath $src))
W ("dst exists BEFORE= " + (Test-Path -LiteralPath $dst))
W ("mods/*.jar BEFORE= " + ((Get-ChildItem -LiteralPath $modsDir -File -Filter *.jar | Measure-Object).Count))

try { Copy-Item -LiteralPath $src -Destination $dst -Force } catch { W ("COPY FAILED: " + $_.Exception.GetType().FullName + " | " + $_.Exception.Message); W "RESULT: ok=False"; exit 1 }

$h1 = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash
$h2 = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash
W ("src sha256 = $h1")
W ("dst sha256 = $h2")
W ("size dst   = " + (Get-Item -LiteralPath $dst).Length)
W ("sha MATCH  = " + ($h1 -eq $h2))

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($dst)
$names = @($zip.Entries | ForEach-Object { $_.FullName })
$zip.Dispose()
W ("entries = " + $names.Count)
W ("has mixins.json     = " + ($names -contains 'unsafe-world-random-access-detector.mixins.json'))
W ("has MixinWorld.class= " + ($names -contains 'com/ishland/uwrad/mixin/MixinWorld.class'))
W ("has mods.toml       = " + ($names -contains 'META-INF/neoforge.mods.toml'))
W ("mods/*.jar AFTER = " + ((Get-ChildItem -LiteralPath $modsDir -File -Filter *.jar | Measure-Object).Count))
if (-not ($h1 -eq $h2) -or -not ($names -contains 'com/ishland/uwrad/mixin/MixinWorld.class')) { W "RESULT: ok=False"; exit 1 }
W "RESULT: ok=True"
