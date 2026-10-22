#Requires -Version 5.1
<#
  install-smart-snapshot-v2.ps1
  把 smart-snapshot v2 (在 ~/.dsh/storages/tools/) 安装到 D:\Toolbox\smart-snapshot\smart-snapshot.ps1

  为什么要提权：dsh 的 shell 被 sandbox 降为 Low integrity level，Windows 的 no-write-up
  规则使它写不了 D 盘上没打 Low mandatory label 的目录。而 D:\Toolbox 的脚本是
  HIGHEST 计划任务执行的，绝不能给它打 Low label（那等于造一条 Low->High 提权链）。
  所以只能由管理员身份来做这一次复制。

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File install-smart-snapshot-v2.ps1
    powershell ... -File install-smart-snapshot-v2.ps1 -Rollback     # 从备份还原 v1

  日志：~/.dsh/logs/install-smart-snapshot.log
#>
param([switch]$Rollback)
$ErrorActionPreference = 'Stop'

$srcDir = Join-Path $env:USERPROFILE '.dsh\storages\tools'
$new    = Join-Path $srcDir 'smart-snapshot.v2.ps1'
$dstDir = 'D:\Toolbox\smart-snapshot'
$dst    = Join-Path $dstDir 'smart-snapshot.ps1'
$bak    = Join-Path $srcDir 'smart-snapshot.ps1.bak-v1'
$log    = Join-Path $env:USERPROFILE '.dsh\logs\install-smart-snapshot.log'

New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
$out = New-Object System.Collections.Generic.List[string]
function Say([string]$m) { $out.Add($m); Write-Host $m }

try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $pr = New-Object Security.Principal.WindowsPrincipal($id)
    Say ("user={0}  elevated={1}" -f $id.Name, $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))

    if ($Rollback) {
        if (Test-Path $bak) {
            Copy-Item -LiteralPath $bak -Destination $dst -Force
            Say ("ROLLBACK OK: {0} -> {1} ({2} bytes)" -f $bak, $dst, (Get-Item $dst).Length)
        } else { Say ("ROLLBACK FAILED: 找不到备份 " + $bak) }
        return
    }

    if (-not (Test-Path $new))    { throw "找不到源：$new" }
    if (-not (Test-Path $dstDir)) { throw "找不到目标目录：$dstDir" }

    if (Test-Path $dst) {
        Copy-Item -LiteralPath $dst -Destination $bak -Force
        Say ("backup OK: {0} ({1} bytes)" -f $bak, (Get-Item $bak).Length)
    } else { Say "warn: 目标不存在，跳过备份" }

    Copy-Item -LiteralPath $new -Destination $dst -Force
    $i = Get-Item $dst
    Say ("installed: {0} ({1} bytes, mtime {2})" -f $dst, $i.Length, $i.LastWriteTime.ToString('s'))

    $err = $null
    [void][System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw -LiteralPath $dst), [ref]$err)
    Say ("syntax errors = {0}" -f $err.Count)
    foreach ($e in $err) { Say ("  ERR line " + $e.Token.StartLine + ": " + $e.Message) }
    Say ("sha256 = {0}" -f (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash)
    Say ("src sha256 = {0}" -f (Get-FileHash -LiteralPath $new -Algorithm SHA256).Hash)
    Say "RESULT: OK"
} catch {
    Say ("RESULT: FAILED -- " + $_.Exception.Message)
} finally {
    $out | Set-Content -LiteralPath $log -Encoding UTF8
    Write-Host ("log -> " + $log)
}
