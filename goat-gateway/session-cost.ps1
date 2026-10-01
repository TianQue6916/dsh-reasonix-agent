<#
  会话开销体检 —— 从 goat-gateway 日志还原每个会话的真实 prompt 体量与缓存命中率。

  为什么需要它：工具输出一旦产生就留在对话历史里，之后每一轮都会被重发。
  所以「这轮为什么这么贵」要看两个数：
    prompt_tokens   本轮真实发送量
    cached_tokens   其中命中前缀缓存的部分
  命中价 ¥0.02019/M  vs  未命中 ¥1.0095/M —— 差约 50 倍，所以命中率比总量更值得盯。

  用法：
    .\session-cost.ps1                     今天的日志，会话概览 + 最贵的轮次
    .\session-cost.ps1 -Session ae49ce4c   某会话逐轮明细（含固定注入占比）
    .\session-cost.ps1 -Date 2026-09-22    指定日期
    .\session-cost.ps1 -Top 30             多看几行
#>
param(
  [string]$LogPath,
  [string]$Date,
  [string]$Session,
  [int]$Top = 15
)

$ErrorActionPreference = 'Stop'
$PRICE_HIT  = 0.02019    # ¥/百万 token，缓存命中
$PRICE_MISS = 1.0095     # ¥/百万 token，未命中

function Get-CostYuan([double]$pt, [double]$cached) {
  return (($pt - $cached) * $PRICE_MISS + $cached * $PRICE_HIT) / 1e6
}
function Get-Miss([double]$pt, [double]$cached) { return $pt - $cached }

if (-not $LogPath) {
  $d = if ($Date) { $Date } else { Get-Date -Format 'yyyy-MM-dd' }
  $LogPath = Join-Path $PSScriptRoot "logs\gateway-$d.log"
}
if (-not (Test-Path $LogPath)) { throw "找不到日志: $LogPath" }

# ── 解析：每轮请求一行，取 prompt_tokens / cached_tokens / 会话指纹 / 耗时 ──
$rows = New-Object System.Collections.Generic.List[object]
foreach ($line in [IO.File]::ReadLines($LogPath)) {
  if ($line -notmatch '"prompt_tokens":(\d+)') { continue }
  # $Matches 是共享状态：每个 -match 都会覆盖它。必须先取出各字段再构造对象，
  # 否则后面的 [int]$Matches[1] 会读到前一次 -match 的结果（sess 指纹）而崩。
  $pt     = [int]$Matches[1]
  $cached = if ($line -match '"cached_tokens":(\d+)') { [int]$Matches[1] } else { 0 }
  $sess   = if ($line -match 'sess=(\S+)')            { $Matches[1] } else { '(unknown)' }
  $ms     = if ($line -match 'status=\d+ (\d+)ms')    { [int]$Matches[1] } else { 0 }
  $ts     = if ($line.Length -ge 24) { $line.Substring(0, 24) } else { '' }
  $rows.Add([pscustomobject]@{ ts = $ts; sess = $sess; pt = $pt; cached = $cached; ms = $ms })
}
if (-not $rows.Count) { throw "日志里没有 usage 记录: $LogPath" }

"日志: $LogPath"
"记录: $($rows.Count) 轮回 usage | 命中 ¥$PRICE_HIT/M, 未命中 ¥$PRICE_MISS/M"

# ── 模式一：单会话逐轮明细 ───────────────────────────────────────────
if ($Session) {
  $g = @($rows | Where-Object { $_.sess -like "$Session*" })
  if (-not $g.Count) { throw "没有匹配 sess=$Session 的记录" }
  $tot = ($g | Measure-Object pt -Sum).Sum
  $hit = ($g | Measure-Object cached -Sum).Sum
  $first = $g[0].pt
  $last  = $g[-1].pt
  ""
  "会话 $($g[0].sess)   共 $($g.Count) 轮"
  "首见 prompt = $('{0:N0}' -f $first)  <- 若这是会话真正的第一轮, 它约等于固定注入"
  "最新 prompt = $('{0:N0}' -f $last)"
  "首见占最新   = $('{0:N1}' -f (100.0 * $first / $last))%"
  "全程命中率   = $('{0:N2}' -f (100.0 * $hit / $tot))%   参考成本 ¥$('{0:N4}' -f (Get-CostYuan $tot $hit))"
  ""
  "{0,-24} {1,10} {2,11} {3,8} {4,8}" -f '时间', 'prompt', 'cached', '命中率', '耗时ms'
  foreach ($r in $g) {
    "{0,-24} {1,10:N0} {2,11:N0} {3,7:N1}% {4,8:N0}" -f $r.ts, $r.pt, $r.cached, (100.0 * $r.cached / $r.pt), $r.ms
  }
  return
}

# ── 模式二：会话概览 ─────────────────────────────────────────────────
$summary = foreach ($g in ($rows | Group-Object sess)) {
  $pts = @($g.Group.pt)
  $tot = ($pts | Measure-Object -Sum).Sum
  $hit = ($g.Group.cached | Measure-Object -Sum).Sum
  [pscustomobject]@{
    session = $g.Name
    rounds  = $g.Count
    first   = $pts[0]
    last    = $pts[-1]
    peak    = ($pts | Measure-Object -Maximum).Maximum
    inRate  = 100.0 * $hit / $tot
    cost    = Get-CostYuan $tot $hit
    inject  = 100.0 * $pts[0] / $pts[-1]
  }
}
""
"{0,-14} {1,5} {2,11} {3,11} {4,7} {5,10} {6,8}" -f 'sess', '轮数', '首见pt', '最新', '命中率', '参考成本¥', '占比'
"-" * 74
foreach ($s in ($summary | Sort-Object last -Descending)) {
  "{0,-14} {1,5} {2,11:N0} {3,11:N0} {4,6:N1}% {5,10:N4} {6,7:N1}%" -f $s.session, $s.rounds, $s.first, $s.last, $s.inRate, $s.cost, $s.inject
}



"注: sess=(unknown) 是 session 策略上线前的旧记录, 无法归属会话。"
"    '首见pt' 只是该会话在本日志里第一次出现的 prompt; 会话若是中途才被记录, 它就不等于固定注入。"
"    要量固定注入的真实大小: 开一个全新会话随便说一句, 再用 -Session <新指纹> 看那一轮。"# ── 最贵的轮次（总量） ───────────────────────────────────────────────
""
"最贵的 $Top 轮（prompt 总量）："
"{0,-24} {1,-12} {2,10} {3,11} {4,8}" -f '时间', 'sess', 'prompt', 'cached', '命中率'
foreach ($r in ($rows | Sort-Object pt -Descending | Select-Object -First $Top)) {
  "{0,-24} {1,-12} {2,10:N0} {3,11:N0} {4,7:N1}%" -f $r.ts, $r.sess, $r.pt, $r.cached, (100.0 * $r.cached / $r.pt)
}

# ── 真正花全价的部分 ─────────────────────────────────────────────────
""
"未命中 token 最多的 $Top 轮（只有这些按全价计费）："
"{0,-24} {1,-12} {2,10} {3,10}" -f '时间', 'sess', 'prompt', '未命中'
foreach ($r in ($rows | Sort-Object { Get-Miss $_.pt $_.cached } -Descending | Select-Object -First $Top)) {
  "{0,-24} {1,-12} {2,10:N0} {3,10:N0}" -f $r.ts, $r.sess, $r.pt, (Get-Miss $r.pt $r.cached)
}