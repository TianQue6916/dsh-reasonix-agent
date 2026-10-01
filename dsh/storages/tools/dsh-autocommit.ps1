<#
  dsh-autocommit.ps1 — 让 ~/.dsh 的每次配置/脚本改动都留下一个 commit

  【为什么需要它】
    记忆与上下文要"记得自己的 git 状态"，前提是 git 里真的存在那条状态。
    ~/.dsh 原本不在任何版本控制之下：GitHub 备份那条线是 robocopy 到一个
    另外的 repo，那是"快照"不是"历史"，没有 commit 语义，也没法回指。

  【设计 —— 与 reasonix-autocommit.ps1 同源】
    * 只跟踪 .gitignore 白名单内的手写文件（基线 222 个，.git 约 0.8 MB）
    * 单实例：lock 文件 + 10 分钟 stale guard
    * merge / rebase / cherry-pick 进行中 → 跳过（绝不介入）
    * 工作树干净时极速退出
    * 永不 delete / reset / checkout / push

  【用法】
    schtasks /Run /TN "DshConfigAutocommit"        手动触发一次
    日志  ~/.dsh/logs/dsh-autocommit.log
    撤销  schtasks /Delete /TN "DshConfigAutocommit" /F

  【手工看历史】
    git -C $env:USERPROFILE\.dsh log --oneline -20
    git -C $env:USERPROFILE\.dsh show --stat HEAD
#>
$ErrorActionPreference = 'SilentlyContinue'

$DshHome = 'C:\Users\27063\.dsh'
$Log     = Join-Path $DshHome 'logs\dsh-autocommit.log'
$Lock    = Join-Path $DshHome 'logs\dsh-autocommit.lock'
$AuthorName  = 'Dsh Autosave'
$AuthorEmail = 'autosave@dsh.local'

function Write-Log([string]$m) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  $dir = Split-Path $Log
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Add-Content -Path $Log -Value $line -Encoding UTF8
  $fi = Get-Item $Log -ErrorAction SilentlyContinue
  if ($fi -and $fi.Length -gt 512KB) {
    Set-Content -Path $Log -Value (Get-Content $Log -Tail 400) -Encoding UTF8
  }
}

if (-not (Test-Path (Join-Path $DshHome '.git'))) {
  Write-Log ('no git repo at {0}; nothing to do' -f $DshHome)
  exit 0
}

# ---- single instance ----
if (Test-Path $Lock) {
  $age = (Get-Date) - (Get-Item $Lock).LastWriteTime
  if ($age.TotalMinutes -lt 10) { exit 0 }
}
New-Item -ItemType File -Force -Path $Lock | Out-Null

try {
  $gitdir = (& git -C $DshHome rev-parse --absolute-git-dir 2>$null)
  if (-not $gitdir) { Write-Log 'git rev-parse failed'; exit 0 }

  # 合并 / 变基进行中 → 完全不介入
  $blocked = $false
  foreach ($f in 'MERGE_HEAD','REBASE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD') {
    if (Test-Path (Join-Path $gitdir $f)) { $blocked = $true; break }
  }
  if ($blocked) { exit 0 }

  $dirty = @(& git -C $DshHome status --porcelain 2>$null)
  if ($dirty.Count -eq 0) { exit 0 }

  & git -C $DshHome add -A 2>$null | Out-Null
  $staged = @(& git -C $DshHome diff --cached --name-only 2>$null)
  if ($staged.Count -eq 0) { exit 0 }

  $msg = 'auto: {0}  ({1} files)' -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $staged.Count
  & git -c "user.name=$AuthorName" -c "user.email=$AuthorEmail" -C $DshHome commit -q -m $msg 2>$null | Out-Null

  $head = (& git -C $DshHome rev-parse --short HEAD 2>$null)
  $sample = ($staged | Select-Object -First 6) -join ', '
  Write-Log ('commit {0}  head={1}  files={2}  :: {3}' -f $msg, $head, $staged.Count, $sample)
} finally {
  Remove-Item $Lock -Force -ErrorAction SilentlyContinue
}

# 版本控制自检标记（2026-09-28 建立 autocommit 后的一次真实改动，用于验证自动提交链路）
