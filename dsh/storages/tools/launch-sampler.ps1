param([int]$Minutes = 30, [int]$IntervalSec = 3)
$inner = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\27063\.dsh\storages\tools\mc-io-sample.ps1" -Minutes ' + $Minutes + ' -IntervalSec ' + $IntervalSec
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $inner }
"ReturnValue=$($r.ReturnValue) PID=$($r.ProcessId)"
