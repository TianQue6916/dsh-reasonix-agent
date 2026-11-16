#Requires -Version 5.1
<#
  起 web profile 供手机局域网访问（纯 HTTP + polyfill 路线）。
  背景：新版 webserver 拒绝 0.0.0.0（"unspecified wildcard address"），
  而 dsh-web-lan-access 自带的 bundle patch 正是设 0.0.0.0 ⇒ 必须用 CLI flag 覆盖成具体网卡地址。
  polyfill（crypto.randomUUID）由插件在 index.html 注入，HTTP 下也能用。
  幂等：3080 已在监听则直接返回。
#>
param([int]$Port = 3080, [string]$LanHost = '192.168.0.100')

$LogDir  = Join-Path $env:USERPROFILE ".dsh\logs"
$LogFile = Join-Path $LogDir "dsh-web-tailnet.out.log"
$null = New-Item -ItemType Directory -Force -Path $LogDir

function Test-PortBusy { param([int]$P) $null -ne (Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue) }

if (Test-PortBusy $Port) { Write-Host "3080 已在运行（幂等）"; exit 0 }

$env:NODE_OPTIONS = "--use-system-ca"
Remove-Item $LogFile -ErrorAction SilentlyContinue

$args_ = '/c dsh --profile web --patch "C:\Users\27063\.dsh\patches\web-no-wechat.yml" --no-open' +
         ' --port ' + $Port + ' --host ' + $LanHost + ' --trusted-host ' + $LanHost + ':' + $Port +
         ' > "' + $LogFile + '" 2>&1'

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName         = "$env:ComSpec"
$psi.Arguments        = $args_
$psi.WorkingDirectory = "C:\Users\27063"
$psi.UseShellExecute  = $true
$psi.WindowStyle      = 'Hidden'
[void][System.Diagnostics.Process]::Start($psi)

for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Milliseconds 1000
  if (Test-PortBusy $Port) { Write-Host "[ok] 3080 已监听（${i}s）"; exit 0 }
}
Write-Host "[fail] 启动超时，看日志 $LogFile"; exit 1
