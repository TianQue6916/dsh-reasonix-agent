#Requires -Version 5.1
<#
  upgrade-dsh-0.2.0.ps1 — 把全局 dsh 从 0.1.7-rc.2 升到 0.2.0-rc.2，失败自动回滚。

  【为什么不能直接在会话里跑 npm i -g】
    1) 升级会替换全局 dsh 包，而运行中的 dsh 仍在从磁盘读它的 client bundle
       （dsh-client-modules 每次请求 readFileSync(clientPath)）→ 不重启就是
       server/client 版本错配，刷新页面可能直接崩。
    2) 重启必须发生在 dsh 进程树**之外**。2026-09-30 02:10 实测：从 dsh 内部用
       Start-Process 重启，杀掉旧进程后脚本自己也一起没了，空转 51 分钟。
       所以这里由 Task Scheduler 拉起独立进程。

  【本轮已完成的零副作用预检】
    * 用 0.2.0-rc.2 跑 --dump-config 原本会跳过 4 个插件：
        dsh-mnemon@0.5.16 / dshmarket@1.66.2 / dsh-headroom@0.3.0 / dsh-wechat-bridge@0.9.1
      → 已升级 dsh-mnemon→0.5.20、dshmarket→1.66.6（两者同时兼容 0.1.7 与 0.2.0），
        并对无法升级的两个做了**精确版本豁免**（profiles/web/compatibility.json）：
        dsh-headroom@0.3.0（作者 2026-08-23 后停更，peerDeps 硬上限 <0.2.0-0）
        @lanbaolu/dsh-wechat-bridge@0.9.1（0.9.1 已是最新，尚未适配 0.2.0）
      → 预检结果：**0 个被跳过、stderr 空、rows 414**。
    * 60 个 model 的 reasoningEfforts 在 0.2.0 下完整保留
      （46 个 false + 14 个五档 + 14 个 'off': null）。

  【失败即回滚】任何一步不过 → npm i -g @deepseek-ai/dsh@0.1.7-rc.2，照常启动。

  日志：~/.dsh/logs/upgrade-0.2.0-rc.2.log
#>
param(
  [string]$NewVer = '0.2.0-rc.2',
  [string]$OldVer = '0.1.7-rc.2',
  [int]$Port = 3080
)

$ErrorActionPreference = 'Continue'
$LogDir  = Join-Path $env:USERPROFILE '.dsh\logs'
$Log     = Join-Path $LogDir 'upgrade-0.2.0-rc.2.log'
$null = New-Item -ItemType Directory -Force -Path $LogDir
$DshPkg  = "$env:APPDATA\npm\node_modules\@deepseek-ai\dsh"
$DshBin  = Join-Path $DshPkg 'lib\bin.js'

function L {
  param([string]$M)
  $line = "{0}  {1}" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $M
  Write-Host $line
  Add-Content -LiteralPath $Log -Value $line -Encoding UTF8
}

function Get-InstalledVersion {
  try {
    $json = Get-Content -LiteralPath (Join-Path $DshPkg 'package.json') -Raw
    return ($json | ConvertFrom-Json).version
  } catch { return 'unknown' }
}

L '=========================================================='
L ("升级开始：{0} -> {1}" -f (Get-InstalledVersion), $NewVer)

# ---------- 1) 停掉占用 3080 的 dsh ----------
$conn = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($conn.Count -gt 0) {
  foreach ($procId in ($conn.OwningProcess | Sort-Object -Unique)) {
    L ("停 dsh：PID {0}" -f $procId)
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 4
}
$left = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($left.Count -gt 0) {
  L '⚠ 3080 仍被占用，二次强杀'
  foreach ($procId in ($left.OwningProcess | Sort-Object -Unique)) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 4
}
if (@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count -eq 0) {
  L '3080 已释放'
} else {
  L '⚠ 3080 仍被占用，继续（launch-dsh 的幂等会接管）'
}

# ---------- 2) 安装新版本 ----------
L ("npm i -g @deepseek-ai/dsh@{0}" -f $NewVer)
$npmOut = & npm i -g "@deepseek-ai/dsh@$NewVer" --no-audit --no-fund 2>&1
$npmRc  = $LASTEXITCODE
Add-Content -LiteralPath $Log -Value ($npmOut | Out-String) -Encoding UTF8
L ("npm exit={0}" -f $npmRc)
$nowVer = Get-InstalledVersion
L ("安装后版本 = {0}" -f $nowVer)

if ($nowVer -ne $NewVer) {
  L ("❌ 版本未变成 {0}，判定失败" -f $NewVer)
  $failReason = 'install'
} else {

  # ---------- 3) 零副作用验证：dump-config ----------
  $dcYaml = Join-Path $env:TEMP 'dsh-upgrade-dump.yaml'
  $dcErr  = Join-Path $env:TEMP 'dsh-upgrade-dump.err'
  Remove-Item $dcYaml, $dcErr -ErrorAction SilentlyContinue
  & node $DshBin --profile web --dump-config > $dcYaml 2> $dcErr
  $dcRc = $LASTEXITCODE
  # 注意：不打印 err 内容本身，只计数 —— err 里可能含路径等信息，避免整行回显
  $skipCount = 0
  if (Test-Path $dcErr) {
    $skipCount = @(Get-Content -LiteralPath $dcErr | Where-Object { $_ -like '*skipping profile bundle*' }).Count
  }
  $otherErr = 0
  if (Test-Path $dcErr) {
    $otherErr = @(Get-Content -LiteralPath $dcErr | Where-Object { $_ -notlike '*skipping profile bundle*' -and $_.Trim() -ne '' }).Count
  }
  $dcBytes = 0
  if (Test-Path $dcYaml) { $dcBytes = (Get-Item -LiteralPath $dcYaml).Length }
  L ("dump-config exit={0}  bytes={1}  skipped={2}  other-stderr-lines={3}" -f $dcRc, $dcBytes, $skipCount, $otherErr)

  if ($dcRc -ne 0 -or $skipCount -ne 0 -or $dcBytes -lt 60000) {
    L '❌ dump-config 验证不过（要求 exit=0 且 skipped=0 且 bytes>=60000）'
    $failReason = 'verify'
  } else {
    $failReason = ''
    L '✓ dump-config 验证通过'
  }
}

# ---------- 4) 回滚（仅在失败时） ----------
if ($failReason -ne '') {
  L ("开始回滚到 {0}" -f $OldVer)
  $rb = & npm i -g "@deepseek-ai/dsh@$OldVer" --no-audit --no-fund 2>&1
  Add-Content -LiteralPath $Log -Value ($rb | Out-String) -Encoding UTF8
  L ("回滚后版本 = {0}" -f (Get-InstalledVersion))
}

# ---------- 5) 重放 node_modules patch ----------
# npm i -g 会重装全局 dsh 及其 node_modules，把 dsh-client-ui-chat/lib/client.js 还原，
# 所以 reasoning row 的自动展开补丁必须重放（脚本本身幂等，且锚点丢了会拒绝写入）。
$patch = Join-Path $env:USERPROFILE '.dsh\storages\tools\patch-reasoning-autofold.mjs'
if (Test-Path $patch) {
  L '重放 reasoning-autofold patch'
  $po = & node $patch 2>&1
  Add-Content -LiteralPath $Log -Value ($po | Out-String) -Encoding UTF8
  L ("patch exit={0}" -f $LASTEXITCODE)
} else {
  L "⚠ 找不到 $patch，跳过"
}

# ---------- 6) 启动 ----------
L '启动 dsh（launch-dsh.ps1 -Mode Serve）'
$launcher = Join-Path $env:USERPROFILE '.dsh\launch-dsh.ps1'
$lo = & powershell -NoProfile -ExecutionPolicy Bypass -File $launcher -Mode Serve 2>&1
Add-Content -LiteralPath $Log -Value ($lo | Out-String) -Encoding UTF8
Start-Sleep -Seconds 6
$up = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($up.Count -gt 0) {
  L ("✓ dsh 已在 {0} 监听（PID {1}）" -f $Port, ($up.OwningProcess | Select-Object -First 1))
} else {
  L '⚠ 启动后 3080 未监听 —— 用 -Mode Open 再试一次'
  $lo2 = & powershell -NoProfile -ExecutionPolicy Bypass -File $launcher -Mode Open 2>&1
  Add-Content -LiteralPath $Log -Value ($lo2 | Out-String) -Encoding UTF8
}

L ("结束。最终版本 = {0}  失败原因 = {1}" -f (Get-InstalledVersion), $(if ($failReason -eq '') { '（无）' } else { $failReason }))
L '=========================================================='
