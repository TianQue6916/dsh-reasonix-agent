<#
  restart-gateway.ps1 — 安全重启 goat-gateway（让 gateway.mjs 的改动生效）

  为什么需要它：config.json / keys.json 有 mtime 热重载，但 gateway.mjs 的**代码**改动
  必须重启进程。dsh 自己的模型调用就走 127.0.0.1:8788，重启会打断正在进行的流，
  所以调用方应当在「没有活跃请求」的窗口里执行本脚本。

  2026-11-11 重写定位逻辑：原实现用
      Get-NetTCPConnection -LocalPort 8788 -State Listen
  在本机恒返回空 —— IPv4 监听 socket 的 State 字段为 null（netstat 里干脆没有
  LISTENING 行），于是脚本误判「端口没人占」，直接 schtasks 拉第二个实例、
  端口冲突、20s 后判 FAIL，而旧进程仍在跑旧代码。
  实测三种查法：-State Listen → 0 条；无 -State → 1 条（State 空、RemotePort=0）；
  netstat 匹配 LISTENING → 0 行。

  现在改成三级判据，任一命中即可：
    1) 进程命令行：node.exe 且 CommandLine 含 goat-gateway\gateway.mjs（最可靠，不看端口）
    2) 端口 socket：LocalPort=8788 且 RemotePort=0（State 不可信，用 RemotePort 判监听）
    3) 兜底：netstat 里出现 ":8788" 且状态为 LISTENING

  日志：本目录 logs/restart-gateway.log
#>
param([switch]$WhatIf)   # 只检测、不动手；用来验证三个探针能不能找对 PID

$ErrorActionPreference = 'Continue'
$Port   = 8788
$LogDir = Join-Path $PSScriptRoot 'logs'
$Log    = Join-Path $LogDir 'restart-gateway.log'
$null = New-Item -ItemType Directory -Force -Path $LogDir

function W([string]$m) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  Add-Content -Path $Log -Value $line -Encoding UTF8
  Write-Host $line
}

function Get-GatewayPids {
  param([switch]$ShowProbes)
  $byProc = @(); $bySock = @(); $byNet = @()

  # 探针 1：进程命令行。注意 —— 计划任务以 High IL 起的 node，从 Low IL 的 pwsh 看
  # CommandLine 是 null（WMI 跨完整性级别不返回），所以这一路**可能恒为空**，
  # 不能当成唯一判据。2026-11-11 实测：gateway 由 schtasks 拉起，此处读不到。
  try {
    $byProc = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop |
      Where-Object { $_.CommandLine -and ($_.CommandLine -match 'goat-gateway[\/]+gateway\.mjs') } |
      ForEach-Object { [int]$_.ProcessId }
  } catch { }

  # 探针 2（主力）：端口 socket。State 字段在本机对 IPv4 监听 socket 返回空串，
  # 所以用 RemotePort -eq 0 判「监听中」，不要用 -State Listen。
  try {
    $bySock = Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop |
      Where-Object { $_.RemotePort -eq 0 -and $_.OwningProcess -gt 0 } |
      ForEach-Object { [int]$_.OwningProcess }
  } catch { }

  # 探针 3：netstat 兜底（同一台机器上 netstat 与 CIM 的可见性不完全一致）。
  try {
    $m = netstat -ano | Select-String -Pattern ":$Port\s+\S+\s+LISTENING\s+(\d+)"
    if ($m) { $byNet = @($m | ForEach-Object { [int]$_.Matches[0].Groups[1].Value }) }
  } catch { }

  if ($ShowProbes) {
    W ("probes: cmdline=[{0}] socket=[{1}] netstat=[{2}]" -f `
      ($byProc -join ','), ($bySock -join ','), ($byNet -join ','))
  }
  @($byProc) + @($bySock) + @($byNet) | Where-Object { $_ -gt 0 } | Sort-Object -Unique
}

function Test-PortOpen([int]$p) {
  try {
    $c = New-Object Net.Sockets.TcpClient
    $t = $c.ConnectAsync('127.0.0.1', $p)
    if ($t.Wait(1000) -and $c.Connected) { $c.Close(); return $true }
    $c.Close()
  } catch { }
  return $false
}

$targets = @(Get-GatewayPids -ShowProbes)
W ("restart requested; gateway PIDs = {0}" -f ($(if ($targets.Count) { $targets -join ',' } else { '(none)' })))

if ($WhatIf) { W "WhatIf: 检测完成，不做任何改动"; exit 0 }

if ($targets.Count -eq 0) {
  $null = Get-GatewayPids -ShowProbes
  if (Test-PortOpen $Port) {
    # 端口有响应但三个探针都没找到进程 —— 盲启只会撞端口冲突，宁可不做。
    W "FAIL: 端口 $Port 可连通但找不到宿主进程（可能是别的用户/更高 IL 起的），拒绝启动第二个实例"
    exit 1
  }
  W "no gateway process found (3 probes empty) and port $Port closed; starting a fresh one"
} else {
  foreach ($t in $targets) {
    try {
      Stop-Process -Id $t -Force -ErrorAction Stop
      W "stopped PID $t"
    } catch { W ("WARN: 停止 PID $t 失败: " + $_.Exception.Message) }
  }
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 300
    $left = @(Get-GatewayPids)
    if ($left.Count -eq 0) { break }
  }
  $left = @(Get-GatewayPids)
  if ($left.Count) { W ("FAIL: 仍有 gateway 进程存活: " + ($left -join ',')); exit 1 }
  W "all gateway processes stopped"
}

$null = & schtasks /Run /TN 'Goat-Gateway' 2>&1
$new = @()
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  $new = @(Get-GatewayPids)
  if ($new.Count -and -not ($new | Where-Object { $targets -contains $_ })) { break }
}
$new = @(Get-GatewayPids)
if ($new.Count -eq 0) {
  W 'FAIL: gateway did not come back within 20s (检查 Goat-Gateway-Watchdog 会不会兜底)'
  exit 1
}
W ("OK: gateway back up, new PID {0}" -f ($new -join ','))
exit 0
