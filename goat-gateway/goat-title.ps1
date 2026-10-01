# goat-title.ps1 -- 把 GOAT 套餐额度写进 Reasonix 窗口标题（常驻，每 20 秒刷新）
# 数据源：quota-http.mjs（http://127.0.0.1:8790/quota）。不改 Reasonix 任何文件，只改窗口标题。
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -Namespace WT2 -Name Api -MemberDefinition @"
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool SetWindowText(IntPtr h, string s);
"@
$endpoint = 'http://127.0.0.1:8790/quota'
while ($true) {
  try {
    $q = Invoke-RestMethod $endpoint -TimeoutSec 25
    $rows = @($q.rows | Where-Object { $_ -and -not $_.error })
    if ($rows.Count -gt 0) {
      $p5 = [math]::Round((($rows | ForEach-Object { 100 * [double]$_.fiveHourUsed / [double]$_.fiveHourCap }) | Measure-Object -Maximum).Maximum)
      $pw = [math]::Round((($rows | ForEach-Object { 100 * [double]$_.weeklyUsed / [double]$_.weeklyCap }) | Measure-Object -Maximum).Maximum)
      $pm = [math]::Round((($rows | ForEach-Object { 100 * [double]$_.monthUsed / [double]$_.monthCap }) | Measure-Object -Maximum).Maximum)
      $title = "Reasonix  —  GOAT 5h $p5%  周 $pw%  月 $pm%"
      Get-Process -Name 'Reasonix' -EA SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } |
        ForEach-Object { [void][WT2.Api]::SetWindowText($_.MainWindowHandle, $title) }
    }
  } catch {}
  Start-Sleep -Seconds 20
}