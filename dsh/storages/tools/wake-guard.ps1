<#
  wake-guard.ps1 — 拦截「关机后 13~21 秒自己冷启动」的假自启

  背景（2026-10-29 修正）：
    控制中心的「来电自动开机」= HKLM\SOFTWARE\OEM\GamingCenter2\MySetting\AcRecoverySwitch = 1，
    而 ItemSupport\AcRecoverySwitchBiosSupport = 0 ⇒ BIOS 层没有这个选项，是同方 EC 固件里的
    独立逻辑，判据是「充电状态」的 0→1 翻转（不是 AC 电平）。用户时刻插电、电池恒满
    （Charging=False / ChargeRate=0）⇒ 恰好停在「未充电」态，关机后 EC 采样到微小掉电就恢复
    充电 → 假边沿 → 冷启动。

  ★ 用户硬约束（2026-10-29 原话）：
      「别影响我手动重启就行，上次就是影响了我自己修改了」
    ⇒ Reboot 分支被放在最前面，无条件放行，后续任何判定都碰不到它。

  三层分流（按顺序，先命中先返回）：
    1) Action = Reboot        → 放行（用户重启，绝不干预）
    2) Action = Shutdown      → 只有「距上次本脚本关机 < BurstWindowSeconds」才继续（拦连发），否则放行
    3) Action = Shutdown Off  → 走 gap 判定（真·假自启的唯一入口）
    其他                       → 放行

  保命开关：在 logs 目录放一个 wake-guard.off 文件，脚本立即退出，不做任何事。

  用法：
    pwsh -NoProfile -File wake-guard.ps1
    pwsh -NoProfile -File wake-guard.ps1 -DryRun
    pwsh -NoProfile -File wake-guard.ps1 -DryRun -TestAction Reboot
    pwsh -NoProfile -File wake-guard.ps1 -DryRun -TestAction Shutdown -BurstWindowSeconds 999999

  回滚： schtasks /delete /tn WakeGuard /f
#>
[CmdletBinding()]
param(
    [int]$ThresholdSeconds   = 60,     # 假自启的 gap 上限（真实分布 13~100 秒）
    [int]$GraceSeconds       = 10,     # 关机前的缓冲，不设 0
    [int]$MaxPerHour         = 5,      # 一小时内最多拦几次（防无限开关机）
    [int]$BurstWindowSeconds = 150,    # 「上次是本脚本关机」的判定窗口
    [switch]$DryRun,
    [string]$TestAction      = ''      # 仅用于干跑验证各分支
)

$ErrorActionPreference = 'Continue'

$LogDir  = 'C:\Users\27063\.dsh\logs'
$LogFile = Join-Path $LogDir 'wake-guard.log'
$OffFile = Join-Path $LogDir 'wake-guard.off'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Write-Log([string]$msg) {
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $LogFile -Value $line -Encoding utf8
    Write-Output $line
}

function Get-LastPhantomTime {
    if (-not (Test-Path $LogFile)) { return $null }
    # 必须精确到 'PHANTOM: shutting down' —— 旧版放过 "not a phantom boot" 这类说明行，
    # 而 -match 默认忽略大小写，会把那句说明当成真实关机记录，算出负数间隔。
    $hit = Get-Content -Path $LogFile -ErrorAction SilentlyContinue |
        Where-Object { $_ -cmatch '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}.*PHANTOM: shutting down' } |
        Select-Object -Last 1
    if (-not $hit) { return $null }
    if ($hit -match '^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})') {
        try { return [datetime]::Parse($Matches[1]) } catch { return $null }
    }
    return $null
}

# ---- 0) 保命开关 ----
if (Test-Path $OffFile) {
    Write-Log 'DISABLED: wake-guard.off present, doing nothing'
    exit 0
}

# ---- 1) 等 System 日志 + 取 109 的 Action ----
# Action 只能从 Message 文本解析（ToXml 的 EventData 里没有），实测三种：
#   Reboot / Shutdown / Shutdown Off
$ev = $null
$action = ''
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
    $ev = Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 109 } -MaxEvents 1 -ErrorAction SilentlyContinue
    if ($ev) {
        if ($ev.Message -match 'Power Action ([A-Za-z ]+?)\s*(?:事件|Event|$)') { $action = $Matches[1].Trim() }
        break
    }
    Start-Sleep -Seconds 3
}
if (-not $ev) { Write-Log 'SKIP: Kernel-Power 109 unreadable within 120s'; exit 0 }
if ($TestAction) { $action = $TestAction }

# ---- 2) boot 时间与 gap ----
$boot = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).LastBootUpTime
if (-not $boot) { Write-Log 'SKIP: LastBootUpTime unavailable'; exit 0 }
$boot = [datetime]$boot
$gap = [math]::Round(($boot - $ev.TimeCreated).TotalSeconds, 1)

Write-Log ('CHECK boot={0:yyyy-MM-dd HH:mm:ss} last109={1:yyyy-MM-dd HH:mm:ss} gap={2}s thr={3}s dryrun={4} testaction={5}' -f `
    $boot, $ev.TimeCreated, $gap, $ThresholdSeconds, [bool]$DryRun, $TestAction)
Write-Log ('ACTION last109 ({0})' -f $(if ($action) { $action } else { 'UNKNOWN' }))

# ---- 3) 分流 ----

# 3a) 用户手动重启 —— 无条件放行，绝不干预
if ($action -eq 'Reboot') {
    Write-Log 'OK: Reboot (user-initiated restart) — never touched'
    exit 0
}

# 3b) shutdown.exe 发起的关机 —— 只可能是「本脚本自己上一轮关的」，用来拦连发
if ($action -eq 'Shutdown') {
    $phantomAt = Get-LastPhantomTime
    if (-not $phantomAt) {
        Write-Log 'OK: Shutdown but no prior guard action on record — leaving alone'
        exit 0
    }
    $sinceGuard = ($boot - $phantomAt).TotalSeconds
    if ($sinceGuard -lt 0 -or $sinceGuard -ge $BurstWindowSeconds) {
        Write-Log ('OK: Shutdown, last guard action {0:N0}s ago (outside {1}s window) — leaving alone' -f $sinceGuard, $BurstWindowSeconds)
        exit 0
    }
    Write-Log ('BURST: last shutdown was this guard ({0:N0}s ago) and the machine came right back — continuing phantom check' -f $sinceGuard)
    # 落到下面的 gap 判定
}
elseif ($action -eq 'Shutdown Off') {
    Write-Log 'CHECK: full power-off (winlogon) — evaluating gap'
}
else {
    Write-Log ('SKIP: action is {0}, not a full power-off — refusing to act' -f $(if ($action) { $action } else { 'UNKNOWN' }))
    exit 0
}

# ---- 4) gap 判定 ----
if ($gap -lt 0) { Write-Log 'SKIP: negative gap (clock skew / stale event)'; exit 0 }
if ($gap -ge $ThresholdSeconds) {
    Write-Log ('OK: normal boot (gap {0}s >= {1}s)' -f $gap, $ThresholdSeconds)
    exit 0
}

# ---- 5) 循环保护 ----
$recent = 0
if (Test-Path $LogFile) {
    $cut = (Get-Date).AddHours(-1)
    $recent = @(Get-Content -Path $LogFile -ErrorAction SilentlyContinue | Where-Object {
        if ($_ -cmatch '^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*PHANTOM: shutting down') {
            try { [datetime]::Parse($Matches[1]) -gt $cut } catch { $false }
        } else { $false }
    }).Count
}
if ($recent -ge $MaxPerHour) {
    Write-Log ('SKIP: loop-guard hit ({0} handled in last hour, cap {1})' -f $recent, $MaxPerHour)
    exit 0
}

# ---- 6) 执行 ----
if ($DryRun) {
    Write-Log ('DRYRUN: would shut down in {0}s (gap={1}s < {2}s)' -f $GraceSeconds, $gap, $ThresholdSeconds)
    exit 0
}

Write-Log ('PHANTOM: shutting down in {0}s (gap={1}s < {2}s) — run shutdown /a to abort' -f $GraceSeconds, $gap, $ThresholdSeconds)
if ($GraceSeconds -gt 0) { shutdown.exe /s /t $GraceSeconds /f | Out-Null }
else { shutdown.exe /s /t 0 /f | Out-Null }
exit 0
