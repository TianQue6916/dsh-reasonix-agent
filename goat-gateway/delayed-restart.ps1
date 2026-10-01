#Requires -Version 5.1
# One-shot delayed restart of goat-gateway.
#
# Why delayed: the agent that requests the restart is itself talking to the LLM
# THROUGH this gateway. Restarting immediately kills its own in-flight request.
# Why Start-Process with UseShellExecute: the caller may be a bash tool whose
# stdout is a pipe; a child that inherits it keeps the pipe open, so the caller
# hangs until timeout (documented in ~/.dsh/launch-dsh.ps1). Detaching also
# means the child survives the caller's exit -- which is exactly what the
# earlier attempt got wrong.
param(
  [int]$DelaySeconds = 45
)
$log = Join-Path $PSScriptRoot 'logs\delayed-restart.log'
function W([string]$m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Add-Content -Path $log -Encoding UTF8 }
W "delayed restart requested, sleeping ${DelaySeconds}s"
Start-Sleep -Seconds $DelaySeconds
W "invoking restart-gateway.ps1"
try {
  & (Join-Path $PSScriptRoot 'restart-gateway.ps1') *>> $log
  W "restart-gateway.ps1 returned"
} catch {
  W "FAILED: $_"
}
