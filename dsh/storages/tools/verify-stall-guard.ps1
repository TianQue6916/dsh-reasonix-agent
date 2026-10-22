# verify-stall-guard.ps1
#
# 用途：每次重启 dsh（desktop App 或 web 进程）之后，一条命令确认
#       `.agent-presets/anchored-standard/stall-guard.mjs` 是否真的被加载。
#
# 为什么需要它：`.agent-presets/**/*.mjs` 不参与 `patchReload: live`，
# 改完必须重启进程才会重新 import —— 而「有没有重启成功」在过去只能靠猜。
# 本脚本用「stall-guard.log 里最新一条 installed 行的 pid 是否等于当前
# 正在运行的某个 dsh host 的 pid」作为判据，把这件事变成可判定的事实。
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File ~/.dsh/storages/tools/verify-stall-guard.ps1

$ErrorActionPreference = 'Continue'
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$mod     = Join-Path $dshHome '.agent-presets/anchored-standard/stall-guard.mjs'
$log     = Join-Path $dshHome 'logs/stall-guard.log'
$ok = 0; $bad = 0

function Say($text) { Write-Host $text }
function Pass($msg) { $script:ok++;  Write-Host ("  PASS  " + $msg) -ForegroundColor Green }
function Fail($msg) { $script:bad++; Write-Host ("  FAIL  " + $msg) -ForegroundColor Red }
function Warn($msg) { Write-Host ("  WARN  " + $msg) -ForegroundColor Yellow }

Say ''
Say '=== 1. 模块与接线 ==='
if (Test-Path $mod) {
  $fi = Get-Item $mod
  Pass ("module exists  bytes=" + $fi.Length + "  mtime=" + $fi.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))
  $modTime = $fi.LastWriteTime
} else {
  Fail "module missing: $mod"
  $modTime = $null
}

foreach ($profile in @('web', 'desktop')) {
  $pc = Join-Path $dshHome ("profiles/$profile/cordis.patch.yml")
  if (-not (Test-Path $pc)) { Fail ("profile patch missing: " + $pc); continue }
  $hit = Select-String -Path $pc -SimpleMatch '- id: stall-guard' -ErrorAction SilentlyContinue
  if ($hit) {
    Pass ("$profile  cordis.patch.yml has '- id: stall-guard' at line " + @($hit)[0].LineNumber)
  } else {
    Fail ("$profile  cordis.patch.yml has NO stall-guard row")
  }
}

Say ''
Say '=== 2. 当前在跑的 dsh host 进程 ==='
# dsh host 的判据：命令行里带 app.asar 的 dsh、或 dsh/lib/bin.js。
# 排除 Electron 的 renderer/gpu 子进程：它们不含 --expose-internals / lib/bin.js。
$hosts = @()
Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='DeepSeek Harness.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and ($_.CommandLine -match 'dsh[/\\]lib[/\\]bin\.js' -or $_.CommandLine -match 'expose-internals') } |
  ForEach-Object {
    $hosts += [pscustomobject]@{
      Pid     = $_.ProcessId
      Created = $_.CreationDate
      Kind    = if ($_.CommandLine -match 'expose-internals') { 'desktop-host' } else { 'web-host' }
    }
  }
if ($hosts.Count -eq 0) {
  Warn 'no dsh host process found (App 没在跑？)'
} else {
  foreach ($h in $hosts) {
    Say ("  pid=" + $h.Pid + "  kind=" + $h.Kind + "  started=" + $h.Created)
  }
}

Say ''
Say '=== 3. stall-guard.log ==='
if (-not (Test-Path $log)) {
  Fail "no log yet: $log  -> 说明模块从未被 apply()（进程还没带它启动过）"
} else {
  $lines = @(Get-Content $log -ErrorAction SilentlyContinue)
  # 注意：Where-Object 命中 0 或 1 条时返回的是标量而不是数组，
  # 直接取 [-1] 会退化成「取字符串最后一个字符」。必须用 @() 强制成数组。
  $installed = @($lines | Where-Object { $_ -match 'installed pid=' })
  $cancels   = @($lines | Where-Object { $_ -match 'STALL-CANCEL' })
  $breaker   = @($lines | Where-Object { $_ -match 'toolBreaker armed' })
  Say ("  total lines=" + $lines.Count + "  installed-lines=" + $installed.Count + "  STALL-CANCEL=" + $cancels.Count + "  toolBreaker-armed=" + $breaker.Count)
  if ($installed.Count -gt 0) {
    $last = $installed[$installed.Count - 1]
    $lastPid = -1
    if ($last -match 'installed pid=([0-9]+)') { $lastPid = [int]$Matches[1] }
    Say ("  last installed -> pid=" + $lastPid + "   (" + $last + ")")
    $alive = @($hosts | Where-Object { $_.Pid -eq $lastPid })
    if ($alive.Count -gt 0) {
      $h = $alive[0]
      Pass ("pid " + $lastPid + " (" + $h.Kind + ") 仍在运行 -> 当前这版 host 已加载 stall-guard")
      if ($modTime) {
        if ($h.Created -gt $modTime) {
          Pass ("host 启动时间 (" + $h.Created + ") 晚于模块 mtime (" + $modTime + ") -> 跑的是最新代码")
        } else {
          Fail ("host 启动时间 (" + $h.Created + ") 早于模块 mtime (" + $modTime + ") -> 跑的是旧代码，需再重启")
        }
      }
    } else {
      Fail ("最新 installed 的 pid " + $lastPid + " 已不在运行 -> 那是旧进程；当前这版 host 没有加载 stall-guard，请重启后再跑本脚本")
    }
  } else {
    Fail 'log 存在但没有 installed 行 —— 模块 apply() 从未执行过'
  }
  if ($cancels.Count -gt 0) {
    Say ''
    Say '  ---- 最近 STALL-CANCEL ----'
    $cancels | Select-Object -Last 5 | ForEach-Object { Say ('  ' + $_) }
  }
}

Say ''
Say '=== 4. 顺带看一眼 host stdio（tee 是否也在）==='
$tee = Join-Path $dshHome 'logs/host-stdio.log'
if (Test-Path $tee) {
  $ti = @(Select-String -Path $tee -SimpleMatch '[tee] installed' -ErrorAction SilentlyContinue)
  if ($ti.Count -gt 0) { Pass ("host-stdio.log has " + $ti.Count + " tee-installed line(s); last: " + $ti[$ti.Count - 1].Line) }
  else { Warn 'host-stdio.log 存在但没有 tee installed 行' }
  $fli = Get-Item $tee
  Say ("  host-stdio.log mtime=" + $fli.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss') + " bytes=" + $fli.Length)
} else {
  Warn 'host-stdio.log 不存在'
}

Say ''
Say ("=== 结果: " + $ok + " passed / " + $bad + " failed ===")
if ($bad -eq 0) { Say 'stall-guard 已就位：turn 不会再永久冻住（4 分钟无 stream 活动即 cancel）。' }
else { Say 'stall-guard 尚未就位 —— 重启 desktop App（或 web 进程）后重跑本脚本。' }
exit $bad
