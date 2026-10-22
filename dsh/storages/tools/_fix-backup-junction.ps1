$ErrorActionPreference = 'Stop'
$link  = 'C:\Users\27063\Desktop\reasonix-ops'
$target= 'C:\Users\27063\Desktop\工具箱\reasonix-ops'
if (Test-Path -LiteralPath $target) { "target OK: $target" } else { "target MISSING: $target"; exit 2 }
if (Test-Path -LiteralPath $link) {
  $it = Get-Item -LiteralPath $link -Force
  "link exists: attrs=$($it.Attributes) target=$($it.Target)"
} else {
  New-Item -ItemType Junction -Path $link -Target $target | Out-Null
  "junction created"
}
$it = Get-Item -LiteralPath $link -Force
"verify: attrs=$($it.Attributes)"
"verify: script-reachable=" + (Test-Path -LiteralPath (Join-Path $link 'backup-to-github.ps1'))
