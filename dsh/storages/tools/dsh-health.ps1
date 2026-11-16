# dsh-health.ps1 — 判断 dsh host 进程有没有踩到「fs.watch 死句柄」
# 用法: pwsh -NoProfile -File ~/.dsh/storages/tools/dsh-health.ps1
$ErrorActionPreference='SilentlyContinue'
$hp = (Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*dsh-desktop-host*" } | Select-Object -First 1).ProcessId
if (-not $hp) { "找不到 dsh-desktop-host 进程（dsh 没开？）"; exit 1 }
$p = Get-Process -Id $hp
$a = Get-CimInstance Win32_PerfRawData_PerfProc_Process | Where-Object { $_.IDProcess -eq $hp }
$c0 = $p.CPU
$n = 10
Start-Sleep -Seconds $n
$p2 = Get-Process -Id $hp
$b = Get-CimInstance Win32_PerfRawData_PerfProc_Process | Where-Object { $_.IDProcess -eq $hp }
$cpu = ($p2.CPU-$c0)/$n*100
$ops = ($b.IOOtherOperationsPersec-$a.IOOtherOperationsPersec)/$n
$run = ((Get-Date)-$p2.StartTime).TotalSeconds
"host PID {0}  运行 {1:N0} 分钟  句柄 {2}" -f $hp, ($run/60), $p2.HandleCount
"CPU      : {0,6:N1} % of one core   (lifetime 平均 {1:N1}%)" -f $cpu, ($p2.CPU/$run*100)
"IOOther  : {0,6:N0} ops/s" -f $ops
""
if ($ops -gt 15000) {
  "  ✗ 踩坑了：IOOther 量级 10^4 且远超正常 —— 是 fs.watch 死句柄（见 discussions/9181）"
  "    处置：重启 dsh"
} elseif ($ops -gt 8000) {
  "  ! 偏高，可能刚开始坏。再观察；持续上涨就重启"
} else {
  "  ✓ 正常范围（健康值几次实测：4.8k / 空闲 ~0）"
}
