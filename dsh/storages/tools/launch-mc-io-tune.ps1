$ErrorActionPreference = 'Stop'
$log = 'C:\Users\27063\.dsh\logs\uac-launch.log'
function Say($m) { Add-Content -LiteralPath $log -Value ("[" + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "] " + $m) -Encoding UTF8 }
Say "requesting UAC for mc-io-tune-1.ps1 ..."
try {
  $p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList @(
    '-NoProfile','-ExecutionPolicy','Bypass','-File',
    'C:\Users\27063\.dsh\storages\tools\mc-io-tune-1.ps1','-Apply'
  )
  Say ("exit code = " + $p.ExitCode)
  exit $p.ExitCode
} catch {
  Say ("UAC FAILED: " + $_.Exception.Message)
  Write-Host ("UAC FAILED: " + $_.Exception.Message)
  exit 1
}
