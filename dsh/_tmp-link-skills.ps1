$ErrorActionPreference = 'Stop'
$src = Join-Path $env:USERPROFILE '.reasonix\skills'
$dst = Join-Path $env:USERPROFILE '.dsh\skills'

if (Test-Path -LiteralPath $dst) { Write-Output "DEST-EXISTS"; exit 1 }
New-Item -ItemType Directory -Force -Path $dst | Out-Null

$dirNames = @{}
Get-ChildItem -LiteralPath $src -Directory | ForEach-Object { $dirNames[$_.Name] = $true }

$linked = 0; $copied = 0; $skip = @()

foreach ($d in (Get-ChildItem -LiteralPath $src -Directory | Sort-Object Name)) {
  $sk = Join-Path $d.FullName 'SKILL.md'
  if (-not (Test-Path -LiteralPath $sk)) { $skip += "NO-SKILL.md : $($d.Name)"; continue }
  New-Item -ItemType Junction -Path (Join-Path $dst $d.Name) -Target $d.FullName | Out-Null
  $linked++
}

foreach ($f in (Get-ChildItem -LiteralPath $src -File -Filter '*.md' | Sort-Object Name)) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
  if ($dirNames.ContainsKey($base))        { $skip += "DUP-OF-DIR  : $($f.Name)"; continue }
  if ($base -notmatch '^[a-z0-9]+(-[a-z0-9]+)*$') { $skip += "NON-KEBAB   : $($f.Name)"; continue }
  Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $dst $f.Name)
  $copied++
}

Write-Output "junctions=$linked  copies=$copied  skipped=$($skip.Count)"
$skip | ForEach-Object { Write-Output "  $_" }
