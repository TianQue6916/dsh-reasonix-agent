$log = 'C:\Users\27063\.dsh\storages\tools\_probe-d-winapps.log'
$o = @()
$o += "=== " + (Get-Date).ToString('s') + " ==="
$p = 'D:\80-系统\WindowsApps'
$o += "exists: " + (Test-Path -LiteralPath $p)
if (Test-Path -LiteralPath $p) {
  $i = Get-Item -LiteralPath $p -Force
  $o += "attributes: " + $i.Attributes
  $k = Get-ChildItem -LiteralPath $p -Force -ErrorAction SilentlyContinue
  $o += "top-level entries: " + ($k | Measure-Object).Count
  $k | Select-Object -First 15 | ForEach-Object { $o += ("   {0,-60} {1}" -f $_.Name, $_.LastWriteTime) }
  $sz = (Get-ChildItem -LiteralPath $p -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum)
  $o += ("total files: {0}   size: {1:N1} MB" -f $sz.Count, ($sz.Sum/1MB))
  $acl = Get-Acl -LiteralPath $p -ErrorAction SilentlyContinue
  $o += "--- ACL ---"
  $acl.Access | ForEach-Object { $o += ("   {0} {1} {2}" -f $_.IdentityReference,$_.FileSystemRights,$_.AccessControlType) }
}
$o | Set-Content -LiteralPath $log
