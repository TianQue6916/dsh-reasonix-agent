#Requires -Version 5.1
<#
  dsh launcher (port 3080) — 单实例 / 幂等 / 可开机自启

  【为什么单实例】
    会话按文件存：~/.dsh/sessions/<cwd>/session-<uuid>/session.v4.jsonl.zstd
    没有跨进程锁。第二个实例打开同一个会话时，两个进程会同时追加同一文件 →
    互相踩（表现为「无法同时对话」）。所以固定 3080，且幂等：在跑就绝不再起。

  【两种模式】
    -Mode Serve  开机自启用：只保证服务在跑，不弹浏览器，启动后立刻返回
    -Mode Open   桌面快捷方式用：保证服务在跑，然后打开带 token 的 URL

  【为什么用 UseShellExecute = $true（重要）】
    上一版用 UseShellExecute = $false，子进程会**继承父进程的 stdout 句柄**。
    当我们这个 PS 是从别的进程（例如 agent 的 bash 工具）里被调起来的时候，
    那个 stdout 是一条管道；dsh 长期存活 → 管道永不关闭 → **调用方一直等到超时**，
    看起来就是「卡死」。用 $true 让系统新建进程、不继承我们的句柄，问题消失。
    代价：不能再用 RedirectStandardOutput，改为让 cmd 自己把输出重定向到日志文件。

  【为什么要 NODE_OPTIONS=--use-system-ca】
    本机 dev-sidecar 做 MITM，用自己生成的根 CA 签发证书；Node 默认只信任内置
    CA，于是 fetch 抛 "unable to verify the first certificate"。该 flag 让 Node
    改读 Windows 证书库（dev-sidecar 根 CA 已在 CurrentUser\Root）。
    实测：不加 → 证书失败；加了 → https://github.com HTTP 200 / 576183 bytes
#>
param(
  [ValidateSet('Open','Serve')]
  [string]$Mode = 'Open'
)

$Port      = 3080
$Workspace = "C:\Users\27063"
$LogDir    = Join-Path $env:USERPROFILE ".dsh\logs"
$LogFile   = Join-Path $LogDir "dsh-web-$Port.out.log"

$null = New-Item -ItemType Directory -Force -Path $LogDir

function Test-PortBusy {
  param([int]$P)
  $null -ne (Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue)
}

# ---------- 顺带拉起 ollama（mnemon embedding 依赖；幂等）----------
# 【为什么放最前面】Startup 文件夹里的 ollama-serve.vbs 在 2026-09-28 重启后
# 没有生效（无 ollama 进程、11434 未监听），而手动 Start-Process 一次就成功，
# 说明二进制与模型都没问题、故障点只在「开机自启那一环」。
# 改为复用本脚本：它已被证明能在登录时跑起来（3080 于 2026-09-28 11:52:02 由本脚本拉起）。
# 必须位于 dsh 的幂等 exit 之前，否则 dsh 已在跑时 ollama 永远不会被补起。
$OllamaPort = 11434
$OllamaExe  = Join-Path $env:USERPROFILE ".local\ollama\ollama.exe"
if ((Test-Path $OllamaExe) -and -not (Test-PortBusy $OllamaPort)) {
  Write-Host "启动 ollama serve (port $OllamaPort)" -ForegroundColor Green
  $opsi = New-Object System.Diagnostics.ProcessStartInfo
  $opsi.FileName         = $OllamaExe
  $opsi.Arguments        = 'serve'
  $opsi.WorkingDirectory = Split-Path $OllamaExe
  $opsi.UseShellExecute  = $true     # 同 dsh：不继承调用方 stdout 句柄
  $opsi.WindowStyle      = 'Hidden'
  [void][System.Diagnostics.Process]::Start($opsi)
}

# 从日志里读带 token 的 URL（不依赖预先存档，任何时刻都能重读）
function Read-UrlFromLog {
  if (-not (Test-Path $LogFile)) { return $null }
  $txt = Get-Content $LogFile -Raw -ErrorAction SilentlyContinue
  if (-not $txt) { return $null }
  $m = [regex]::Match(($txt -replace "`0", ""), "https?://[^\s]*token=[^\s]+")
  if ($m.Success) { return $m.Value }
  return $null
}

# ---------- 已在跑：幂等 ----------
if (Test-PortBusy $Port) {
  Write-Host "dsh 已在 $Port 运行（幂等，不再起第二个实例）。" -ForegroundColor Yellow
  if ($Mode -eq 'Open') {
    $u = Read-UrlFromLog
    if (-not $u) { $u = "http://127.0.0.1:$Port/" }   # 浏览器通常已持有 dsh-auth-* cookie
    Write-Host "  打开 $u" -ForegroundColor Cyan
    Start-Process $u
  }
  exit 0
}

# ---------- 启动（完全脱离）----------
$env:NODE_OPTIONS = "--use-system-ca"
Remove-Item $LogFile -ErrorAction SilentlyContinue

Write-Host "启动 dsh web  port=$Port  workspace=$Workspace  mode=$Mode" -ForegroundColor Green

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName        = "$env:ComSpec"
$psi.Arguments       = '/c dsh --profile web --port ' + $Port + ' --no-open > "' + $LogFile + '" 2>&1'
$psi.WorkingDirectory = $Workspace
$psi.UseShellExecute  = $true      # ← 关键：不继承调用方的 stdout 句柄
$psi.WindowStyle      = 'Hidden'

[void][System.Diagnostics.Process]::Start($psi)

# Serve 模式：只确认端口起来就返回，绝不长轮询（避免把调用方拖住）
if ($Mode -eq 'Serve') {
  for ($i = 0; $i -lt 24; $i++) {
    Start-Sleep -Milliseconds 1000
    if (Test-PortBusy $Port) { Write-Host "已在 $Port 运行。" -ForegroundColor Green; exit 0 }
  }
  Write-Host "启动超时。日志：$LogFile" -ForegroundColor Red
  exit 1
}

# Open 模式：轮询「日志文件」（不是进程句柄），抓到 URL 就开浏览器
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 1000
  $u = Read-UrlFromLog
  if ($u) { Write-Host "  打开 $u" -ForegroundColor Cyan; Start-Process $u; exit 0 }
  if (Test-PortBusy $Port -and $i -gt 20) { break }
}
$fallback = "http://127.0.0.1:$Port/"
Write-Host "  URL 未抓到，改为打开 $fallback" -ForegroundColor DarkGray
Start-Process $fallback
exit 0
