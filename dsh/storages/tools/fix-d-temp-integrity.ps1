# fix-d-temp-integrity.ps1 -- ROOT CAUSE FIX for "D: not writable" from dsh tools.
#
# Mechanism (verified experimentally on 2026-10-07):
#   dsh's Windows sandbox lowers tool processes to LOW integrity (S-1-16-4096)
#   and marks the workspace tree (C:\Users\27063) with a LOW mandatory label.
#   Windows "no-write-up" then blocks LOW subjects from writing any object whose
#   label is higher (an object with NO label counts as Medium). D:\ was never
#   labelled -> every write from a dsh tool gets EPERM / Access denied.
#   A directory that ALREADY carries a Low label (D:\Temp\dsh-label-probe) was
#   writable from the same shell, which is the proof.
#
# Fix: give the target directory a Low mandatory label. High/Medium processes
# keep full access (no-write-up only restricts low->high), so nothing is lost.
param([switch]$NoElevate, [string]$Target = 'D:\Temp', [switch]$Rollback)
function Test-Admin {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
$LogDir = Join-Path $env:USERPROFILE '.dsh\logs'
$Report = Join-Path $LogDir 'fix-d-temp-integrity.log'
if (-not (Test-Admin) -and -not $NoElevate) {
    Write-Host '[*] requesting UAC elevation...'
    $extra = @(); if ($Rollback) { $extra += '-Rollback' }
    if ($Target -ne 'D:\Temp') { $extra += @('-Target', ('"'+$Target+'"')) }
    Start-Process powershell.exe -ArgumentList (@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-NoElevate') + $extra) -Verb RunAs -Wait
    Get-Content -LiteralPath $Report -ErrorAction SilentlyContinue
    return
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$o = New-Object System.Collections.Generic.List[string]
$o.Add("# fix-d-temp-integrity  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  elevated=$((Test-Admin))  target=$Target  rollback=$Rollback")
if (-not (Test-Path -LiteralPath $Target)) { $o.Add("MISSING $Target"); ($o -join "`r`n")|Set-Content $Report -Encoding UTF8; return }

$o.Add('--- BEFORE ---')
$o.Add((& icacls $Target | Out-String).Trim())

$lvl = if ($Rollback) { 'Medium' } else { 'Low' }
$o.Add("--- setintegritylevel (OI)(CI)$lvl   (recursive) ---")
$o.Add((& icacls $Target /setintegritylevel "(OI)(CI)$lvl" /T /C 2>&1 | Out-String).Trim())

$o.Add('--- AFTER ---')
$o.Add((& icacls $Target | Out-String).Trim())
($o -join "`r`n") | Set-Content -LiteralPath $Report -Encoding UTF8
Get-Content -LiteralPath $Report
