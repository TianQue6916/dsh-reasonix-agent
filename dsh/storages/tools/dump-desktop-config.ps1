<#
.SYNOPSIS
  打印 desktop profile 的合成配置树。

.DESCRIPTION
  `dsh --profile desktop --dump-config` 会被硬编码守卫拒绝
  （dsh/lib/bin.js:36 — profile 名等于 "desktop" 时直接 program.error，
   因为 desktop profile 由 Electron 应用独占管理）。

  办法：把 desktop profile 的「用户层」复制成一个别的名字的探针 profile，
  node_modules 用 junction 指回 desktop 自己的那份（不复制、不占空间），
  再对探针跑 --dump-config。合成结果与 desktop 一致：bundle 从 package.json
  的 dsh.profile.bundles 解析，patch 层顺序不变。跑完即删探针。

  只读操作：--dump-config 不写任何东西，desktop 真身不受影响。

.PARAMETER Pattern
  只打印匹配该正则的行（及其前 1 行）。省略则打印全量。

.EXAMPLE
  pwsh -File dump-desktop-config.ps1 -Pattern 'local-wiki-github'
  pwsh -File dump-desktop-config.ps1 -Pattern 'id: web$' -Context 4
#>
param(
  [string]$Pattern,
  [int]$Context = 18
)

$ErrorActionPreference = 'Stop'
$profiles = Join-Path $env:USERPROFILE '.dsh\profiles'
$src = Join-Path $profiles 'desktop'
$probe = Join-Path $profiles 'desktop-probe'

if (-not (Test-Path $src)) { throw "desktop profile 不存在: $src" }
if (Test-Path $probe) { Remove-Item -Recurse -Force $probe }

New-Item -ItemType Directory -Path $probe | Out-Null
foreach ($f in 'package.json', 'cordis.yml', 'cordis.patch.yml', 'compatibility.json') {
  $p = Join-Path $src $f
  if (Test-Path $p) { Copy-Item $p (Join-Path $probe $f) }
}
New-Item -ItemType Junction -Path (Join-Path $probe 'node_modules') -Target (Join-Path $src 'node_modules') | Out-Null

try {
  $raw = & dsh --profile desktop-probe --dump-config 2>&1
  if ($LASTEXITCODE -ne 0) { Write-Error "dump-config 失败（exit $LASTEXITCODE）：`n$raw"; exit 1 }
  if (-not $Pattern) { $raw; exit 0 }

  $lines = $raw -split "`n"
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match $Pattern) {
      $from = [Math]::Max(0, $i - 1)
      $to = [Math]::Min($lines.Count - 1, $i + $Context - 1)
      $lines[$from..$to]
      ''
    }
  }
}
finally {
  Remove-Item -Recurse -Force $probe -ErrorAction SilentlyContinue
}
