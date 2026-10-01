#Requires -Version 5.1
<#
  Delayed restart of the dsh web process on port 3080.

  WHY DELAYED
    The agent requesting the restart IS that process. Restarting inline would kill
    its own in-flight request mid-turn. A short delay lets the current turn finish.

  WHY DETACHED (Start-Process + UseShellExecute)
    The caller may be a bash tool whose stdout is a pipe; a child that inherits it
    keeps the pipe open so the caller hangs until timeout. launch-dsh.ps1 documents
    the same trap. Detaching also lets this script outlive its caller -- the earlier
    attempt at a delayed gateway restart silently never ran because the child was
    reaped when the calling shell exited.

  WHY A RESTART IS NEEDED AT ALL
    ~/.dsh/.agent-presets/**/*.mjs is NOT covered by patchReload: live HMR (only the
    profile patch file itself is watched). Two .mjs changes are pending:
      * tool-bootstrap.mjs    -- bypass for delegated children (empty-catalog fix)
      * subagent-language.mjs -- appends the language contract to a child's persona
    The profile patch changes (model list, subagent-language row) DO hot-reload.
#>
param(
  [int]$DelaySeconds = 30
)

$LogFile = Join-Path $env:USERPROFILE '.dsh\logs\delayed-restart-dsh.log'
function Write-Log([string]$m) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Add-Content -Path $LogFile -Encoding UTF8
}

Write-Log "delayed dsh restart requested (delay ${DelaySeconds}s)"
Start-Sleep -Seconds $DelaySeconds

try {
  $listeners = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
  if ($listeners) {
    foreach ($l in $listeners) {
      Write-Log "stopping PID $($l.OwningProcess)"
      Stop-Process -Id $l.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  } else {
    Write-Log 'nothing listening on 3080'
  }
  Start-Sleep -Seconds 2
  $launcher = Join-Path $env:USERPROFILE '.dsh\launch-dsh.ps1'
  Write-Log "invoking $launcher -Mode Open"
  & $launcher -Mode Open *>> $LogFile
  Write-Log 'launcher returned'
} catch {
  Write-Log "FAILED: $_"
}
