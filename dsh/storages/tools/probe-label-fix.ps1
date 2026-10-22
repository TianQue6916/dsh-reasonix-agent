# probe-label-fix.ps1 -- (1) print FULL SDDL (incl. SACL) for the C-vs-D paths,
# (2) build a low-label probe dir under D:\Temp to test the IL hypothesis.
param([switch]$NoElevate)
function Test-Admin {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
$Log = Join-Path $env:USERPROFILE '.dsh\logs\label-fix-probe.txt'
if (-not (Test-Admin) -and -not $NoElevate) {
    Write-Host '[*] requesting UAC elevation...'
    Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-NoElevate') -Verb RunAs -Wait
    Get-Content -LiteralPath $Log -ErrorAction SilentlyContinue
    return
}
$o = New-Object System.Collections.Generic.List[string]
$o.Add("# label-fix-probe  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  elevated=$((Test-Admin))")
$o.Add('')

$paths = @('C:\Users\27063','C:\Users\27063\AppData\Local\Temp','D:\Temp','D:\Toolbox','C:\Windows\Temp','C:\Users\Public')
$o.Add('===== FULL SDDL (D: = DACL, S: = SACL which carries the Mandatory Label) =====')
foreach ($p in $paths) {
    $o.Add("--- $p")
    try {
        $a1 = Get-Acl -LiteralPath $p
        $o.Add("  no-audit .Sddl : $($a1.Sddl)")
    } catch { $o.Add("  no-audit ERR: $($_.Exception.Message)") }
    try {
        $a2 = Get-Acl -LiteralPath $p -Audit
        $o.Add("  -Audit   .Sddl : $($a2.Sddl)")
        $aces = @()
        foreach ($ace in $a2.Audit) { $aces += ("$($ace.AuditFlags)/$($ace.IdentityReference)/$($ace.FileSystemRights)") }
        $o.Add("  -Audit   ACES   : $(if ($aces.Count) { $aces -join ' | ' } else { '(empty)' })")
    } catch { $o.Add("  -Audit   ERR: $($_.Exception.Message)") }
}
$o.Add('')

$probe = 'D:\Temp\dsh-label-probe'
$o.Add('===== low-label probe dir =====')
if (-not (Test-Path -LiteralPath $probe)) { New-Item -ItemType Directory -Force -Path $probe | Out-Null }
$o.Add("probe path: $probe")
$o.Add((& icacls $probe | Out-String).Trim())
$o.Add("--- setintegritylevel (OI)(CI)Low ---")
$o.Add((& icacls $probe /setintegritylevel '(OI)(CI)Low' 2>&1 | Out-String).Trim())
$o.Add("--- after ---")
$o.Add((& icacls $probe | Out-String).Trim())
try { $o.Add("after .Sddl : $((Get-Acl -LiteralPath $probe).Sddl)") } catch { $o.Add("after ERR $($_.Exception.Message)") }
try { $o.Add("after -Audit Sddl : $((Get-Acl -LiteralPath $probe -Audit).Sddl)") } catch { $o.Add("after audit ERR $($_.Exception.Message)") }

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Log) | Out-Null
($o -join "`r`n") | Set-Content -LiteralPath $Log -Encoding UTF8
Get-Content -LiteralPath $Log
