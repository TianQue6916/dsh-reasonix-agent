# probe-labels.ps1 -- read Mandatory Label (SACL) for key paths. Needs elevation.
param([switch]$NoElevate)
function Test-Admin {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
$Log = Join-Path $env:USERPROFILE '.dsh\logs\mandatory-labels.txt'
if (-not (Test-Admin) -and -not $NoElevate) {
    Write-Host '[*] requesting UAC elevation...'
    try {
        Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-NoElevate') -Verb RunAs -Wait
        "log => $Log"
    } catch { Write-Host "[!] $($_.Exception.Message)" }
    return
}

$paths = @(
  'C:\Users\27063',
  'C:\Users\27063\Desktop',
  'C:\Users\27063\.dsh',
  'C:\Users\27063\AppData\Local\Temp',
  'C:\Users\27063\AppData\Local\Programs',
  'C:\Users\27063\AppData\Local\Programs\DeepSeek Harness',
  'C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe',
  'C:\Users\27063\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js',
  'C:\Program Files\nodejs\node.exe',
  'C:\Windows\System32\notepad.exe',
  'D:\',
  'D:\Temp',
  'D:\Toolbox',
  'C:\Windows\Temp',
  'C:\Users\Public'
)

$out = New-Object System.Collections.Generic.List[string]
$out.Add("# mandatory-labels  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  elevated=$((Test-Admin))")
$out.Add("# 'S:' segment of the SDDL carries the Mandatory Label; ME=Medium  LW=Low  HI=High  SI=System")
$out.Add('')
foreach ($p in $paths) {
    if (-not (Test-Path -LiteralPath $p)) { $out.Add(("{0}`n    MISSING" -f $p)); continue }
    try {
        $acl = Get-Acl -LiteralPath $p -Audit -ErrorAction Stop
        $sddl = $acl.Sddl
        $sseg = '(none)'
        if ($sddl -match '(S:[^D]*)') { $sseg = $Matches[1] }
        # also pull the explicit label text
        $lbl = ($acl.Audit | Where-Object { $_.IdentityReference -like '*Mandatory*' } | ForEach-Object { "$($_.IdentityReference) / $($_.AuditFlags) / $($_.FileSystemRights)" }) -join ' ; '
        $out.Add(("{0}`n    S: {1}`n    label: {2}" -f $p, $sseg, $(if ($lbl) { $lbl } else { '(no mandatory ACE)' })))
    } catch {
        $out.Add(("{0}`n    ERR {1}" -f $p, $_.Exception.Message))
    }
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Log) | Out-Null
($out -join "`r`n") | Set-Content -LiteralPath $Log -Encoding UTF8
"log => $Log ($((Get-Item $Log).Length) bytes)"
