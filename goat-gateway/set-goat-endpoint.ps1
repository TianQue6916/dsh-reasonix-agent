<#
  set-goat-endpoint.ps1 — 在「直连 GOAT 官方」与「经本机 goat-gateway」之间切换。

  它同时改两处（保持 reasonix 与 dsh 一致）：
    1. reasonix  C:\Users\<user>\AppData\Roaming\reasonix\config.toml
                 （commandcode-goat provider 的 base_url / chat_url / request_url）
    2. dsh       C:\Users\<user>\.dsh\settings.yaml
                 （llm-pi-ai.providers.commandcode-goat.baseURL）

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File .\set-goat-endpoint.ps1 -Mode gateway
    powershell -NoProfile -ExecutionPolicy Bypass -File .\set-goat-endpoint.ps1 -Mode direct
    powershell -NoProfile -ExecutionPolicy Bypass -File .\set-goat-endpoint.ps1 -Mode gateway -DryRun

  改动前自动备份为 <原文件>.bak-goatgateway-<时间戳>。
  注意：reasonix / dsh 都是启动时读配置，切完需重启对应程序才生效。
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet('gateway', 'direct')][string]$Mode,
  [string]$GatewayUrl = 'http://127.0.0.1:8788/v1',
  [string]$DirectUrl = 'https://api.commandcode.ai/provider/v1',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$from = if ($Mode -eq 'gateway') { $DirectUrl } else { $GatewayUrl }
$to = if ($Mode -eq 'gateway') { $GatewayUrl } else { $DirectUrl }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

Write-Host ""
Write-Host "goat-endpoint: $Mode   ($from  ->  $to)" -ForegroundColor Cyan
Write-Host ""

$targets = @(
  @{ Name = 'reasonix'; Path = Join-Path $env:APPDATA 'reasonix\config.toml' },
  @{ Name = 'dsh'; Path = Join-Path $env:USERPROFILE '.dsh\settings.yaml' }
)

foreach ($t in $targets) {
  if (-not (Test-Path $t.Path)) {
    Write-Host ("[skip] {0,-8} 找不到 {1}" -f $t.Name, $t.Path) -ForegroundColor Yellow
    continue
  }
  $text = [IO.File]::ReadAllText($t.Path)
  $count = ([regex]::Matches($text, [regex]::Escape($from))).Count

  if ($count -eq 0) {
    if ($text.Contains($to)) {
      Write-Host ("[ok]   {0,-8} 已经是目标端点" -f $t.Name) -ForegroundColor Green
    }
    else {
      Write-Host ("[warn] {0,-8} 未找到 {1} —— 未改动，请人工确认" -f $t.Name, $from) -ForegroundColor Yellow
    }
    continue
  }

  if ($DryRun) {
    Write-Host ("[dry]  {0,-8} 将替换 {1} 处" -f $t.Name, $count) -ForegroundColor DarkCyan
    continue
  }

  Copy-Item $t.Path "$($t.Path).bak-goatgateway-$stamp" -Force
  [IO.File]::WriteAllText($t.Path, $text.Replace($from, $to), (New-Object Text.UTF8Encoding($false)))
  Write-Host ("[done] {0,-8} 替换 {1} 处  备份: {2}" -f $t.Name, $count, (Split-Path $t.Path -Leaf) + ".bak-goatgateway-$stamp") -ForegroundColor Green
}

Write-Host ""
if (-not $DryRun) {
  Write-Host "提示：reasonix 与 dsh 需重启后生效。" -ForegroundColor DarkGray
  if ($Mode -eq 'gateway') {
    Write-Host "     网关自身：powershell -File .\watchdog.ps1  或 schtasks /run /tn Goat-Gateway" -ForegroundColor DarkGray
  }
}
