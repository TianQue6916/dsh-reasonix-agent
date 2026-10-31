<#
  goat-usage.ps1 — Command Code GOAT 套餐额度看板（5 小时 / 周 / 月）
  ------------------------------------------------------------------
  数据来源：api.commandcode.ai 的 alpha 端点（用 keys.json 里的 user_ key 直连认证）

    GET /alpha/billing/credits   -> windowLimits.fiveHour / weekly {used, cap, resetAt, exceeded}
                                    credits.monthlyCredits = 本月剩余额度
    GET /alpha/usage/summary     -> 当前计费周期已用额度（totalCredits）
    GET /alpha/billing/subscriptions -> data.currentPeriodEnd = 月度额度重置时刻（订阅计费周期，
                                    订阅锚定而非自然月；credits 端点完全不提供月窗口时间）

  月度上限 = 本周期已用 + 本月剩余（实测两账号均 ≈ 70）

  用法：
    .\goat-usage.ps1                 # 双账号一览
    .\goat-usage.ps1 -Key 163        # 只看某个账号
    .\goat-usage.ps1 -Watch 30       # 每 30 秒刷新（Ctrl+C 退出）
    .\goat-usage.ps1 -Json           # 输出 JSON（给状态栏/宠物等外部消费）
    .\goat-usage.ps1 -NoColor        # 纯文本
#>
[CmdletBinding()]
param(
  [string]$Key,
  [int]$Watch = 0,
  [switch]$Json,
  [switch]$Brief,
  [switch]$NoColor,
  [int]$CacheSeconds = 60,
  [switch]$Force,
  [string]$KeysFile,
  [string]$CacheFile
)
if (-not $KeysFile) { $KeysFile = Join-Path $PSScriptRoot 'keys.json' }

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
$Api = 'https://api.commandcode.ai'

function Get-Usage([string]$bearer) {
  $h = @{ Authorization = "Bearer $bearer" }
  $credits = Invoke-RestMethod -Uri "$Api/alpha/billing/credits" -Headers $h -TimeoutSec 25 -UseBasicParsing
  $summary = Invoke-RestMethod -Uri "$Api/alpha/usage/summary" -Headers $h -TimeoutSec 25 -UseBasicParsing
  # 月度额度不是 rate-limit window：credits 端点里 monthlyCredits 只有余额、**没有任何时间字段**
  # （windowLimits 的成员只有 limited / exceeded / fiveHour / weekly）。月度的重置时间 = 订阅
  # 计费周期的结束时刻，只能从 /alpha/billing/subscriptions 取 currentPeriodEnd。实测两账号都是
  # 「订阅锚定」而非自然月：163 created 2026-09-07 -> 周期 09-07..10-07；qq created 2026-09-03
  # -> 周期 09-03..10-03。该端点失败不致命（key 可能没有订阅），置 $null 由消费方降级。
  $monthReset = $null
  try {
    $sub = Invoke-RestMethod -Uri "$Api/alpha/billing/subscriptions" -Headers $h -TimeoutSec 25 -UseBasicParsing
    $body = if ($null -ne $sub.data) { $sub.data } else { $sub }
    if ($body.currentPeriodEnd) { $monthReset = [DateTimeOffset]::Parse([string]$body.currentPeriodEnd).ToUnixTimeMilliseconds() }
  } catch {}
  # 2026-10-29 新增：计费周期起点（summary.periodStart，ISO 字符串）。
  # 与 monthReset（= subscriptions.currentPeriodEnd）配对，让 UI 能算
  # 「周期已过 N 天 / 日均消耗 / 剩余 credits 还能撑几天」。拿不到就置 $null，由消费方降级。
  $periodStartMs = $null
  if ($summary.periodStart) {
    try { $periodStartMs = [DateTimeOffset]::Parse([string]$summary.periodStart).ToUnixTimeMilliseconds() } catch {}
  }
  [pscustomobject]@{
    fiveHour  = $credits.windowLimits.fiveHour
    weekly    = $credits.windowLimits.weekly
    monthUsed = [double]$summary.totalCredits
    monthLeft = [double]$credits.credits.monthlyCredits
    monthCap  = [double]$summary.totalCredits + [double]$credits.credits.monthlyCredits
    monthReset = $monthReset
    requests  = $summary.totalCount
    tokens    = $summary.totalTokens
    # 2026-10-29 新增用量字段。官方 usage/summary 的 daily 恒为空数组
    # （?days= / ?groupBy= / ?period= / ?include= 四种参数实测均不生效），
    # 所以「按天」粒度只能由消费方拿 periodStart 自己推算，后端只给周期总量。
    tokensIn    = $summary.totalTokensIn
    tokensOut   = $summary.totalTokensOut
    failedCount = $summary.failedCount
    successRate = $summary.successRate
    avgCost     = $summary.averageCost
    periodStart = $periodStartMs
    periodEnd   = $monthReset
    exceeded  = $credits.windowLimits.exceeded
  }
}

function Get-OfficialBalance([string]$bearer) {
  # DeepSeek 官方余额端点（2026-10-01 实测 HTTP 200）：
  #   {"is_available":true,"balance_infos":[{"currency":"CNY","total_balance":"2.99",
  #     "granted_balance":"3.21","topped_up_balance":"-0.22"}]}
  # 注意：这是「余额」不是「套餐窗口」，字段语义与 GOAT 的 5h/周/月 完全不同，
  # 所以调用方必须按 row.kind 分支渲染，绝不能拿它去算百分比。
  $h = @{ Authorization = "Bearer $bearer" }
  $b = Invoke-RestMethod -Uri 'https://api.deepseek.com/user/balance' -Headers $h -TimeoutSec 25 -UseBasicParsing
  $first = @($b.balance_infos) | Select-Object -First 1
  [pscustomobject]@{
    isAvailable = [bool]$b.is_available
    currency    = if ($first) { [string]$first.currency } else { 'CNY' }
    total       = if ($first) { [double]$first.total_balance } else { [double]0 }
    granted     = if ($first) { [double]$first.granted_balance } else { [double]0 }
    toppedUp    = if ($first) { [double]$first.topped_up_balance } else { [double]0 }
  }
}

function Write-Bar([double]$used, [double]$cap, [int]$width = 30) {
  $f = if ($cap -le 0) { 0 } else { [math]::Min(1.0, $used / $cap) }
  $filled = [int][math]::Round($f * $width)
  ('#' * $filled) + ('.' * ($width - $filled))
}

function Format-Reset($epochMs) {
  $t = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$epochMs).LocalDateTime
  $d = $t - (Get-Date)
  if ($d.TotalSeconds -le 0) { return "$($t.ToString('MM-dd HH:mm')) (已重置)" }
  if ($d.TotalDays -ge 1) { return ('{0:MM-dd HH:mm}（还有 {1} 天 {2} 小时）' -f $t, [int]$d.TotalDays, $d.Hours) }
  if ($d.TotalHours -ge 1) { return ('{0:HH:mm}（还有 {1} 小时 {2} 分）' -f $t, [int]$d.TotalHours, $d.Minutes) }
  return ('{0:HH:mm}（还有 {1} 分钟）' -f $t, [int]$d.TotalMinutes)
}

function Get-Color([double]$used, [double]$cap) {
  if ($NoColor) { return 'Gray' }
  $f = if ($cap -le 0) { 0 } else { $used / $cap }
  if ($f -ge 0.9) { return 'Red' } elseif ($f -ge 0.7) { return 'Yellow' } else { return 'Green' }
}

function Render {
  $cacheFile = if ($CacheFile) { $CacheFile } else { Join-Path $env:TEMP 'goat-usage-cache.json' }
  $cached = $null
  if (-not $Force -and $Watch -eq 0 -and $CacheSeconds -gt 0 -and (Test-Path $cacheFile)) {
    try {
      $c = Get-Content $cacheFile -Raw | ConvertFrom-Json
      if (((Get-Date) - [datetime]$c.ts).TotalSeconds -lt $CacheSeconds) { $cached = @($c.rows) }
    } catch {}
  }

  $all = Get-Content $KeysFile -Raw | ConvertFrom-Json
  $list = $all.keys | Where-Object { $_.enabled -ne $false }
  if ($Key) { $list = $list | Where-Object { $_.name -eq $Key } }
  if (-not $list) { throw "keys.json 里找不到账号 '$Key'" }

  if ($cached) {
    $rows = @($cached | Where-Object { -not $Key -or $_.name -eq $Key })
  } else {
  $rows = @()
  foreach ($k in $list) {
    try {
      # keys.json 里带 upstream.origin=deepseek 的 key 走「查余额」而不是「查套餐窗口」。
      $isOfficial = [bool]($k.upstream -and ("$($k.upstream.origin)" -match 'deepseek'))
      if ($isOfficial) {
        $b = Get-OfficialBalance $k.key
        $rows += [pscustomobject]@{
          name = $k.name; error = $null; kind = 'official'; plan = 'official-balance'
          currency = $b.currency; available = $b.total; granted = $b.granted; toppedUp = $b.toppedUp; apiAvailable = $b.isAvailable
          fiveHourUsed = $null; fiveHourCap = $null; fiveHourReset = $null; fiveHourExceeded = $null
          weeklyUsed = $null; weeklyCap = $null; weeklyReset = $null; weeklyExceeded = $null
          monthUsed = $null; monthLeft = $null; monthCap = $null; monthReset = $null
          requests = $null; tokens = $null
          tokensIn = $null; tokensOut = $null; failedCount = $null; successRate = $null; avgCost = $null
          periodStart = $null; periodEnd = $null
          fetchedAt = (Get-Date).ToString('s')
        }
        continue
      }
      $u = Get-Usage $k.key
      $rows += [pscustomobject]@{
        name = $k.name; error = $null; kind = 'goat'; plan = 'individual-goat'
        fiveHourUsed = $u.fiveHour.used; fiveHourCap = $u.fiveHour.cap; fiveHourReset = $u.fiveHour.resetAt; fiveHourExceeded = $u.fiveHour.exceeded
        weeklyUsed = $u.weekly.used; weeklyCap = $u.weekly.cap; weeklyReset = $u.weekly.resetAt; weeklyExceeded = $u.weekly.exceeded
        monthUsed = $u.monthUsed; monthLeft = $u.monthLeft; monthCap = $u.monthCap; monthReset = $u.monthReset
        requests = $u.requests; tokens = $u.tokens
        tokensIn = $u.tokensIn; tokensOut = $u.tokensOut
        failedCount = $u.failedCount; successRate = $u.successRate; avgCost = $u.avgCost
        periodStart = $u.periodStart; periodEnd = $u.periodEnd
        fetchedAt = (Get-Date).ToString('s')
      }
    } catch {
      $rows += [pscustomobject]@{
        name = $k.name; kind = $(if ($isOfficial) { 'official' } else { 'goat' })
        error = $_.Exception.Message; fetchedAt = (Get-Date).ToString('s')
      }
    }
  }
try {
    $tmpCache = "$cacheFile.tmp-$PID"
    [IO.File]::WriteAllText($tmpCache, (@{ ts = (Get-Date).ToString('s'); rows = $rows } | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $tmpCache -Destination $cacheFile -Force
  } catch {}
  }

  if ($Json) { return ($rows | ConvertTo-Json -Depth 6) }

  if ($Brief) {
    $parts = foreach ($r in $rows) {
      if ($r.error) { "[$($r.name)] 查询失败"; continue }
      if ($r.kind -eq 'official') { "[$($r.name)] 余额 $($r.currency) $([math]::Round($r.available,2))"; continue }
      $p5 = [math]::Round(100 * $r.fiveHourUsed / $r.fiveHourCap)
      $pw = [math]::Round(100 * $r.weeklyUsed / $r.weeklyCap)
      $pm = [math]::Round(100 * $r.monthUsed / $r.monthCap)
      "[$($r.name)] 5h $p5% · 周 $pw% · 月 $pm%（月剩 $([math]::Round($r.monthLeft,1)))"
    }
    return ($parts -join '    ')
  }

  $out = @()
  $out += "Command Code GOAT 额度 — $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  foreach ($r in $rows) {
    $out += ''
    if ($r.error) { $out += "[$($r.name)] 查询失败: $($r.error)"; continue }
    if ($r.kind -eq 'official') {
      $out += "[$($r.name)]  $($r.plan)"
      $out += ('  余额 {0} {1:N2}   赠送 {2:N2} · 充值 {3:N2}' -f $r.currency, $r.available, $r.granted, $r.toppedUp)
      continue
    }
    $out += "[$($r.name)]  $($r.plan)"
    foreach ($w in @(
        @{ n = '5小时'; used = $r.fiveHourUsed; cap = $r.fiveHourCap; reset = $r.fiveHourReset; ex = $r.fiveHourExceeded },
        @{ n = '本周 '; used = $r.weeklyUsed; cap = $r.weeklyCap; reset = $r.weeklyReset; ex = $r.weeklyExceeded },
        @{ n = '本月 '; used = $r.monthUsed; cap = $r.monthCap; reset = $r.monthReset; ex = $null }
      )) {
      $pct = if ($w.cap -le 0) { 0 } else { [math]::Round(100 * $w.used / $w.cap, 1) }
      $line = '  {0} [{1}] {2,5}%  {3,7:N2} / {4,-7:N2}' -f $w.n, (Write-Bar $w.used $w.cap), $pct, $w.used, $w.cap
      if ($w.reset) { $line += '  重置 ' + (Format-Reset $w.reset) }
      if ($w.n -eq '本月 ') { $line += ('  剩余 {0:N2}' -f $r.monthLeft) }
      if ($w.ex) { $line += '  [已超限]' }
      $out += $line
    }
    $out += ('  本周期合计 {0} 次请求 / {1:N0} tokens（入 {2:N0} · 出 {3:N0}）' -f $r.requests, $r.tokens, $r.tokensIn, $r.tokensOut)
    $extra = ('  平均 {0:N4} credits/请求' -f $(if ($r.requests -gt 0) { $r.monthUsed / $r.requests } else { 0 }))
    if ($null -ne $r.successRate) { $extra += ('  ·  成功 {0}%' -f $r.successRate) }
    if ($null -ne $r.failedCount -and $r.failedCount -gt 0) { $extra += ('  ·  失败 {0}' -f $r.failedCount) }
    if ($r.periodStart -and $r.periodEnd) {
      $spanDays = ([DateTimeOffset]::FromUnixTimeMilliseconds([int64]$r.periodEnd) - [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$r.periodStart)).TotalDays
      $goneDays = ([DateTimeOffset]::Now - [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$r.periodStart)).TotalDays
      if ($spanDays -gt 0 -and $goneDays -gt 0) {
        $perDay = $r.monthUsed / $goneDays
        $extra += ('  ·  日均 {0:N2} cr（周期已过 {1:N1}/{2:N1} 天，剩 {3:N1} 天）' -f $perDay, $goneDays, $spanDays, ($spanDays - $goneDays))
      }
    }
    $out += $extra
  }
  $out
}

if ($Watch -gt 0) {
  while ($true) {
    Clear-Host
    Render | ForEach-Object { Write-Host $_ }
    Write-Host ''
    Write-Host "每 $Watch 秒刷新，Ctrl+C 退出" -ForegroundColor DarkGray
    Start-Sleep -Seconds $Watch
  }
} else {
  Render
}
