# probe-write-elevated.ps1
# Decisive test: can an ELEVATED (High IL) process write to D:\Temp ?
#   - If YES  -> the non-elevated EPERM is integrity-level no-write-up (Low IL subject)
#   - If NO   -> something file-system/driver/volume level blocks it (vol read-only, filter driver)
# Also dumps volume-level facts about D: (fsutil volumeinfo, mountvol /L, Win32_LogicalDisk, Win32_Volume).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File probe-write-elevated.ps1
param([switch]$NoElevate)

$ErrorActionPreference = 'Continue'
$Log = Join-Path $env:USERPROFILE '.dsh\logs\probe-write-elevated.log'

function Test-Admin {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin) -and -not $NoElevate) {
    Write-Host '[*] not elevated -> requesting UAC elevation (please approve)'
    try {
        Start-Process -FilePath 'powershell.exe' -ArgumentList @(
            '-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"'),'-NoElevate'
        ) -Verb RunAs -Wait
        if (Test-Path $Log) { Get-Content $Log }
    } catch { Write-Host "[!] elevation failed: $($_.Exception.Message)" }
    return
}

$out = New-Object System.Collections.Generic.List[string]
$out.Add("# probe-write-elevated  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$out.Add("elevated = $(Test-Admin)   user = $env:USERNAME   pid = $PID")

# --- integrity level of THIS (elevated) process, read from its own token groups ---
try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $ml = @($id.Groups | Where-Object { $_.Value -like 'S-1-16-*' })
    if ($ml.Count -eq 0) { $out.Add('self IL: (no S-1-16-* group found)') }
    else { foreach ($g in $ml) { $out.Add("self IL: $($g.Value)") } }
} catch { $out.Add("self IL ERR: $($_.Exception.Message)") }

# --- write matrix, run AS ELEVATED ---
$out.Add('')
$out.Add('=== write probes (elevated / High IL) ===')
$targets = @('D:\Temp','D:\','D:\Toolbox','C:\Windows\Temp','C:\Users\Public','C:\Users\27063\.dsh','C:\Users\27063')
foreach ($t in $targets) {
    $f = Join-Path $t ("elev-write-probe-$PID.txt")
    try {
        Set-Content -LiteralPath $f -Value 'probe' -ErrorAction Stop
        $out.Add("WRITE OK   : $t")
        Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
    } catch {
        $out.Add("WRITE FAIL : $t  -> $($_.Exception.GetType().Name): $($_.Exception.Message)")
    }
}

# --- volume facts about D: ---
foreach ($cmd in @(@('fsutil','fsinfo','volumeinfo','D:'), @('fsutil','fsinfo','ntfsinfo','D:'), @('mountvol','D:','/L'))) {
    $out.Add('')
    $out.Add("=== $($cmd -join ' ') ===")
    try { $out.Add(((& $cmd[0] $cmd[1..($cmd.Count-1)] 2>&1) | Out-String).Trim()) }
    catch { $out.Add("ERR: $($_.Exception.Message)") }
}

$out.Add('')
$out.Add('=== Win32_LogicalDisk (D:) ===')
try { $out.Add(((Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='D:'") | Format-List * | Out-String).Trim()) } catch { $out.Add("ERR: $($_.Exception.Message)") }

$out.Add('')
$out.Add('=== Win32_Volume (DriveLetter D:) ===')
try { $out.Add(((Get-CimInstance Win32_Volume -Filter "DriveLetter='D:'") | Format-List * | Out-String).Trim()) } catch { $out.Add("ERR: $($_.Exception.Message)") }

$out.Add('')
$out.Add('=== Get-Volume / Get-Partition ===')
try { $out.Add(((Get-Volume -DriveLetter D) | Format-List * | Out-String).Trim()) } catch { $out.Add("Get-Volume ERR: $($_.Exception.Message)") }
try { $out.Add(((Get-Partition -DriveLetter D) | Format-List * | Out-String).Trim()) } catch { $out.Add("Get-Partition ERR: $($_.Exception.Message)") }

# --- filter drivers attached to D: ---
$out.Add('')
$out.Add('=== fltmc / filter drivers ===')
try { $out.Add(((& fltmc 2>&1) | Out-String).Trim()) } catch { $out.Add("fltmc ERR: $($_.Exception.Message)") }

$text = ($out -join "`r`n")
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Log) | Out-Null
$text | Set-Content -LiteralPath $Log -Encoding UTF8
Write-Host $text
