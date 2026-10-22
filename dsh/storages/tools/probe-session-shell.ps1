$ErrorActionPreference = 'Continue'
function H($t) { ''; "=== $t ===" }

H 'OS / build'
$cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
"{0} | build {1}.{2} | {3} | {4}" -f $cv.ProductName, $cv.CurrentBuild, $cv.UBR, $cv.DisplayVersion, $cv.EditionID

H 'Winlogon Shell / Userinit'
$wl = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
"Shell    = $($wl.Shell)"
"Userinit = $($wl.Userinit)"
"AutoAdminLogon = $($wl.AutoAdminLogon)"

H 'UAC policy (HKLM ...\Policies\System)'
$ps = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
$ps.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | Sort-Object Name | ForEach-Object { "{0,-34} = {1}" -f $_.Name, $_.Value }

H 'HKCU ...\Policies\System'
$cu = Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -ErrorAction SilentlyContinue
if ($cu) { $cu.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { "{0,-34} = {1}" -f $_.Name, $_.Value } } else { '(absent)' }

H 'current user identity'
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
"Name       = $($id.Name)"
"AuthType   = $($id.AuthenticationType)"
"ImpersonationLevel = $($id.ImpersonationLevel)"
"IsSystem   = $($id.IsSystem)"
"Token      = $($id.Token)"
"Groups:"
$id.Groups | ForEach-Object {
  $n = '<unresolved>'
  try { $n = $_.Translate([Security.Principal.NTAccount]).Value } catch {}
  "  {0,-46} {1}" -f $_.Value, $n
}

H 'local Administrators membership'
try { Get-LocalGroupMember -Group 'Administrators' -ErrorAction Stop | ForEach-Object { "  $($_.Name)  [$($_.ObjectClass)]" } } catch { "ERR: $($_.Exception.Message)" }

H 'security / EDR-ish services (running)'
$pat = 'vpn|sangfor|atrust|huorong|hrs|qianxin|360|kaspersky|eset|symantec|mcafee|sophos|crowdstrike|sentinel|defender|winDefend|WdNis|MBAM|ZhuDongFangYu|SafeDog|Tencent|AliSec|edr|ngav|cis|Npcap|EasyAntiCheat|vmware|virtualbox|vbox'
try {
  Get-Service | Where-Object { $_.Name -match $pat -or $_.DisplayName -match $pat } |
    Select-Object Status, Name, DisplayName | Format-Table -AutoSize | Out-String
} catch { "ERR: $($_.Exception.Message)" }

H 'process tree (CIM)'
try {
  Get-CimInstance Win32_Process | Sort-Object ProcessId |
    ForEach-Object { "{0,6} <- {1,6}  {2}" -f $_.ProcessId, $_.ParentProcessId, $_.Name }
    } catch { "ERR: $($_.Exception.Message)" }

H 'session info'
try { & "$env:SystemRoot\System32\query.exe" session 2>&1 | Out-String } catch { "query ERR: $($_.Exception.Message)" }
try { (& "$env:SystemRoot\System32\whoami.exe" /groups 2>&1) | Select-String -Pattern 'Mandatory|Label' | Out-String } catch { "whoami ERR: $($_.Exception.Message)" }
