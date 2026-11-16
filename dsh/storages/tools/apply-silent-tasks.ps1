# apply-silent-tasks.ps1
# 把「console exe 直连 Task Scheduler」的计划任务改走 run-hidden.exe（自写 GUI-subsystem 宿主）。
# 只改 Action 的 Execute，触发器 / Principal / Settings 全部不动。
# 备份在 C:\Users\27063\.dsh\backup\tasks\<任务名>.xml，回滚：
#   Register-ScheduledTask -Xml (Get-Content '<备份>.xml' -Raw) -TaskName '<任务名>' -Force
#
# 注意 Arguments 不做任何引号包装：Task Scheduler 会把 Arguments 原样拼在 exe 路径之后，
# CRT 给 run-hidden.exe 的 lpCmdLine 恰好就是子进程需要的完整命令行。
param([switch]$WhatIf)

$ErrorActionPreference = "Stop"

$RUN = "C:\Users\27063\.dsh\storages\tools\run-hidden.exe"
$PS5 = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
$CMD = "C:\Windows\System32\cmd.exe"
$PY  = "C:\Users\27063\AppData\Local\Programs\Python\Python313\python.exe"
$PW7 = "C:\Program Files\PowerShell\7\pwsh.exe"
$LOG = "C:\Users\27063\.dsh\backup\tasks\apply-log.txt"

# 只用来保护「exe 路径含空格」这一种情况；args 部分原样透传，不转义
function Q([string]$s) {
  if ($s -match '\s') { return '"' + $s + '"' }
  return $s
}

$map = @(
  @{ N = "dsh-bili-io";          E = $PW7 },
  @{ N = "dsh-bili-backup";      E = $PY },
  @{ N = "temp_http_8000";       E = $PY },
  @{ N = "ocr_p003";             E = $PY },
  @{ N = "ocr_p002";             E = $PS5 },
  @{ N = "exe_uninstall";        E = $PS5 },
  @{ N = "git_push";             E = $PS5 },
  @{ N = "GitHub-Mirror-Agent";  E = $PS5 },
  @{ N = "GitHub-Mirror-Probe";  E = $PS5 },
  @{ N = "dsh-SmartSnapshot";    E = $PS5 },
  @{ N = "DshHostWatchdog";      E = $PS5 },
  @{ N = "cleanup_gui";          E = $PS5 },
  @{ N = "ReasonixGitHubBackup"; E = $PS5 },
  @{ N = "LeanToolchainInstall"; E = "C:\Users\27063\.elan\bin\elan.exe" },
  @{ N = "pvz-lab-ilfix";        E = $CMD },
  @{ N = "pvz-lab-probe";        E = $CMD },
  @{ N = "pvz-probe";            E = $CMD; A = '/c "C:\Users\27063\pvz_lab\probe.bat"' }
)

$out = New-Object System.Collections.Generic.List[string]
$out.Add("# apply-silent-tasks  $(Get-Date -Format s)  WhatIf=$WhatIf")
$ok = 0; $skip = 0; $fail = 0

foreach ($j in $map) {
  $n = $j.N
  try { $t = Get-ScheduledTask -TaskPath "\" -TaskName $n -ErrorAction Stop }
  catch { $out.Add("MISSING  $n"); $fail++; continue }

  $a = $t.Actions[0]
  if ($a.Execute -eq $RUN) { $out.Add("SKIP     $n  (已经是 run-hidden.exe 宿主)"); $skip++; continue }

  $origArgs = if ($j.ContainsKey('A')) { $j.A } else { [string]$a.Arguments }
  $newArgs = (Q $j.E)
  if (-not [string]::IsNullOrEmpty($origArgs)) { $newArgs = $newArgs + ' ' + $origArgs }
  $wd = [string]$a.WorkingDirectory

  $out.Add("PATCH    $n")
  $out.Add("   old: [$($a.Execute)] [$($a.Arguments)]")
  $out.Add("   new: [$RUN] [$newArgs]")

  if ($WhatIf) { $ok++; continue }

  try {
    if ([string]::IsNullOrEmpty($wd)) {
      $na = New-ScheduledTaskAction -Execute $RUN -Argument $newArgs
    } else {
      $na = New-ScheduledTaskAction -Execute $RUN -Argument $newArgs -WorkingDirectory $wd
    }
    Set-ScheduledTask -TaskPath "\" -TaskName $n -Action $na | Out-Null
    $out.Add("   OK")
    $ok++
  } catch {
    $out.Add("   FAIL: $($_.Exception.Message)")
    $fail++
  }
}

$out.Add("")
$out.Add("# 结果：ok=$ok skip=$skip fail=$fail")

New-Item -ItemType Directory -Force -Path (Split-Path $LOG) | Out-Null
$out | Set-Content -Path $LOG -Encoding utf8
$out | ForEach-Object { $_ }
