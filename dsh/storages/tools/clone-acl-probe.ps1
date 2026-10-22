# clone-acl-probe.ps1 -- create D:\Temp\dsh-acl-clone and give it EXACTLY the
# trustees that make C:\Users\27063\AppData\Local\Temp writable for the low shell.
param([switch]$NoElevate)
function Test-Admin {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
$Log = Join-Path $env:USERPROFILE '.dsh\logs\clone-acl-probe.txt'
if (-not (Test-Admin) -and -not $NoElevate) {
    Write-Host '[*] requesting UAC elevation...'
    Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-NoElevate') -Verb RunAs -Wait
    Get-Content -LiteralPath $Log -ErrorAction SilentlyContinue
    return
}
$o = New-Object System.Collections.Generic.List[string]
$o.Add("# clone-acl-probe  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  elevated=$((Test-Admin))")
$p = 'D:\Temp\dsh-acl-clone'
if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null }
$o.Add("--- BEFORE ---"); $o.Add((& icacls $p | Out-String).Trim())
# trustees observed on C:\Users\27063\AppData\Local\Temp
$u = 'S-1-5-21-973867694-3511247202-1671030120-1001'   # 天阙九泉\27063
$l = 'S-1-4-1049387402-452331294'                       # the S-1-4-* ACE the ACL-sandbox grant left behind
& icacls $p /grant ("*{0}:(OI)(CI)(F)" -f $u) ("*{0}:(OI)(CI)(M)" -f $l) /c 2>&1 | Out-String | ForEach-Object { $o.Add($_.Trim()) }
$o.Add("--- AFTER ---"); $o.Add((& icacls $p | Out-String).Trim())
try { $o.Add("AFTER .Sddl : $((Get-Acl -LiteralPath $p).Sddl)") } catch { $o.Add("ERR $($_.Exception.Message)") }
# also drop a same-shape clone with Everyone for completeness
$p2 = 'D:\Temp\dsh-everyone-probe'
if (-not (Test-Path -LiteralPath $p2)) { New-Item -ItemType Directory -Force -Path $p2 | Out-Null }
& icacls $p2 /grant '*S-1-1-0:(OI)(CI)(F)' /c 2>&1 | Out-Null
$o.Add("--- $p2 ---"); $o.Add((& icacls $p2 | Out-String).Trim())
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Log) | Out-Null
($o -join "`r`n") | Set-Content -LiteralPath $Log -Encoding UTF8
Get-Content -LiteralPath $Log
