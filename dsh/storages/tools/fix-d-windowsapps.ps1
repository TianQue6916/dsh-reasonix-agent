# fix-d-windowsapps.ps1 — 确认并移除 D:\WindowsApps 这个坏 reparse point（junction）
# 判据：只有「是 reparse point 且目标解析不出来」才删；其余情况一律只读报告，不动。
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\27063\.dsh\storages\tools\_fix-d-windowsapps.log'
function W($s) { $s | Tee-Object -FilePath $log -Append }
Set-Content -LiteralPath $log -Value ("=== " + (Get-Date).ToString('s') + " ===")
$p = 'D:\WindowsApps'
$i = Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue
if (-not $i) { W "NOT FOUND: $p"; exit 0 }
W ("Attributes : " + $i.Attributes)
$isReparse = ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
$isDir     = ($i.Attributes -band [IO.FileAttributes]::Directory)    -ne 0
W "IsDir=$isDir IsReparsePoint=$isReparse"
W "--- fsutil reparsepoint query ---"
$fs = & fsutil reparsepoint query $p 2>&1
$fs | ForEach-Object { W ("  " + $_) }
if (-not $isReparse) { W "ABORT: 不是 reparse point，可能是真目录，不动"; exit 3 }
$resolves = Test-Path -LiteralPath (Join-Path $p '*')
W "target_resolves=$resolves"
if ($resolves) {
  W "ABORT: 目标可解析（不是断链），按约定不删；前几个条目："
  Get-ChildItem -LiteralPath $p -Force -ErrorAction SilentlyContinue | Select-Object -First 5 |
    ForEach-Object { W ("  " + $_.Name) }
  exit 4
}
W "--- removing junction (rmdir 只删链接，不进入目标) ---"
$out = & cmd /c rmdir "$p" 2>&1
$out | ForEach-Object { W ("  " + $_) }
W ("after: Test-Path = " + (Test-Path -LiteralPath $p))
W ("after: fsutil = " + ((& fsutil reparsepoint query $p 2>&1) -join ' '))
W "=== done ==="
