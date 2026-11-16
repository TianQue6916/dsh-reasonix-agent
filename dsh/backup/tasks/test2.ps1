$ErrorActionPreference = "Stop"
$D   = "C:\Users\27063\.dsh\backup\tasks"
$VBS = "C:\Users\27063\.dsh\storages\tools\run-hidden-exe.vbs"
$WSH = "C:\Windows\System32\wscript.exe"
$PY  = "C:\Users\27063\AppData\Local\Programs\Python\Python313\python.exe"

function Q([string]$s) {
  if ([string]::IsNullOrEmpty($s)) { return '""' }
  '"' + ($s -replace '"', '""') + '"'
}

# 理想内部命令行：python argvdump.py <TAG> -Command "Set-Location 'C:\Users\27063'; & 'x.exe' 1> 'a.log'"
$inner = ('"{0}\argvdump.py" <TAG> -Command "Set-Location ''C:\Users\27063''; & ''x.exe'' 1> ''a.log''"' -f $D)

# A: 直接 CreateProcess，不经 wscript
$cmdA = $inner -replace '<TAG>', 'tA'
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $PY
$psi.Arguments = $cmdA
$psi.UseShellExecute = $false
[System.Diagnostics.Process]::Start($psi).WaitForExit()

# B: 经 wscript + run-hidden-exe.vbs
$cmdB = $inner -replace '<TAG>', 'tB'
$psi2 = New-Object System.Diagnostics.ProcessStartInfo
$psi2.FileName = $WSH
$psi2.Arguments = (Q $VBS) + ' ' + (Q $cmdB)
$psi2.UseShellExecute = $false
[System.Diagnostics.Process]::Start($psi2).WaitForExit()

"### A inner cmdline (straight to python):"
$cmdA
"### A argv:"
if (Test-Path "$D\argv-tA.json") { Get-Content "$D\argv-tA.json" -Raw } else { "MISSING" }
""
"### B wscript cmdline:"
$psi2.Arguments
"### B argv:"
if (Test-Path "$D\argv-tB.json") { Get-Content "$D\argv-tB.json" -Raw } else { "MISSING" }
