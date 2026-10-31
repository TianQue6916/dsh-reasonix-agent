<#
  pin-pcore.ps1 —— 把一条命令**及其所有子孙进程**绑到 P-core（默认 0-15）。

  为什么需要：
    本机 i9-14900HX = 8 P-core（超线程 → 16 逻辑线程）+ 16 E-core。
    实测（2026-10-29）8 路并行、默认调度 1150ms，绑 P-core 后 878ms ⇒ **省 24%**。
    Windows 的 Thread Director 会在 8 路时就把一部分线程丢进 E-core（单线程慢 2.8 倍）。

  为什么不绑「所有 node」：
    dsh 自己是 Electron（多个 node/utility 进程），全绑会把 P-core 挤爆。
    本脚本只绑**从本命令派生的进程树**，用 parent 链判断，不碰 dsh。

  用法：
    .\pin-pcore.ps1 pnpm install
    .\pin-pcore.ps1 npx vitest run
    .\pin-pcore.ps1 npm run build

  退出码 = 子命令的退出码。
#>
param(
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Cmd
)
$ErrorActionPreference = 'Continue'
if (-not $Cmd -or $Cmd.Count -eq 0) { Write-Error 'usage: pin-pcore.ps1 <command> [args...]'; exit 2 }

$PCORE_MASK = [int64]0x0000FFFF        # 0-15 = 8 P-core × 超线程
$bound = @{}
$rootPid = $null

function Get-TreePids([int]$root) {
  $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
  $byParent = @{}
  foreach ($p in $all) {
    if (-not $byParent.ContainsKey($p.ParentProcessId)) { $byParent[$p.ParentProcessId] = @() }
    $byParent[$p.ParentProcessId] += $p.ProcessId
  }
  $out = New-Object System.Collections.Generic.List[int]
  $stack = New-Object System.Collections.Generic.Stack[int]
  $stack.Push($root)
  while ($stack.Count -gt 0) {
    $cur = $stack.Pop()
    if ($out.Contains($cur)) { continue }
    $out.Add($cur)
    if ($byParent.ContainsKey($cur)) { foreach ($c in $byParent[$cur]) { $stack.Push($c) } }
  }
  return $out
}

$exe = $Cmd[0]
$argList = if ($Cmd.Count -gt 1) { $Cmd[1..($Cmd.Count - 1)] } else { @() }
$p = Start-Process -FilePath $exe -ArgumentList $argList -PassThru -NoNewWindow
$rootPid = $p.Id
try { $p.ProcessorAffinity = [IntPtr]$PCORE_MASK; $bound[$p.Id] = 1 } catch { }
Write-Host "[pin-pcore] started pid=$rootPid  mask=0x$('{0:X}' -f $PCORE_MASK)  (P-core 0-15)"

while ($true) {
  try {
    foreach ($childPid in (Get-TreePids $rootPid)) {
      if ($bound.ContainsKey($childPid)) { continue }
      $proc = Get-Process -Id $childPid -ErrorAction SilentlyContinue
      if ($null -eq $proc) { continue }
      try { $proc.ProcessorAffinity = [IntPtr]$PCORE_MASK; $bound[$childPid] = 1 } catch { }
    }
  } catch { }
  if ($p.HasExited) { break }
  Start-Sleep -Milliseconds 250
}

Write-Host "[pin-pcore] bound $($bound.Count) process(es); exit=$($p.ExitCode)"
exit $p.ExitCode
