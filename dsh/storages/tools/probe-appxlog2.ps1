$log = 'C:\Users\27063\.dsh\storages\tools\_probe-appxlog2.log'
Set-Content -LiteralPath $log -Value ("=== " + (Get-Date).ToString('s') + " ===")
function W([string]$s) { Add-Content -LiteralPath $log -Value $s }
foreach ($aid in '67e619ba-6a8c-0009-e1b3-03688c6add01','67e619ba-6a8c-000a-3990-41688c6add01') {
  W ("--- ActivityID $aid ---")
  try {
    Get-AppPackageLog -ActivityID $aid -ErrorAction Stop | ForEach-Object { W ("  [" + $_.Level + "] " + $_.Message) }
  } catch { W ("  ERR: " + $_.Exception.Message) }
  W ""
}
