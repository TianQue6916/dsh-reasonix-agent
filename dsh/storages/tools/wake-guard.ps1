<#
  wake-guard.ps1 — 拦截「关机后 13~21 秒自己冷启动」的假自启

  背景（2026-10-25 排查定论）：
    BIOS 的 "Power On after AC Loss" 策略 + EC 在 S5 下对 AC_PRESENT 的一次假判定，
    导致正常关机后 13~21 秒系统被重新加电、完整 POST（Kernel-Boot Event 27 BootType=0x0）。
    60 天 26 次，约 35% 概率，08-28/09-11/09-25 各出现连发 3 次。

  判据：
    本次 boot 时间 与 最近一次 Kernel-Power 109 (Action: Shutdown Off) 的间隔 < 阈值。
    真实假自启窗口 13~21 秒，阈值 60 秒给 3 倍余量；
    远程开机（APP 通电）时上次关机早已过去几十分钟，绝不会命中。

  用法：
    pwsh -NoProfile -File wake-guard.ps1                 # 正常判定
    pwsh -NoProfile -File wake-guard.ps1 -DryRun         # 只记录判定，不关机
    pwsh -NoProfile -File wake-guard.ps1 -DryRun -ThresholdSeconds 999999   # 强制走 phantom 分支做干跑
    pwsh -NoProfile -File wake-guard.ps1 -GraceSeconds 30                   # 给 30 秒反悔窗口

  回滚：
    schtasks /delete /tn WakeGuard /f
#>
[CmdletBinding()]
param(
    [int]$ThresholdSeconds = 60,
    [int]$GraceSeconds     = 0,
    [int]$MaxPerHour       = 3,
    [switch]$DryRun
)

$ErrorActionPreference = 'Continue'

$LogDir  = 'C:\Users\27063\.dsh\logs'
$LogFile = Join-Path $LogDir 'wake-guard.log'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Write-Log([string]$msg) {
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $LogFile -Value $line -Encoding utf8
    Write-Output $line
}

# ---- 1) 等 System 日志服务就绪（boot 早期可能还读不到） ----
$ev     = $null
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
    $ev = Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 109 } -MaxEvents 1 -ErrorAction SilentlyContinue
    if ($ev) { break }
    Start-Sleep -Seconds 3
}
if (-not $ev) { Write-Log 'SKIP: Kernel-Power 109 unreadable within 120s'; exit 0 }

# ---- 2) 本次 boot 时间 ----
$boot = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).LastBootUpTime
if (-not $boot) { Write-Log 'SKIP: LastBootUpTime unavailable'; exit 0 }

$gap = [math]::Round(([datetime]$boot - $ev.TimeCreated).TotalSeconds, 1)
Write-Log ('CHECK boot={0:yyyy-MM-dd HH:mm:ss} last109={1:yyyy-MM-dd HH:mm:ss} gap={2}s threshold={3}s dryrun={4}' -f `
    [datetime]$boot, $ev.TimeCreated, $gap, $ThresholdSeconds, [bool]$DryRun)

# ---- 3) 判定 ----
if ($gap -lt 0) { Write-Log 'SKIP: negative gap (clock skew / stale event)'; exit 0 }
if ($gap -ge $ThresholdSeconds) { Write-Log 'OK: normal boot'; exit 0 }

# ---- 4) 循环保护：一小时内已经处理过 MaxPerHour 次就放弃（防止无限开关机） ----
$recent = 0
if (Test-Path $LogFile) {
    $cut = (Get-Date).AddHours(-1)
    $recent = @(Get-Content -Path $LogFile -ErrorAction SilentlyContinue | Where-Object {
        if ($_ -match '^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*PHANTOM') {
            try { [datetime]::Parse($Matches[1]) -gt $cut } catch { $false }
        } else { $false }
    }).Count
}
if ($recent -ge $MaxPerHour) {
    Write-Log ('SKIP: phantom boot detected but loop-guard hit ({0} handled in last hour)' -f $recent)
    exit 0
}

# ---- 5) 执行 ----
if ($DryRun) {
    Write-Log ('DRYRUN: would shut down now (gap={0}s < {1}s)' -f $gap, $ThresholdSeconds)
    exit 0
}

if ($GraceSeconds -gt 0) {
    Write-Log ('PHANTOM: shutdown in {0}s — run "shutdown /a" to abort' -f $GraceSeconds)
    shutdown.exe /s /t $GraceSeconds /f | Out-Null
} else {
    Write-Log ('PHANTOM: shutting down now (gap={0}s < {1}s)' -f $gap, $ThresholdSeconds)
    shutdown.exe /s /t 0 /f | Out-Null
}
exit 0
