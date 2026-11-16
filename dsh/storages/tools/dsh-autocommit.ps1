<#
  dsh-autocommit.ps1 — 让 ~/.dsh 的每次配置/脚本改动都留下一个 commit

  【v2 重写 2026-11-16 —— 修 v1 的静默失效】
    v1 每 5 分钟 `git add -A` 后直接 commit。2026-10-31 加了 pre-commit hook
    （拒绝跨主题混提交）之后，两者正面冲突：`add -A` 必然混 5~7 个域，
    hook 每次都拒绝；而 v1 用 `2>$null` 吞掉错误，照样往日志写一行
    「commit auto: ... head=4f8d196」。HEAD 从来没动过。

    实测后果：2026-11-11 17:25 → 11-16 13:50 零提交，
    5765 个文件（其中 dsh-runtimes 273 MB、tmp/wincu057 一个 npm 包 220 万行）
    卡在暂存区五天，logs/dsh-autocommit.log 攒到 302 KB 假成功记录。

  【v2 行为】
    * 与 hook 共用同一张域表（preset/scratch/session/runtime/toolkit/docs/misc），
      **分域多次提交**，message 带域名 ⇒ hook 永远放行，语义也不丢
    * 每次提交后比对 HEAD 是否真的前进；没前进 ⇒ 记 `!! FAIL`，
      并把状态写进 logs/dsh-autocommit.status（wscript 启动恒返回 0，
      任务计划的 LastTaskResult 看不出来，日志是唯一信号）
    * 文件清单取 `git status --porcelain -uall`（-uall 展开未跟踪目录，
      否则一整个目录会被折叠成一行、分类错位）+ `--pathspec-from-file`
      （5000 个路径会撑爆 32 KB 命令行）
    * 单实例 lock / merge 进行中不介入 / 永不 delete-reset-checkout-push —— 与 v1 相同

  【用法】
    schtasks /Run /TN "DshConfigAutocommit"        手动触发一次
    日志  ~/.dsh/logs/dsh-autocommit.log
    状态  ~/.dsh/logs/dsh-autocommit.status
    撤销  schtasks /Delete /TN "DshConfigAutocommit" /F
#>
$ErrorActionPreference = 'SilentlyContinue'

$DshHome     = 'C:\Users\27063\.dsh'
$Log         = Join-Path $DshHome 'logs\dsh-autocommit.log'
$StatusFile  = Join-Path $DshHome 'logs\dsh-autocommit.status'
$Lock        = Join-Path $DshHome 'logs\dsh-autocommit.lock'
$PathSpec    = Join-Path $env:TEMP 'dsh-autocommit.pathspec'
$AuthorName  = 'Dsh Autosave'
$AuthorEmail = 'autosave@dsh.local'
$DomainOrder = @('preset', 'scratch', 'session', 'runtime', 'toolkit', 'docs', 'misc')

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

function Write-Status([string]$state, [string]$detail) {
  '{0} {1} {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $state, $detail |
    Set-Content -Path $StatusFile -Encoding UTF8
}

# 域分类 —— 必须与 .git/hooks/pre-commit 的 case 分支逐条对应。
# 改这里就要同步改 hook 和 Linux 侧 dsh_autocommit.sh，三处一张表。
function Get-Domain([string]$p) {
  $p = $p.Replace('\', '/')
  switch -regex ($p) {
    '^\.agent-presets/'          { return 'preset' }
    '^profiles/'                 { return 'preset' }
    '^(tmp|storages)/'           { return 'scratch' }
    '^(plans|PLAN\.d|journal)/'  { return 'session' }
    '^(sessions|logs)/'          { return 'runtime' }
    '^(skills|tools)/'           { return 'toolkit' }
    '^wec'                       { return 'toolkit' }
    '^docs/|\.md$'               { return 'docs' }
    default                      { return 'misc' }
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

$exitCode = 0
try {
  $gitdir = (& git -C $DshHome rev-parse --absolute-git-dir 2>$null)
  if (-not $gitdir) { Write-Log 'git rev-parse failed'; Write-Status 'FAIL' 'rev-parse'; exit 0 }

  # 合并 / 变基进行中 → 完全不介入
  foreach ($f in 'MERGE_HEAD','REBASE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD') {
    if (Test-Path (Join-Path $gitdir $f)) { Write-Status 'SKIP' 'merge-in-progress'; exit 0 }
  }

  $raw = @(& git -C $DshHome status --porcelain -uall 2>$null)
  if ($raw.Count -eq 0) { Write-Status 'OK' 'clean'; exit 0 }

  # ---- 分类 ----
  $byDomain = @{}
  foreach ($line in $raw) {
    if ($line.Length -lt 4) { continue }
    $p = $line.Substring(3).Trim()
    if ($p -match '^"(.+)"$') { $p = $Matches[1] }            # 中文/空格路径被 git 加引号
    if ($p -match ' -> (.+)$') { $p = $Matches[1] }           # 重命名取新名字
    $d = Get-Domain $p
    if (-not $byDomain.ContainsKey($d)) {
      $byDomain[$d] = New-Object System.Collections.ArrayList
    }
    [void]$byDomain[$d].Add($p)
  }

  # ---- 分域提交 ----
  $committed = 0
  foreach ($d in $DomainOrder) {
    if (-not $byDomain.ContainsKey($d)) { continue }
    $files = @($byDomain[$d])
    if ($files.Count -eq 0) { continue }

    # 不能用 Set-Content -Encoding UTF8：PowerShell 5.1 会写 BOM，
    # git 把 BOM 当成第一个路径的首字符，于是 add 一个文件都匹配不上（实测踩过）。
    $enc = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($PathSpec, ($files -join "`n"), $enc)
    & git -C $DshHome add --pathspec-from-file=$PathSpec 2>$null | Out-Null
    Remove-Item $PathSpec -Force -ErrorAction SilentlyContinue

    $n = @(& git -C $DshHome diff --cached --name-only 2>$null).Count
    if ($n -eq 0) { continue }

    $before = (& git -C $DshHome rev-parse HEAD 2>$null)
    $msg = 'auto({0}): {1}  ({2} files)' -f $d, (Get-Date -Format 'yyyy-MM-dd HH:mm'), $n
    & git -c "user.name=$AuthorName" -c "user.email=$AuthorEmail" `
           -C $DshHome commit -q -m $msg 2>$null | Out-Null
    $after = (& git -C $DshHome rev-parse HEAD 2>$null)

    if ($after -and ($after.Trim() -ne "$before".Trim())) {
      $committed++
      # 日志行保留 v1 的 ":: file1, file2" 尾巴 —— storages/tools/journal/aggregate.py
      # 的 load_autocommit() 靠它统计「落盘产物」里出现最多的文件名。
      $sample = ($files | Select-Object -First 6) -join ', '
      Write-Log ('commit {0}  head={1}  :: {2}' -f $msg, $after.Trim().Substring(0, 7), $sample)
    } else {
      # v1 就是死在这里却假装成功：commit 返回非 0、HEAD 没动，日志照写 commit。
      $exitCode = 1
      Write-Log ('!! FAIL {0}  head 未前进（hook 拒绝 / 身份缺失），暂存区已回滚' -f $msg)
      & git -C $DshHome reset -q 2>$null | Out-Null
    }
  }

  if ($exitCode -eq 0) { Write-Status 'OK' ('{0} domain commit(s)' -f $committed) }
  else { Write-Status 'FAIL' 'see logs/dsh-autocommit.log' }
  Write-Log ('run done  domains_committed={0}  exit={1}' -f $committed, $exitCode)
} finally {
  Remove-Item $Lock -Force -ErrorAction SilentlyContinue
}

exit $exitCode
