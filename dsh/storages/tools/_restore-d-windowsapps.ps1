$log = 'C:\Users\27063\.dsh\storages\tools\_restore-d-windowsapps.log'
$o = @("=== " + (Get-Date).ToString('s') + " ===")
$link = 'D:\WindowsApps'
$tgt  = 'D:\80-系统\WindowsApps'
$o += "target exists: " + (Test-Path -LiteralPath $tgt)
if (Test-Path -LiteralPath $link) {
  $i = Get-Item -LiteralPath $link -Force
  $o += "link already exists, attributes: " + $i.Attributes
} else {
  $r = & cmd /c mklink /J "$link" "$tgt" 2>&1
  $o += "mklink: " + ($r -join ' ')
}
$i = Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue
$o += "after: attributes = " + $i.Attributes + "  LinkType = " + $i.LinkType + "  Target = " + ($i.Target -join ';')
$o += "fsutil:"
(& fsutil reparsepoint query $link 2>&1) | ForEach-Object { $o += "   " + $_ }
$o | Set-Content -LiteralPath $log
