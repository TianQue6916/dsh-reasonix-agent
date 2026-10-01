# GOAT quota hook for Reasonix -- prints a one-line quota summary to stdout, which the
# harness injects into the session context (hooks.SessionStart / hooks.UserPromptSubmit).
$ErrorActionPreference = 'SilentlyContinue'
$logFile = 'D:\Toolbox\goat-gateway\logs\hook.log'
try {
  New-Item -ItemType Directory -Force -Path (Split-Path $logFile) | Out-Null
  [IO.File]::AppendAllText($logFile, ((Get-Date -Format 'HH:mm:ss') + ' hooked' + "`r`n"))
} catch {}
$summary = & 'D:\Toolbox\goat-gateway\goat-usage.ps1' -Brief -CacheSeconds 300 2>$null
if ($summary) { '[GOAT quota] ' + ($summary -join '   ') } else { '[GOAT quota] unavailable' }
