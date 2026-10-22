#Requires -Version 5.1
<#
  fix-desktop-shortcuts-nosandbox.ps1 — 给 DeepSeek Harness 的全部快捷方式补上 --no-sandbox。

  WHY（2026-10-04/06 实测，可复现）
    * 本机账号 `天阙九泉\27063` 非 admin。不带 --no-sandbox 直接跑
      `DeepSeek Harness.exe` ⇒ 立即退出，ExitCode = -2147483645 = 0x80000003 STATUS_BREAKPOINT。
      带 --no-sandbox ⇒ 正常（main + gpu + renderer×N ≈ 6 进程，主窗口出现）。
    * 崩溃点在最底层 sandbox 初始化（C++），**早于** lib/main.js 的
      claimDesktopSingleInstance()（requestSingleInstanceLock / second-instance）。
      ⇒ 症状是「点任务栏图标完全没反应」，且**即使已有实例在跑也不会被激活**。
    * 已排除的常见元凶（都查过、都干净）：IFEO（HKLM/HKCU）、
      Per-app Exploit Protection、AppCompatFlags Layers（HKCU/HKLM）、
      快捷方式/ exe / asar 的 Zone.Identifier（Mark of the Web）。

  三处快捷方式缺一不可（2026-10-06 发现只有开始菜单那个被修过）：
    1) 任务栏 pin ：%APPDATA%\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\DeepSeek Harness.lnk
    2) 桌面       ：%USERPROFILE%\Desktop\工具箱\DeepSeek Harness.lnk
    3) 开始菜单   ：%APPDATA%\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness.lnk

  何时重跑
    * 「更新/重装」app 之后（NSIS 会重建快捷方式，参数丢失 ⇒ 症状回归）
    * 重新 pin 到任务栏之后
    * 现象复查：`& $exe` 无参数启动应立刻退出且 ExitCode = -2147483645

  注意
    * 改完**若任务栏点击行为没变**，重启 explorer.exe 让 pinned 缓存重解析：
      `Stop-Process -Name explorer -Force`（Windows 会自动拉起 shell）。
    * 用 PowerShell 的 `Start-Process <某个.lnk>` 验证会弹「打开文件 - 安全警告」——
      那是 Attachment Manager 对**非 explorer 发起**的 .lnk 启动的确认，
      不是本故障的一部分，别误判。验应用**直接启动 exe + 参数**。
#>
$ErrorActionPreference = 'Continue'
$exe  = 'C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe'
$note = '--no-sandbox'
$w    = New-Object -ComObject WScript.Shell

$targets = @(
  (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\DeepSeek Harness.lnk'),
  (Join-Path $env:USERPROFILE 'Desktop\工具箱\DeepSeek Harness.lnk'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\DeepSeek Harness.lnk')
)

Write-Output ("exe present : " + (Test-Path -LiteralPath $exe))
foreach ($t in $targets) {
  if (-not (Test-Path -LiteralPath $t)) { Write-Output ("SKIP (missing) : " + $t); continue }
  $bak = "$t.bak-nosandbox"
  if (-not (Test-Path -LiteralPath $bak)) { Copy-Item -LiteralPath $t -Destination $bak -Force }
  $l = $w.CreateShortcut($t)
  $before = $l.Arguments
  if ($before -notmatch 'no-sandbox') {
    $l.Arguments = if ([string]::IsNullOrWhiteSpace($before)) { $note } else { "$before $note" }
    $l.Save()
  }
  $c = $w.CreateShortcut($t)
  Write-Output ("OK   : " + $t)
  Write-Output ("       args=[" + $c.Arguments + "]   (was [" + $before + "])")
}
Write-Output ''
Write-Output 'launch check (direct exe, no .lnk => no ShellExecute warning):'
$p = Start-Process -FilePath $exe -ArgumentList $note -PassThru
Start-Sleep -Seconds 35
$all = @(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue)
Write-Output ("       processes = " + $all.Count)
$all | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {
  Write-Output ("       WINDOW hwnd=" + $_.MainWindowHandle + " title=[" + $_.MainWindowTitle + "]")
}
Write-Output '       (note: a window may take ~35s to appear; empty title at 20s is normal)'
