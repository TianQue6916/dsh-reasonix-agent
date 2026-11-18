$ErrorActionPreference = "Stop"
$out = "C:\Users\27063\.dsh\logs\set-metric-out.txt"
$lines = @()
try {
  $lines += "=== 改前 ==="
  $lines += (Get-NetIPInterface -AddressFamily IPv4 | Where-Object InterfaceAlias -eq "Radmin VPN" | Select-Object InterfaceAlias, InterfaceMetric | Format-Table -AutoSize | Out-String)
  Set-NetIPInterface -InterfaceAlias "Radmin VPN" -InterfaceMetric 9999
  $lines += "=== 改后 ==="
  $lines += (Get-NetIPInterface -AddressFamily IPv4 | Where-Object InterfaceAlias -eq "Radmin VPN" | Select-Object InterfaceAlias, InterfaceMetric | Format-Table -AutoSize | Out-String)
  $lines += "=== 默认路由 ==="
  $lines += (Get-NetRoute -DestinationPrefix "0.0.0.0/0" | Select-Object InterfaceAlias, NextHop, RouteMetric, InterfaceMetric | Sort-Object InterfaceMetric | Format-Table -AutoSize | Out-String)
  $lines += "=== Radmin 直连网段（游戏用，应仍在）==="
  $lines += (Get-NetRoute -InterfaceAlias "Radmin VPN" | Where-Object { $_.DestinationPrefix -match '^26\.' } | Select-Object DestinationPrefix, NextHop | Format-Table -AutoSize | Out-String)
  $lines += "RESULT: OK"
} catch {
  $lines += ("RESULT: FAIL " + $_.Exception.Message)
}
$lines -join "`r`n" | Out-File -FilePath $out -Encoding utf8
