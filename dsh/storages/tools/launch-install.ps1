$log = 'C:\Users\27063\.dsh\logs\uac-launch.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
try {
    $p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList @(
        '-NoProfile','-ExecutionPolicy','Bypass',
        '-File','C:\Users\27063\.dsh\storages\tools\install-smart-snapshot-v2.ps1'
    )
    "LAUNCH OK exit=$($p.ExitCode)" | Set-Content -LiteralPath $log -Encoding UTF8
} catch {
    "LAUNCH FAILED: $($_.Exception.Message)" | Set-Content -LiteralPath $log -Encoding UTF8
}
