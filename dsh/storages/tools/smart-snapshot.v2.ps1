#Requires -Version 5.1
<#
  smart-snapshot.ps1  --  NVMe SMART 快照归档 + 真实磨损速率计算   (v2, 2026-10-07)

  v2 相对 v1 的修正：
    [1] 开机内速率门槛独立。v1 用 $MinWindowDays*24 (=12h) 去卡 on_hours，
        但 on_hours 天然 <= 墙钟，于是 GB_per_on_hour 这列从来没产出过值。
        现在用独立的 $MinOnHours（默认 2 小时）。
    [2] 剩余寿命改用开机口径。v1 的 days_left_est 用 GB_per_day（墙钟分母），
        窗口里只要有关机时段就会被摊薄、剩余天数被吹高：
        实测 12.76h 窗口内含 9.6h 关机 => 算出 3021 天 / 8.3 年，严重高估。
        现在主口径 = GB_per_on_hour x 日均开机小时；日历口径另存 days_left_cal。
    [3] 日均开机小时自动学习：优先 -DutyHoursPerDay，否则从历史
        sum(on_hours)/sum(delta_days) 累计，样本越多越准。
    [4] CSV schema 自动迁移：新增列时重写表头并为旧行补空列（带 .bak 备份）。

  设计要点（v1 保留）：
    · 单位一律十进制（$TB/$GB），与 CDI 的 Host Writes/Reads 及厂商标称 TBW 对齐。
      PowerShell 内建的 1GB / 1TB 是 GiB / TiB，差 7.4% / 10%，混用会把速率算错。
    · 这块 Kingston OEM 盘的 POH 字段不可信（SMART 报 422h，事件日志实测算出
      400 天 x 18h 约 7200h，差 17 倍）=> 分母必须用 Get-OnHours 的事件日志口径。
    · 相邻点墙钟间隔 < $MinWindowDays 时不算日历口径速率，否则重开机一次就会看到
      「6053 GB/天，剩余 17 天」这种由 1.7 分钟窗口推出来的荒谬结论。

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File smart-snapshot.ps1
    powershell ... -File smart-snapshot.ps1 -NoRefresh              # 不跑 CDI，只读现有 DiskInfo.txt
    powershell ... -File smart-snapshot.ps1 -Report                 # 只读 CSV 出历史报告，不采集
    powershell ... -File smart-snapshot.ps1 -DutyHoursPerDay 18.2   # 覆盖日均开机小时
#>
[CmdletBinding()]
param(
    [string]$CdiDir  = 'D:\CrystalDiskInfo',
    [string]$ArchDir = 'D:\CrystalDiskInfo\_history',
    [switch]$NoRefresh,
    [switch]$Report,
    [double]$MinWindowDays   = 0.5,   # 相邻点墙钟间隔短于此值(天)时，不算日历口径速率
    [double]$MinOnHours      = 2.0,   # 相邻点开机时长短于此值(小时)时，不算开机内速率
    [double]$DutyHoursPerDay = 0      # 日均开机小时；0 = 从历史自动学习
)

$ErrorActionPreference = 'Stop'
$exe   = Join-Path $CdiDir 'DiskInfo64.exe'
$src   = Join-Path $CdiDir 'DiskInfo.txt'
$snapD = Join-Path $ArchDir 'snapshots'
$csv   = Join-Path $ArchDir 'smart-history.csv'
$DU    = 512000L
$TB    = 1e12
$GB    = 1e9

# CSV 列顺序唯一真源：migration 与写出都读它
$Schema = @(
    'timestamp','model','serial',
    'health_pct','percent_used','avail_spare','avail_spare_thr','critical_warning',
    'written_bytes','written_TB','read_TB','host_writes_GB','host_reads_GB',
    'temp_C','power_on_hours','power_on_count','unsafe_shutdowns',
    'on_hours','on_hours_total',
    'delta_written_GB','delta_days','GB_per_day','GB_per_on_hour',
    'duty_hours_per_day','GB_per_duty_day','pct_used_per_day',
    'life_TB_est','remain_TB_est','days_left_est','days_left_cal','snapshot'
)

New-Item -ItemType Directory -Force -Path $ArchDir, $snapD | Out-Null

# ---------------------------------------------------------------- helpers
function Get-SmartRaw([string]$t, [string]$id) {
    $m = [regex]::Match($t, "(?m)^\s*$id\s+([0-9A-Fa-f]+)\s")
    if ($m.Success) {
        try { return [int64]::Parse($m.Groups[1].Value, 'HexNumber') } catch { return $null }
    }
    return $null
}
function Get-Plain([string]$t, [string]$label) {
    $m = [regex]::Match($t, "(?m)^\s*" + [regex]::Escape($label) + "\s*:\s*(.+?)\s*$")
    if ($m.Success) { return $m.Groups[1].Value.Trim() }
    return $null
}
function Get-FirstInt([string]$s) {
    if ([string]::IsNullOrWhiteSpace($s)) { return $null }
    $m = [regex]::Match($s, '(\d[\d,]*)')
    if ($m.Success) { return [int64]($m.Groups[1].Value -replace ',', '') }
    return $null
}

# 从事件日志计算 [a, b] 区间内机器实际通电的小时数
function Get-OnHours([datetime]$a, [datetime]$b) {
    $total = 0.0
    try {
        $ev = @(Get-WinEvent -FilterHashtable @{LogName='System'; ID=6005,6006} -MaxEvents 8000 -ErrorAction SilentlyContinue |
                Where-Object { $_.TimeCreated -ge $a -and $_.TimeCreated -le $b } | Sort-Object TimeCreated)
        $before = @(Get-WinEvent -FilterHashtable @{LogName='System'; ID=6005,6006} -MaxEvents 300 -ErrorAction SilentlyContinue |
                    Where-Object { $_.TimeCreated -lt $a } | Sort-Object TimeCreated)
    } catch { return $null }
    $lastOn = $null
    if ($before.Count -gt 0 -and $before[-1].Id -eq 6005) { $lastOn = $a }
    foreach ($e in $ev) {
        if ($e.Id -eq 6006) {
            if ($lastOn) { $total += ($e.TimeCreated - $lastOn).TotalHours; $lastOn = $null }
        } else {
            if (-not $lastOn) { $lastOn = $e.TimeCreated }
        }
    }
    if ($lastOn) { $total += ($b - $lastOn).TotalHours }
    return [math]::Round($total, 2)
}

# CSV schema 迁移：新增列时重写表头并为旧行补空值（先备份）
function Sync-CsvSchema([string]$path, [string[]]$want) {
    if (-not (Test-Path $path)) { return }
    $have = @((Get-Content -LiteralPath $path -TotalCount 1) -split ',')
    if (($have.Count -eq $want.Count) -and (@(Compare-Object $have $want -SyncWindow 0).Count -eq 0)) { return }
    $bak = "$path.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Copy-Item -LiteralPath $path -Destination $bak -Force
    $rows = @(Import-Csv -LiteralPath $path)
    $txt  = New-Object System.Text.StringBuilder
    [void]$txt.AppendLine(($want -join ','))
    foreach ($r in $rows) {
        $cells = foreach ($c in $want) {
            $v = $r.$c
            if ($null -eq $v) { '' }
            elseif ($v -match '[",\r\n]') { '"' + ($v -replace '"','""') + '"' }
            else { $v }
        }
        [void]$txt.AppendLine(($cells -join ','))
    }
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $txt.ToString(), $enc)
    Write-Host ("  [schema] 旧表头 {0} 列 -> 新 {1} 列；已迁移，备份 {2}" -f $have.Count, $want.Count, (Split-Path $bak -Leaf)) -ForegroundColor Cyan
}

# ---------------------------------------------------------------- report mode
if ($Report) {
    if (-not (Test-Path $csv)) { Write-Host "还没有历史数据：$csv"; return }
    $rows = @(Import-Csv -LiteralPath $csv)
    Write-Host ""
    Write-Host "=== SMART 历史（$($rows.Count) 个数据点） ==="
    $rows | Select-Object timestamp, health_pct, percent_used, written_TB, avail_spare,
                            critical_warning, temp_C, delta_written_GB, GB_per_day,
                            GB_per_on_hour, days_left_est |
            Format-Table -AutoSize | Out-String -Width 220 | Write-Host

    if ($rows.Count -ge 2) {
        $f = $rows[0]; $l = $rows[-1]
        $days = ([datetime]::Parse($l.timestamp) - [datetime]::Parse($f.timestamp)).TotalDays
        $dWr  = [double]$l.written_bytes - [double]$f.written_bytes
        $dOn  = 0.0
        if ($f.on_hours_total -and $l.on_hours_total) {
            $dOn = [double]$l.on_hours_total - [double]$f.on_hours_total
        }
        Write-Host "=== 累计区间（首点 -> 最新点） ==="
        Write-Host ("  跨度          : {0:N2} 天   {1} -> {2}" -f $days, $f.timestamp, $l.timestamp)
        Write-Host ("  写入          : {0:N2} GB" -f ($dWr / $GB))
        if ($dOn -gt 0 -and $days -gt 0) {
            $dutyH = $dOn / $days
            Write-Host ("  开机时长      : {0:N2} 小时   日均 {1:N2} h/天   开机率 {2:N1} %" -f $dOn, $dutyH, (100 * $dutyH / 24))
        }
        if ($days -lt $MinWindowDays) {
            Write-Host ("  跨度不足 {0} 天 -- 暂不外推速率与剩余寿命" -f $MinWindowDays) -ForegroundColor Yellow
            return
        }
        $perDay  = $dWr / $GB / $days
        $perOnH  = $null
        if ($dOn -gt 0) { $perOnH = $dWr / $GB / $dOn }
        Write-Host ("  按日历        : {0:N2} GB/天   <= 分母含开机+关机，偏低" -f $perDay)
        if ($perOnH) {
            Write-Host ("  按开机小时    : {0:N3} GB/开机小时" -f $perOnH)
            Write-Host ("  本窗口开机率  : {0:N1} %   ({1:N2} h / {2:N2} h)" -f (100 * $dOn / ($days * 24)), $dOn, ($days * 24))
            Write-Host "  注: 本窗口开机率不能直接折合到日历 -- perOnH x (dOn/days) 恒等于 perDay，是恒等式、不是新信息。跨窗口的真实日均开机率由每次采集累计，见 CSV 的 duty_hours_per_day。" -ForegroundColor DarkGray
        }
        $used = [double]$l.percent_used
        if ($used -gt 0) {
            $life = [double]$l.written_bytes / ($used / 100.0)
            $rem  = $life - [double]$l.written_bytes
            Write-Host ""
            Write-Host ("  推断全寿命    : {0:N1} TB   (由 {1}% 已用 / {2:N3} TB 写入反推)" -f ($life / $TB), $used, ([double]$l.written_bytes / $TB))
            Write-Host ("  剩余          : {0:N1} TB" -f ($rem / $TB))
            $rate = $null; $tag = $null
            if ($perOnH -and $DutyHoursPerDay -gt 0) {
                $rate = $perOnH * $DutyHoursPerDay
                $tag  = ('开机口径, 假设 {0:N2} h/天' -f $DutyHoursPerDay)
            } elseif ($perDay -gt 0) {
                $rate = $perDay
                $tag  = '日历口径, 按本窗口开机率'
            }
            if ($rate -gt 0) {
                Write-Host ("  按此速率剩余  : {0:N0} 天 约 {1:N2} 年   [{2}]" -f ($rem / $GB / $rate), ($rem / $GB / $rate / 365), $tag) -ForegroundColor Yellow
            } else {
                Write-Host "  剩余天数: 不可算 -- 加 -DutyHoursPerDay <小时> 指定开机习惯后重跑" -ForegroundColor Yellow
            }
        }
    }
    return
}

# ---------------------------------------------------------------- 1. refresh
if (-not $NoRefresh -and (Test-Path $exe)) {
    $t0 = if (Test-Path $src) { (Get-Item $src).LastWriteTime } else { [datetime]::MinValue }
    Start-Process -FilePath $exe -ArgumentList '/CopyExit' -Wait -WindowStyle Hidden
    Start-Sleep -Seconds 2
    $t1 = if (Test-Path $src) { (Get-Item $src).LastWriteTime } else { [datetime]::MinValue }
    if ($t1 -le $t0) { Write-Warning "DiskInfo.txt 未刷新 -- CDI 可能没拿到管理员权限，本次读到的是旧数据" }
}
if (-not (Test-Path $src)) { throw "找不到 $src" }

# ---------------------------------------------------------------- 2. parse
$txt = [System.IO.File]::ReadAllText($src, [System.Text.Encoding]::UTF8)
$cw    = Get-SmartRaw $txt '01'
$tempK = Get-SmartRaw $txt '02'
$spare = Get-SmartRaw $txt '03'
$thr   = Get-SmartRaw $txt '04'
$dup   = Get-SmartRaw $txt '05'
$dur   = Get-SmartRaw $txt '06'
$duw   = Get-SmartRaw $txt '07'
$poc   = Get-SmartRaw $txt '0B'
$poh   = Get-SmartRaw $txt '0C'
$unsf  = Get-SmartRaw $txt '0D'

$writtenB = if ($null -ne $duw) { $duw * $DU } else { $null }
$readB    = if ($null -ne $dur) { $dur * $DU } else { $null }
$model  = Get-Plain $txt 'Model'
$serial = Get-Plain $txt 'Serial Number'
$health = Get-Plain $txt 'Health Status'
$hostW  = Get-FirstInt (Get-Plain $txt 'Host Writes')
$hostR  = Get-FirstInt (Get-Plain $txt 'Host Reads')
$healthPct = $null
if ($health) {
    $m = [regex]::Match($health, '(\d+)\s*%')
    if ($m.Success) { $healthPct = [int]$m.Groups[1].Value }
}
$ts    = Get-Date
$tsIso = $ts.ToString('s')

# ---------------------------------------------------------------- 3. previous
$prev = $null; $allRows = @()
if (Test-Path $csv) {
    $allRows = @(Import-Csv -LiteralPath $csv)
    if ($allRows.Count -gt 0) { $prev = $allRows[-1] }
}

# ---------------------------------------------------------------- 4. on-hours
$prevTs = if ($prev) { [datetime]::Parse($prev.timestamp) } else { $ts.AddDays(-1) }
$onH    = Get-OnHours $prevTs $ts
$onHTot = if ($prev -and $prev.on_hours_total) { [double]$prev.on_hours_total + [double]$onH } else { [double]$onH }

# 日均开机小时：显式参数优先，否则从历史累计 sum(on_hours)/sum(delta_days)
$dutyHours = $null; $dutySrc = $null
if ($DutyHoursPerDay -gt 0) {
    $dutyHours = [math]::Round($DutyHoursPerDay, 2); $dutySrc = 'param'
} else {
    $sOn = 0.0; $sDay = 0.0; $n = 0
    foreach ($r in $allRows) {
        if ($r.on_hours -and $r.delta_days) {
            $dd = [double]$r.delta_days
            if ($dd -gt 0) { $sOn += [double]$r.on_hours; $sDay += $dd; $n++ }
        }
    }
    if ($n -gt 0 -and $sDay -gt 0) {
        $dutyHours = [math]::Round($sOn / $sDay, 2); $dutySrc = "hist($n 个窗口)"
    }
}

# ---------------------------------------------------------------- 5. deltas
$deltaB = $null; $deltaDays = $null; $gbPerDay = $null
$gbPerOnH = $null; $gbPerDutyDay = $null; $pctPerDay = $null; $windowTooShort = $false
if ($prev -and $prev.written_bytes -and $writtenB) {
    $deltaB    = [double]$writtenB - [double]$prev.written_bytes
    $deltaDays = ($ts - $prevTs).TotalDays
    if ($deltaDays -ge $MinWindowDays) {
        $gbPerDay = [math]::Round($deltaB / $GB / $deltaDays, 2)
        if ($null -ne $dup -and $prev.percent_used) {
            $pctPerDay = [math]::Round(([double]$dup - [double]$prev.percent_used) / $deltaDays, 4)
        }
    } else {
        $windowTooShort = $true
    }
    # 修正 [1]：开机内速率门槛用独立的 $MinOnHours，不再拿 $MinWindowDays*24 去卡
    if ($onH -and $onH -ge $MinOnHours -and $onH -gt 0) {
        $gbPerOnH = [math]::Round($deltaB / $GB / $onH, 3)
    }
    if ($gbPerOnH -and $dutyHours -and $dutyHours -gt 0) {
        $gbPerDutyDay = [math]::Round($gbPerOnH * $dutyHours, 2)
    }
}

$lifeTB = $null; $remTB = $null; $daysLeft = $null; $daysLeftCal = $null
if ($dup -and $dup -gt 0 -and $writtenB) {
    $lifeB  = [double]$writtenB / ($dup / 100.0)
    $lifeTB = [math]::Round($lifeB / $TB, 2)
    $remTB  = [math]::Round(($lifeB - [double]$writtenB) / $TB, 2)
    # 修正 [2]：主口径 = 开机折合（GB_per_duty_day），不再是墙钟摊薄的 GB_per_day
    if ($gbPerDutyDay -and $gbPerDutyDay -gt 0) {
        $daysLeft = [math]::Round(($lifeB - [double]$writtenB) / $GB / $gbPerDutyDay, 0)
    }
    if ($gbPerDay -and $gbPerDay -gt 0) {
        $daysLeftCal = [math]::Round(($lifeB - [double]$writtenB) / $GB / $gbPerDay, 0)
    }
}

# ---------------------------------------------------------------- 6. persist
Sync-CsvSchema $csv $Schema
$stamp    = $ts.ToString('yyyy-MM-dd_HHmmss')
$snapFile = Join-Path $snapD "DiskInfo_$stamp.txt"
Copy-Item -LiteralPath $src -Destination $snapFile -Force

$row = [pscustomobject]@{
    timestamp        = $tsIso
    model            = $model
    serial           = $serial
    health_pct       = $healthPct
    percent_used     = $dup
    avail_spare      = $spare
    avail_spare_thr  = $thr
    critical_warning = $cw
    written_bytes    = $writtenB
    written_TB       = if ($writtenB) { [math]::Round([double]$writtenB / $TB, 3) } else { $null }
    read_TB          = if ($readB)    { [math]::Round([double]$readB / $TB, 3) }    else { $null }
    host_writes_GB   = $hostW
    host_reads_GB    = $hostR
    temp_C           = if ($tempK) { $tempK - 273 } else { $null }
    power_on_hours   = $poh
    power_on_count   = $poc
    unsafe_shutdowns = $unsf
    on_hours         = $onH
    on_hours_total   = $onHTot
    delta_written_GB = if ($deltaB) { [math]::Round($deltaB / $GB, 2) } else { $null }
    delta_days       = if ($deltaDays) { [math]::Round($deltaDays, 3) } else { $null }
    GB_per_day       = $gbPerDay
    GB_per_on_hour   = $gbPerOnH
    duty_hours_per_day = $dutyHours
    GB_per_duty_day  = $gbPerDutyDay
    pct_used_per_day = $pctPerDay
    life_TB_est      = $lifeTB
    remain_TB_est    = $remTB
    days_left_est    = $daysLeft
    days_left_cal    = $daysLeftCal
    snapshot         = $snapFile
}
$row | Export-Csv -LiteralPath $csv -Append -NoTypeInformation -Encoding UTF8

# ---------------------------------------------------------------- 7. console
Write-Host ""
Write-Host "=== SMART snapshot $tsIso ==="
Write-Host ("  {0}   (S/N {1})" -f $model, $serial)
Write-Host ("  Health           : {0} %      Percentage Used : {1} %" -f $healthPct, $dup)
Write-Host ("  Written (NAND)   : {0:N3} TB" -f ([double]$writtenB / $TB))
Write-Host ("  Read    (NAND)   : {0:N3} TB" -f ([double]$readB / $TB))
Write-Host ("  Host W / R       : {0:N0} GB / {1:N0} GB" -f $hostW, $hostR)
Write-Host ("  Avail Spare      : {0} %   (threshold {1} %)" -f $spare, $thr)
Write-Host ("  Critical Warning : {0}     Temp : {1} C" -f $cw, ($tempK - 273))
Write-Host ("  POH (不可信)     : {0} h    Power On Count : {1}" -f $poh, $poc)

if ($prev) {
    Write-Host ""
    Write-Host ("  -- vs 上个数据点 ({0}, {1:N3} 天前) --" -f $prevTs.ToString('yyyy-MM-dd HH:mm'), $deltaDays)
    Write-Host ("  写入增量         : {0:N2} GB" -f ($deltaB / $GB))
    if ($onH) {
        Write-Host ("  区间内开机时长   : {0:N2} 小时   占该窗口 {1:N1} %" -f $onH, (100 * $onH / ($deltaDays * 24)))
    }
    if ($windowTooShort) {
        Write-Host ("  墙钟间隔不足 {0} 天 -- 本次不算日历口径" -f $MinWindowDays) -ForegroundColor Yellow
    } else {
        if ($gbPerDay) { Write-Host ("  日历口径速率     : {0:N2} GB/天    <= 分母含关机，会低估" -f $gbPerDay) }
        if ($pctPerDay) { Write-Host ("  磨损             : {0:N4} %/天" -f $pctPerDay) }
    }
    if ($onH -and $onH -lt $MinOnHours) {
        Write-Host ("  开机时长不足 {0} 小时 -- 本次不算开机内速率" -f $MinOnHours) -ForegroundColor Yellow
    } elseif ($gbPerOnH) {
        Write-Host ("  开机内速率       : {0:N3} GB/开机小时" -f $gbPerOnH)
        if ($gbPerDutyDay) {
            Write-Host ("  折合真实日均     : {0:N2} GB/天   ({1:N3} x 日均开机 {2:N2} h/天, 来源 {3})" -f $gbPerDutyDay, $gbPerOnH, $dutyHours, $dutySrc)
        } else {
            Write-Host ("  日均开机小时     : 未知（历史窗口不够）-- 无法折合到日历") -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  (首个数据点 -- 攒够 2 个才有增量)"
}

if ($lifeTB) {
    Write-Host ""
    Write-Host ("  推断全寿命       : {0:N1} TB      剩余 : {1:N1} TB" -f $lifeTB, $remTB)
    if ($daysLeft) {
        Write-Host ("  按此速率剩余     : {0:N0} 天 约 {1:N2} 年   [开机口径]" -f $daysLeft, ($daysLeft / 365)) -ForegroundColor Yellow
    }
    if ($daysLeftCal) {
        Write-Host ("  日历口径剩余     : {0:N0} 天 约 {1:N2} 年   [高估, 不可用作预期]" -f $daysLeftCal, ($daysLeftCal / 365))
    }
}
Write-Host ""
Write-Host "  历史: $csv"
Write-Host "  快照: $snapFile"
