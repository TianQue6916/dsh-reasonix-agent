# probe-object-integrity.ps1
# Read the mandatory integrity LABEL (SACL) of filesystem objects.
# Reading a SACL requires SeSecurityPrivilege -> must run elevated.
# Self-elevates via UAC if not already admin.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File probe-object-integrity.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File probe-object-integrity.ps1 -NoElevate
#   powershell -NoProfile -ExecutionPolicy Bypass -File probe-object-integrity.ps1 -Paths 'D:\','D:\Temp'
#
# Output: <USERPROFILE>\.dsh\logs\probe-object-integrity.log  (and stdout)

param(
    [string[]]$Paths = @(
        'D:\',
        'D:\Temp',
        'D:\Toolbox',
        'C:\',
        'C:\Windows',
        'C:\Windows\Temp',
        'C:\Users',
        'C:\Users\27063',
        'C:\Users\27063\AppData\Local\Temp',
        'C:\Users\Public'
    ),
    [switch]$NoElevate
)

$ErrorActionPreference = 'Continue'
$LogFile = Join-Path $env:USERPROFILE '.dsh\logs\probe-object-integrity.log'

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin) -and -not $NoElevate) {
    Write-Host "[*] not elevated -> requesting UAC elevation"
    $argList = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', ('"' + $PSCommandPath + '"'),
        '-NoElevate'
    )
    try {
        Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs -Wait
        Write-Host "[*] elevated child finished; log:"
        if (Test-Path $LogFile) { Get-Content $LogFile }
        else { Write-Host "  (no log produced)" }
    } catch {
        Write-Host "[!] elevation failed: $($_.Exception.Message)"
    }
    return
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("# probe-object-integrity  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$lines.Add("# elevated=$(Test-Admin)  user=$env:USERNAME")

$labelMap = @{
    'S-1-16-0'     = 'Untrusted'
    'S-1-16-4096'  = 'Low'
    'S-1-16-8192'  = 'Medium'
    'S-1-16-8448'  = 'MediumPlus'
    'S-1-16-12288' = 'High'
    'S-1-16-16384' = 'System'
    'S-1-16-20480' = 'ProtectedProcess'
}

foreach ($p in $Paths) {
    $lines.Add('')
    $lines.Add("=== $p ===")
    if (-not (Test-Path -LiteralPath $p)) {
        $lines.Add('  NOT FOUND')
        continue
    }
    try {
        $acl = Get-Acl -LiteralPath $p -ErrorAction Stop
        $lines.Add("  Owner : $($acl.Owner)")
        try {
            $sacl = $acl.GetSecurityDescriptorSddlForm('Sacl')
            if ([string]::IsNullOrEmpty($sacl)) { $sacl = '(empty)' }
            $lines.Add("  SACL  : $sacl")
            $m = [regex]::Matches($sacl, '\(ML;[^)]*?(S-1-16-\d+)\)')
            if ($m.Count -eq 0) {
                $lines.Add("  LABEL : (no ML ace found in SACL)")
            } else {
                foreach ($x in $m) {
                    $sid = $x.Groups[1].Value
                    $name = if ($labelMap.ContainsKey($sid)) { $labelMap[$sid] } else { '?' }
                    $lines.Add("  LABEL : $sid ($name)   [full ace: $($x.Value)]")
                }
            }
        } catch {
            $lines.Add("  SACL  : ERR $($_.Exception.Message)")
        }
        try {
            $lines.Add("  SDDL  : $($acl.GetSecurityDescriptorSddlForm('All'))")
        } catch {
            $lines.Add("  SDDL  : ERR $($_.Exception.Message)")
        }
    } catch {
        $lines.Add("  ERR   : $($_.Exception.Message)")
    }
}

# writer identity of this elevated process (for comparison)
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$lines.Add('')
$lines.Add("=== current token groups (integrity) ===")
foreach ($g in $id.Groups) {
    $s = $g.Value
    if ($s -like 'S-1-16-*' -or $g.IsValidTargetType([Security.Principal.SecurityIdentifier])) {
        try { $nm = $g.Translate([Security.Principal.NTAccount]).Value } catch { $nm = '' }
    }
    if ($s -like 'S-1-16-*') { $lines.Add("  $s  $nm") }
}

$text = ($lines -join "`r`n")
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null
$text | Set-Content -LiteralPath $LogFile -Encoding UTF8
Write-Host $text
