$ErrorActionPreference = 'SilentlyContinue'
$log = 'C:\Users\27063\AppData\Roaming\reasonix\bot_leader.log'
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
# 2026-09-20 改名隔离：npm 包内原生 CLI 的文件名是 reasonix.exe，与桌面版 launcher(Reasonix.exe) 撞名，
# 会让 launcher 在确认 Session 0 候选进程归属时 access denied 而拒绝启动（表现为点图标毫无反应）。
# 改用改名副本 reasonix-bot.exe，进程名不再撞车。
$cliSrcExe = 'C:\Users\27063\AppData\Roaming\npm\node_modules\@reasonix\cli-win32-x64\bin\reasonix.exe'
$botExe = 'C:\Users\27063\AppData\Roaming\reasonix-bot\bin\reasonix-bot.exe'
$workdir = 'C:\Users\27063\AppData\Roaming\reasonix\global-workspace'
# 独立 bot home：与桌面版(读 AppData\Roaming\reasonix)隔离，避免双 gateway
$botHome = 'C:\Users\27063\AppData\Roaming\reasonix-bot'

# 1) Linux 主节点是否可达（局域网 + Tailscale 任一即可）
$linuxAlive = $false
foreach ($ip in @('192.168.1.13','100.79.96.82')) {
  if (Test-Connection -ComputerName $ip -Count 1 -Quiet -ErrorAction SilentlyContinue) { $linuxAlive = $true; break }
}

# 2) 本地是否已有 reasonix bot gateway 进程
# 按镜像名检测改名副本（Session 0 进程读不到 CommandLine，不能再用命令行匹配）；
# 同时兼容过渡期仍以 reasonix.js 形态存在的旧 gateway，避免双 gateway 双响应。
$me = @()
$me += Get-CimInstance Win32_Process -Filter "Name='reasonix-bot.exe'" -ErrorAction SilentlyContinue
$me += Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*reasonix.js*' -and $_.CommandLine -like '*bot*start*' }

if ($linuxAlive) {
  # Linux 醒着 -> 让路：停掉本地 gateway，避免双响应
  if ($me) {
    $me | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Add-Content $log "$stamp linux-alive -> stopped local gateway"
  } else {
    Add-Content $log "$stamp linux-alive -> no local gateway (standby)"
  }
} else {
  # Linux 失联 -> 接管：确保本地 gateway 运行
  if (-not $me) {
    $env:REASONIX_HOME = $botHome
    # 保持改名副本与 npm 包内 CLI 同步（大小或时间戳变化即重新复制）
    $needSync = $true
    if ((Test-Path $botExe) -and (Test-Path $cliSrcExe)) {
      $s = Get-Item $cliSrcExe; $d = Get-Item $botExe
      if ($d.Length -eq $s.Length -and $d.LastWriteTimeUtc -ge $s.LastWriteTimeUtc) { $needSync = $false }
    }
    if ($needSync -and (Test-Path $cliSrcExe)) {
      New-Item -ItemType Directory -Force -Path (Split-Path $botExe) | Out-Null
      Copy-Item $cliSrcExe $botExe -Force
      Add-Content $log "$stamp synced reasonix-bot.exe <- npm cli"
    }
    Start-Process -WindowStyle Hidden -FilePath $botExe -ArgumentList 'bot','start','--channels','weixin','--dir',"`"$workdir`"" -RedirectStandardOutput 'C:\Users\27063\AppData\Roaming\reasonix\bot-win.log' -RedirectStandardError 'C:\Users\27063\AppData\Roaming\reasonix\bot-win-err.log'
    Add-Content $log "$stamp linux-down -> started local gateway"
  } else {
    Add-Content $log "$stamp linux-down -> local gateway already running"
  }
}