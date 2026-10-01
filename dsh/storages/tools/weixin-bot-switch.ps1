<#
  weixin-bot-switch.ps1 — 微信 bot 在 reasonix 侧与 dsh 侧之间切换的安全网

  【为什么必须有这个脚本】
  两套 gateway 同时在线会**双响应**：同一条微信消息被回两次。
  reasonix 自己的 leader election（每分钟 ping Linux）解决的是"两台机器"之间的竞争，
  管不了"同一台机器上两个不同的 harness"。任何迁移/回滚都必须
  **先停一方、确认停干净、再起另一方**。

  【现状基线（2026-09-28 实测）】
    进程名   : reasonix-bot.exe（**改名副本**，原名 reasonix.exe 会与桌面 launcher 撞名
               → launcher 在 Session 0 进程归属确认时 access denied 而拒绝启动）
    源 CLI   : %APPDATA%\npm\node_modules\@reasonix\cli-win32-x64\bin\reasonix.exe
    独立 home: %APPDATA%\reasonix-bot      （$env:REASONIX_HOME，与桌面版隔离避免双 gateway）
    启动命令 : reasonix-bot.exe bot start --channels weixin --dir "<workspace>"
    leader   : **bot 内置**（每分钟 ping 192.168.1.13 / 100.79.96.82，Linux 活则自己退出）。
               外部脚本 check_bot_leader.ps1 已不被任何计划任务调用，属被取代的早期实现。
    协议     : 腾讯官方 iLink（https://ilinkai.weixin.qq.com），非第三方逆向
    凭据     : %APPDATA%\reasonix-bot\weixin\accounts\{default.json, cf29d3b9eb6f@im.bot.json,
               default.context-tokens.json}；桌面版另有一份内容完全相同的副本
    注意     : bot 进程属于 Session 0，Get-CimInstance 读不到 CommandLine（实测为空），
               所以只能靠**进程名**识别，不能靠命令行匹配

  【用法】
    .\weixin-bot-switch.ps1 -Mode Status        # 只看状态，不改动任何东西
    .\weixin-bot-switch.ps1 -Mode ToDsh         # 停 reasonix 侧，交给 dsh 侧
    .\weixin-bot-switch.ps1 -Mode ToReasonix    # 回滚：停 dsh 侧，恢复 reasonix 侧

  推荐迁移顺序（避免消息中断）：
    1) 先在**隔离环境**里把 dsh 插件装好、起得来、配置能读（此期间不碰 reasonix 侧，微信照常服务）
    2) 再执行 -Mode ToDsh（微信会有几十秒中断）
    3) 发一条微信验证 dsh 侧响应；不成功立刻 -Mode ToReasonix 回滚
#>
param(
  [ValidateSet('Status','ToDsh','ToReasonix')]
  [string]$Mode = 'Status'
)
$ErrorActionPreference = 'Continue'

$AppData    = $env:APPDATA
$BotHome    = Join-Path $AppData 'reasonix-bot'
$BotExe     = Join-Path $BotHome 'bin\reasonix-bot.exe'
$CliSrcExe  = Join-Path $AppData 'npm\node_modules\@reasonix\cli-win32-x64\bin\reasonix.exe'
$WorkDir    = Join-Path $AppData 'reasonix\global-workspace'
$BotOutLog  = Join-Path $AppData 'reasonix\bot-win.log'
$BotErrLog  = Join-Path $AppData 'reasonix\bot-win-err.log'
$LeaderLog  = Join-Path $AppData 'reasonix\bot_leader.log'

function Get-ReasonixBot {
  # ⚠ 调用点必须写 @(Get-ReasonixBot)：函数返回**单元素数组**会被 PowerShell 解包成
  # 单个 CimInstance，而 CimInstance **没有 .Count 属性**（不像 PS 3.0+ 给普通对象加的 Count）
  # → $p.Count 得到 $null，$null -gt 0 为假，于是**误报“未运行”**。2026-09-28 实测踩过。
  @(Get-CimInstance Win32_Process -Filter "Name='reasonix-bot.exe'" -ErrorAction SilentlyContinue)
}

function Get-DshBot {
  # dsh 侧用 @lanbaolu/dsh-wechat-bridge：host 插件 spawn 出 daemon 后，把 pid 写进
  # <dataDir>\daemon.pid（src: lib/index.js 的 pidPath）。
  #
  # 为什么读 pid 文件而不是按进程名找：桌面端(Electron)里 daemon 以
  # ELECTRON_RUN_AS_NODE=1 执行，进程映像名是 "DeepSeek Harness.exe"，
  # 按名字匹配会同时命中 Host 本身和 4 个渲染/GPU 进程，根本分不出来。
  # pid 文件是插件自己维护的单一真相，且 daemonRunning() 也是查它。
  #
  # dataDir 默认 $DSH_HOME/wechat-bridge（DSH_HOME 未设则 ~/.dsh）。
  $dataDir = if ($env:DSH_HOME) { Join-Path $env:DSH_HOME 'wechat-bridge' }
             else { Join-Path $env:USERPROFILE '.dsh\wechat-bridge' }
  $pidFile = Join-Path $dataDir 'daemon.pid'
  if (-not (Test-Path -LiteralPath $pidFile)) { return @() }
  $dshBotPid = 0
  try { $dshBotPid = [int]((Get-Content -LiteralPath $pidFile -Raw).Trim()) } catch { return @() }
  if ($dshBotPid -le 0) { return @() }
  # 注意1：$pid 是 PowerShell 只读自动变量，绝不能拿它当变量名（2026-09-30 踩过）。
  # 注意2：必须用 Get-CimInstance 而不是 Get-Process —— 调用方统一读 $x.ProcessId，
  #        那是 CimInstance(Win32_Process) 的属性名；Get-Process 返回的 Process 对象
  #        属性叫 Id，直接混用会让 PID 显示为空（2026-09-30 实测踩过）。
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$dshBotPid" -ErrorAction SilentlyContinue
  if ($proc) { return @($proc) }
  return @()
}

function Get-DshBotDataDir {
  if ($env:DSH_HOME) { return (Join-Path $env:DSH_HOME 'wechat-bridge') }
  return (Join-Path $env:USERPROFILE '.dsh\wechat-bridge')
}

function Show-DshDaemonLog {
  $logPath = Join-Path (Get-DshBotDataDir) 'logs\daemon.log'
  if (Test-Path -LiteralPath $logPath) {
    Write-Host '  daemon.log 末 5 行:' -ForegroundColor DarkGray
    Get-Content -LiteralPath $logPath -Tail 5 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host ("    " + $_) -ForegroundColor DarkGray }
  }
}

function Show-Status {
  Write-Host '=== reasonix 侧 ===' -ForegroundColor Cyan
  $p = @(Get-ReasonixBot)
  if ($p.Count -gt 0) {
    foreach ($x in $p) {
      Write-Host ("  reasonix-bot.exe  PID {0}  started {1}" -f $x.ProcessId, $x.CreationDate) -ForegroundColor Green
    }
  } else {
    Write-Host '  未运行' -ForegroundColor Yellow
  }
  if (Test-Path -LiteralPath $LeaderLog) {
    $tail = Get-Content -LiteralPath $LeaderLog -Tail 1 -ErrorAction SilentlyContinue
    Write-Host ("  leader 日志末行: {0}" -f $tail) -ForegroundColor DarkGray
  }

  Write-Host ''
  Write-Host '=== dsh 侧 ===' -ForegroundColor Cyan
  $d = @(Get-DshBot)
  if ($d.Count -gt 0) { foreach ($x in $d) { Write-Host ("  daemon PID {0} ({1})" -f $x.ProcessId, $x.Name) -ForegroundColor Green } }
  else { Write-Host '  未运行（daemon.pid 缺失或进程已退出）' -ForegroundColor Yellow; Show-DshDaemonLog }
  $listen = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
  if ($listen) { Write-Host ("  dsh web 3080 LISTENING pid {0}" -f $listen.OwningProcess) -ForegroundColor Green }
  else { Write-Host '  dsh web 3080 未监听' -ForegroundColor Yellow }

  Write-Host ''
  Write-Host '=== 凭据在位情况（只看文件是否存在，不打印内容）===' -ForegroundColor Cyan
  foreach ($rel in @('weixin\accounts\default.json', 'weixin\accounts\default.context-tokens.json')) {
    $f = Join-Path $BotHome $rel
    Write-Host ("  reasonix-bot\{0}  {1}" -f $rel, $(if (Test-Path -LiteralPath $f) { 'OK' } else { '缺失' }))
  }
}

function Stop-ReasonixBot {
  $p = @(Get-ReasonixBot)
  if ($p.Count -eq 0) { Write-Host '  reasonix 侧本来就没在跑' -ForegroundColor Yellow; return }
  foreach ($x in $p) {
    Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host ("  已停 reasonix 侧 PID {0}" -f $x.ProcessId) -ForegroundColor Green
  }
  Start-Sleep -Seconds 3
  if (@(Get-ReasonixBot).Count -gt 0) { Write-Host '  ⚠ 仍有残留进程，请手动检查' -ForegroundColor Red }
  else { Write-Host '  确认已停干净' -ForegroundColor DarkGray }
}

function Start-ReasonixBot {
  if (@(Get-ReasonixBot).Count -gt 0) { Write-Host '  reasonix 侧已在运行（幂等，不重复起）' -ForegroundColor Yellow; return }

  # 与 check_bot_leader.ps1 相同的同步语义：size 或 mtime 变化即从 npm 包内 CLI 复制改名副本
  if ((Test-Path -LiteralPath $CliSrcExe)) {
    $need = $true
    if (Test-Path -LiteralPath $BotExe) {
      $s = Get-Item -LiteralPath $CliSrcExe
      $d = Get-Item -LiteralPath $BotExe
      if ($d.Length -eq $s.Length -and $d.LastWriteTimeUtc -ge $s.LastWriteTimeUtc) { $need = $false }
    }
    if ($need) {
      New-Item -ItemType Directory -Force -Path (Split-Path $BotExe) | Out-Null
      Copy-Item -LiteralPath $CliSrcExe -Destination $BotExe -Force
      Write-Host '  已同步 reasonix-bot.exe <- npm cli' -ForegroundColor DarkGray
    }
  } elseif (-not (Test-Path -LiteralPath $BotExe)) {
    Write-Host '  既没有源 CLI 也没有改名副本，无法启动：' -ForegroundColor Red
    Write-Host ("    src: {0}" -f $CliSrcExe) -ForegroundColor Red
    Write-Host ("    dst: {0}" -f $BotExe) -ForegroundColor Red
    return
  }

  $env:REASONIX_HOME = $BotHome
  Write-Host ("  启动 reasonix bot（home={0}）" -f $BotHome) -ForegroundColor DarkGray
  Start-Process -WindowStyle Hidden -FilePath $BotExe `
    -ArgumentList 'bot', 'start', '--channels', 'weixin', '--dir', ('"' + $WorkDir + '"') `
    -RedirectStandardOutput $BotOutLog -RedirectStandardError $BotErrLog
  Start-Sleep -Seconds 8
  $p = @(Get-ReasonixBot)
  if ($p.Count -gt 0) { Write-Host ("  reasonix bot 已启动 PID {0}" -f $p[0].ProcessId) -ForegroundColor Green }
  else { Write-Host '  启动后未见进程；看 bot-win-err.log' -ForegroundColor Red }
}

function Stop-DshBot {
  $d = @(Get-DshBot)
  if ($d.Count -eq 0) {
    Write-Host '  未检测到 dsh 侧 bot 进程；若已装插件请手动确认它是否在跑（识别逻辑待补全）' -ForegroundColor Yellow
    return
  }
  foreach ($x in $d) { Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host ("  已停 dsh 侧 PID {0}" -f $x.ProcessId) -ForegroundColor Green }
}

switch ($Mode) {
  'Status' {
    Show-Status
  }
  'ToDsh' {
    Write-Host '=== 切到 dsh 侧 ===' -ForegroundColor Cyan
    Stop-ReasonixBot
    Write-Host '  现在请在 dsh 侧启动 bot（具体命令取决于所选插件）' -ForegroundColor Yellow
    Write-Host '  验证：发一条微信，确认只有 dsh 侧响应' -ForegroundColor Yellow
    Write-Host ''
    Show-Status
  }
  'ToReasonix' {
    Write-Host '=== 回滚到 reasonix 侧 ===' -ForegroundColor Cyan
    Stop-DshBot
    Start-ReasonixBot
    Write-Host ''
    Show-Status
  }
}
