<#
  一键回滚 2026-10-04「SSD 写入治理」的全部改动
  ================================================
  背景：KINGSTON OM8TAP41024K1-A00 是 QLC 1TB（TBW 约 110 TB 主机写入），
        实测 ID05(已用寿命) = 17%，本项目用于降低日常写入速率。

  改了什么（本脚本逐项还原）：
    1. 计划任务 DshConfigAutocommit / ReasonixWorkspaceAutocommit / ReasonixMergeContext
       Repetition.Interval: PT20M -> PT2M
    2. HKLM\SOFTWARE\Policies\Microsoft\Edge
       BackgroundModeEnabled / StartupBoostEnabled  -> 删除整个键
    3. HKLM\SOFTWARE\Policies\Microsoft\Windows\DataCollection  -> 删除（AllowTelemetry）
    4. HKLM\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization -> 删除（DODownloadMode）
    5. DiagTrack / DoSvc 服务启动类型 -> Automatic
    6. ~/.dsh/.gitignore -> 从备份还原，并重新跟踪被 rm --cached 的路径

  备份位置：C:\Users\27063\AppData\Local\Temp\dsh-diag\disk-fix-20261004\
  用法：以管理员身份运行此脚本
#>
$bk = "C:\Users\27063\AppData\Local\Temp\dsh-diag\disk-fix-20261004"

Write-Host "`n=== 1) 计划任务: PT20M -> PT2M ===" -ForegroundColor Cyan
foreach($t in @("DshConfigAutocommit","ReasonixWorkspaceAutocommit","ReasonixMergeContext")){
  try{
    $k = Get-ScheduledTask -TaskName $t -EA Stop
    foreach($tr in $k.Triggers){ if($tr.Repetition){ $tr.Repetition.Interval = "PT2M" } }
    Set-ScheduledTask -TaskName $t -Trigger $k.Triggers | Out-Null
    Write-Host "  OK   $t -> PT2M"
  } catch { Write-Host "  FAIL $t : $($_.Exception.Message)" -ForegroundColor Yellow }
}

Write-Host "`n=== 2) 注册表策略: 删除 ===" -ForegroundColor Cyan
foreach($p in @(
  "HKLM:\SOFTWARE\Policies\Microsoft\Edge",
  "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection",
  "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization")){
  if(Test-Path $p){ Remove-Item $p -Recurse -Force -EA SilentlyContinue; Write-Host "  removed $p" }
  else { Write-Host "  absent  $p" }
}

Write-Host "`n=== 3) 服务: 恢复 Automatic ===" -ForegroundColor Cyan
foreach($n in @("DiagTrack","DoSvc","WSearch")){
  try{ Set-Service $n -StartupType Automatic -EA Stop; Start-Service $n -EA Stop; Write-Host "  OK   $n" }
  catch { Write-Host "  FAIL $n : $($_.Exception.Message)" -ForegroundColor Yellow }
}

Write-Host "`n=== 4) git: 还原 .gitignore 并重新跟踪 ===" -ForegroundColor Cyan
Push-Location "C:\Users\27063\.dsh"
if(Test-Path "$bk\gitignore.bak"){
  Copy-Item "$bk\gitignore.bak" ".gitignore" -Force
  git add -A 2>&1 | Out-Null
  git commit -q -m "revert: restore disk-write governance changes (2026-10-04)" 2>&1 | Out-Null
  Write-Host ("  git HEAD = " + (git log --oneline -1))
  Write-Host ("  tracked files = " + (git ls-files | Measure-Object).Count)
} else { Write-Host "  .gitignore 备份缺失, 跳过" -ForegroundColor Yellow }
Pop-Location

Write-Host "`n=== 5) 停止采样器 ===" -ForegroundColor Cyan
Get-Process powershell -EA SilentlyContinue | Where-Object {
  $_.Id -ne $PID -and $_.StartTime -gt (Get-Date).AddHours(-6)
} | ForEach-Object {
  # 只杀跑 sampler 的实例
  $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -EA SilentlyContinue).CommandLine
  if($cl -match "disk-write-sampler"){ Stop-Process -Id $_.Id -Force; Write-Host "  killed sampler pid=$($_.Id)" }
}

Write-Host "`n回滚完成。建议重启一次使服务/策略完全复位。" -ForegroundColor Green
