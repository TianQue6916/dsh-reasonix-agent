# fix-d-temp-acl.ps1 -- grant Everyone Modify on D:\Temp so dsh's restricted-token
# sandbox (whose restricting SID list keeps EVERYONE + logon SID) can write there.
# Backs the current ACL up first; prints before/after.
param([switch]$NoElevate, [string]$Target = 'D:\Temp', [switch]$Rollback)
function Test-Admin {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
$LogDir  = Join-Path $env:USERPROFILE '.dsh\logs'
$Backup  = Join-Path $LogDir 'D-Temp-acl-backup.txt'
$Report  = Join-Path $LogDir 'fix-d-temp-acl.log'
if (-not (Test-Admin) -and -not $NoElevate) {
    Write-Host '[*] requesting UAC elevation...'
    $extra = @()
    if ($Rollback) { $extra += '-Rollback' }
    if ($Target -ne 'D:\Temp') { $extra += @('-Target', ('"'+$Target+'"')) }
    Start-Process powershell.exe -ArgumentList (@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-NoElevate') + $extra) -Verb RunAs -Wait
    Get-Content -LiteralPath $Report -ErrorAction SilentlyContinue
    return
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$o = New-Object System.Collections.Generic.List[string]
$o.Add("# fix-d-temp-acl  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  elevated=$((Test-Admin))  target=$Target  rollback=$Rollback")

if (-not (Test-Path -LiteralPath $Target)) { $o.Add("MISSING $Target"); ($o -join "`r`n") | Set-Content -LiteralPath $Report -Encoding UTF8; return }

if (-not $Rollback) {
    & icacls $Target /save $Backup /c | Out-Null
    $o.Add("backup => $Backup ($((Get-Item $Backup -ErrorAction SilentlyContinue).Length) bytes)")
    $o.Add('--- BEFORE ---')
    $o.Add((& icacls $Target | Out-String).Trim())
    # *S-1-1-0 = Everyone. Keep existing ACEs (plain /grant appends).
    $out = & icacls $Target /grant '*S-1-1-0:(M)' /c 2>&1 | Out-String
    $o.Add('--- GRANT (Everyone:(M)) ---')
    $o.Add($out.Trim())
} else {
    $o.Add('--- ROLLBACK: revoke Everyone as far as icacls can express it ---')
    $o.Add((& icacls $Target /remove:g '*S-1-1-0' /c 2>&1 | Out-String).Trim())
}
$o.Add('--- AFTER ---')
$o.Add((& icacls $Target | Out-String).Trim())
$o.Add('--- AFTER SDDL ---')
try { $o.Add((Get-Acl -LiteralPath $Target).Sddl) } catch { $o.Add("ERR $($_.Exception.Message)") }

($o -join "`r`n") | Set-Content -LiteralPath $Report -Encoding UTF8
Get-Content -LiteralPath $Report
