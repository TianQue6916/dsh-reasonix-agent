$ErrorActionPreference = 'Stop'
$log = "$env:USERPROFILE\.dsh\logs\elev-apply-fixes.log"
function W($m) { "$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) $m" | Out-File -FilePath $log -Append -Encoding utf8 }
W "=== start ==="
$pairs = @(
  @{ src = "$env:USERPROFILE\Documents\修复产出\prob_chunk03_p101-150.bilingual.md"; dst = "$env:USERPROFILE\Desktop\课程文件\未学课程\概率导论\book\prob_chunk03_p101-150.bilingual.md" },
  @{ src = "$env:USERPROFILE\Documents\修复产出\L13.bilingual.md"; dst = "$env:USERPROFILE\Desktop\课程文件\100b实分析\01-讲义笔记  准备打印\L13.bilingual.md" },
  @{ src = "$env:USERPROFILE\Documents\修复产出\Lec01.bilingual.md"; dst = "$env:USERPROFILE\Desktop\课程文件\未学课程\概率导论\lecture最终版\Lec01.bilingual.md" },
  @{ src = "$env:USERPROFILE\Documents\修复产出\TBB-AllChapters-Portrait_part005_p201-250.bilingual.md"; dst = "$env:USERPROFILE\Desktop\课程文件\100b实分析\split\TBB-AllChapters-Portrait_part005_p201-250.bilingual.md" }
)
$ok = 0
foreach ($p in $pairs) {
  try {
    if (-not (Test-Path $p.src)) { W "MISSING src: $($p.src)"; continue }
    if (-not (Test-Path $p.dst)) { W "MISSING dst: $($p.dst)"; continue }
    $bak = "$($p.dst).bak-20261028-pre-fix"
    if (-not (Test-Path $bak)) { Copy-Item $p.dst $bak -Force; W "backup -> $bak" }
    Copy-Item $p.src $p.dst -Force
    $a = (Get-Item $p.src).Length; $b = (Get-Item $p.dst).Length
    W "copied $(Split-Path $p.dst -Leaf) src=$a dst=$b"
    if ($a -eq $b) { $ok++ } else { W "SIZE MISMATCH" }
  } catch { W "ERR $($_.Exception.Message)" }
}
W "=== done ok=$ok/4 ==="
