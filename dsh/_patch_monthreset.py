import pathlib

def patch(path, pairs, enc):
    p = pathlib.Path(path)
    with open(p, "r", encoding=enc, newline="") as f:
        raw = f.read()
    for i, (old, new) in enumerate(pairs, 1):
        n = raw.count(old)
        if n != 1:
            raise SystemExit(f"ABORT {path} pair#{i}: expected 1 match, got {n}\n---\n{old[:200]}")
        raw = raw.replace(old, new)
    with open(p, "w", encoding=enc, newline="") as f:
        f.write(raw)
    print(f"OK  patched {path}  ({len(pairs)} replacements)")

PS1 = r"D:\Toolbox\goat-gateway\goat-usage.ps1"
CJS = r"D:\Toolbox\goat-gateway\dsh-plugin-goat-panel\lib\client.js"

ps1_pairs = [
# 1) doc block
("""    GET /alpha/usage/summary     -> 当前计费周期已用额度（totalCredits）
""",
 """    GET /alpha/usage/summary     -> 当前计费周期已用额度（totalCredits）
    GET /alpha/billing/subscriptions -> data.currentPeriodEnd = 月度额度重置时刻（订阅计费周期，
                                    订阅锚定而非自然月；credits 端点完全不提供月窗口时间）
"""),
# 2) Get-Usage body
("""  $summary = Invoke-RestMethod -Uri "$Api/alpha/usage/summary" -Headers $h -TimeoutSec 25 -UseBasicParsing
  [pscustomobject]@{
    fiveHour  = $credits.windowLimits.fiveHour
    weekly    = $credits.windowLimits.weekly
    monthUsed = [double]$summary.totalCredits
    monthLeft = [double]$credits.credits.monthlyCredits
    monthCap  = [double]$summary.totalCredits + [double]$credits.credits.monthlyCredits
    requests  = $summary.totalCount
""",
 """  $summary = Invoke-RestMethod -Uri "$Api/alpha/usage/summary" -Headers $h -TimeoutSec 25 -UseBasicParsing
  # 月度额度不是 rate-limit window：credits 端点里 monthlyCredits 只有余额、**没有任何时间字段**
  # （windowLimits 的成员只有 limited / exceeded / fiveHour / weekly）。月度的重置时间 = 订阅
  # 计费周期的结束时刻，只能从 /alpha/billing/subscriptions 取 currentPeriodEnd。实测两账号都是
  # 「订阅锚定」而非自然月：163 created 2026-09-07 -> 周期 09-07..10-07；qq created 2026-09-03
  # -> 周期 09-03..10-03。该端点失败不致命（key 可能没有订阅），置 $null 由消费方降级。
  $monthReset = $null
  try {
    $sub = Invoke-RestMethod -Uri "$Api/alpha/billing/subscriptions" -Headers $h -TimeoutSec 25 -UseBasicParsing
    $body = if ($null -ne $sub.data) { $sub.data } else { $sub }
    if ($body.currentPeriodEnd) { $monthReset = [DateTimeOffset]::Parse([string]$body.currentPeriodEnd).ToUnixTimeMilliseconds() }
  } catch {}
  [pscustomobject]@{
    fiveHour  = $credits.windowLimits.fiveHour
    weekly    = $credits.windowLimits.weekly
    monthUsed = [double]$summary.totalCredits
    monthLeft = [double]$credits.credits.monthlyCredits
    monthCap  = [double]$summary.totalCredits + [double]$credits.credits.monthlyCredits
    monthReset = $monthReset
    requests  = $summary.totalCount
"""),
# 3) official row nulls
("""          monthUsed = $null; monthLeft = $null; monthCap = $null
""",
 """          monthUsed = $null; monthLeft = $null; monthCap = $null; monthReset = $null
"""),
# 4) goat row assignment
("""        monthUsed = $u.monthUsed; monthLeft = $u.monthLeft; monthCap = $u.monthCap
""",
 """        monthUsed = $u.monthUsed; monthLeft = $u.monthLeft; monthCap = $u.monthCap; monthReset = $u.monthReset
"""),
# 5) Render 本月 line
("""        @{ n = '本月 '; used = $r.monthUsed; cap = $r.monthCap; reset = $null; ex = $null }
""",
 """        @{ n = '本月 '; used = $r.monthUsed; cap = $r.monthCap; reset = $r.monthReset; ex = $null }
"""),
]

cjs_pairs = [
("""                    "\u7a97\u53e3\u91cd\u7f6e\uFF1A5h " + fmtReset(r.fiveHourReset) + " \u00b7 \u5468 " + fmtReset(r.weeklyReset)
""",
 """                    "\u7a97\u53e3\u91cd\u7f6e\uFF1A5h " + fmtReset(r.fiveHourReset) + " \u00b7 \u5468 " + fmtReset(r.weeklyReset)
                    + (r.monthReset ? " \u00b7 \u6708 " + fmtReset(r.monthReset) : "")
"""),
]

patch(PS1, ps1_pairs, "utf-8-sig")
patch(CJS, cjs_pairs, "utf-8")
