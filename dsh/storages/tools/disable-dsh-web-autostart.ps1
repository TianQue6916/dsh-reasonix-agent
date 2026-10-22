#Requires -Version 5.1
<#
  disable-dsh-web-autostart.ps1  —  2026-10-06
  WHY: Task Scheduler 任务 \dsh-web-3080 带 LogonTrigger(Delay=PT20S)，
       每次登入都会跑 launch-dsh.ps1 -Mode Serve → 弹出用户看到的那个命令行窗口。
       用户已改用桌面版 dsh（不依赖 3080），且 desktop/web 共用同一份 session 文件
       （无跨进程锁）⇒ 同时跑会互相踩。故禁用该任务的登录触发。
  HOW: 只 disable（可逆），不 delete。重新启用：
       Enable-ScheduledTask -TaskName 'dsh-web-3080'   或提权跑 schtasks /change /tn dsh-web-3080 /enable
  NOTE: 本机 schtasks / Get-ScheduledTask 在非提权下均报
        "The system cannot find the path specified." / HRESULT 0x80070003，
        所以本脚本必须提权运行（Start-Process -Verb RunAs）。
#>
$log = Join-Path $env:USERPROFILE ".dsh\logs\disable-dsh-web-autostart.log"
$null = New-Item -ItemType Directory -Force -Path (Split-Path $log)
function W($m) { $m | Out-File -FilePath $log -Append -Encoding UTF8 }

W "=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') admin=$([bool](New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) ==="

$name = 'dsh-web-3080'
$before = $null
try {
  $before = Get-ScheduledTask -TaskName $name -ErrorAction Stop
  W "before: found state=$($before.State)  triggers=$($before.Triggers.Count)"
} catch { W "before: Get-ScheduledTask FAILED -> $($_.Exception.Message)" }

$ok = $false
try {
  Disable-ScheduledTask -TaskName $name -ErrorAction Stop | Out-Null
  W "disable via CIM: OK"; $ok = $true
} catch {
  W "disable via CIM FAILED -> $($_.Exception.Message)"
  $out = & schtasks.exe /change /tn $name /disable 2>&1
  W "disable via schtasks rc=$LASTEXITCODE out=$out"
  if ($LASTEXITCODE -eq 0) { $ok = $true }
}

if ($ok) {
  try {
    $after = Get-ScheduledTask -TaskName $name -ErrorAction Stop
    W "after: state=$($after.State)  (Disabled = 成功)"
  } catch { W "after: requery FAILED -> $($_.Exception.Message)" }
  # 复核 XML 里的 Enabled 标志
  try {
    $xmlPath = Join-Path $env:windir "System32\Tasks\$name"
    $x = [xml](Get-Content -LiteralPath $xmlPath -Raw -Encoding Unicode)
    W "xml Trigger Enabled = $($x.Task.Triggers.LogonTrigger.Enabled)   Delay = $($x.Task.Triggers.LogonTrigger.Delay)"
    W "xml Exec = $($x.Task.Actions.Exec.Command) $($x.Task.Actions.Exec.Arguments)"
  } catch { W "xml read FAILED -> $($_.Exception.Message)" }
}
W "RESULT: ok=$ok"
