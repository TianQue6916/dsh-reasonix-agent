# test-argv.ps1 -- 用与 apply-silent-tasks.ps1 完全相同的 Q() 生成 wscript 命令行，
# 再通过 ProcessStartInfo（等价于 Task Scheduler 的 CreateProcess lpCommandLine）
# 启动，验证子进程收到的 argv 与原始 args 逐字节一致。
$ErrorActionPreference = "Stop"

$D   = "C:\Users\27063\.dsh\backup\tasks"
$VBS = "C:\Users\27063\.dsh\storages\tools\run-hidden-exe.vbs"
$WSH = "C:\Windows\System32\wscript.exe"
$PY  = "C:\Users\27063\AppData\Local\Programs\Python\Python313\python.exe"
$CMD = "C:\Windows\System32\cmd.exe"

function Q([string]$s) {
  if ([string]::IsNullOrEmpty($s)) { return '""' }
  '"' + ($s -replace '"', '""') + '"'
}

function RunViaWscript([string]$exePath, [string]$argStr, [string]$tag) {
  $inner = (Q $exePath)
  if ($argStr) { $inner = $inner + ' ' + $argStr }
  $line = (Q $VBS) + ' ' + (Q $inner)
  "--- $tag"
  "    cmdline: wscript.exe $line"
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $WSH
  $psi.Arguments = $line
  $psi.UseShellExecute = $false
  $p = [System.Diagnostics.Process]::Start($psi)
  $p.WaitForExit()
  "    wscript exit: $($p.ExitCode)"
  return $line
}

# t1: GitHub-Mirror-Agent 形态（args 里嵌了一对引号）
$a1 = ('"{0}" t1 -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "D:\80-系统\Toolbox\gh-accel\watch-agent.ps1"' -f "$D\argvdump.py")
RunViaWscript $PY $a1 "t1"

# t2: ocr_p002 形态（-Command "..." 整段，内含单引号与重定向符号）
$a2 = ('"{0}" t2 -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Set-Location ''C:\Users\27063''; & ''x.exe'' ''y.py'' 1> ''a.log'' 2> ''b.err''"' -f "$D\argvdump.py")
RunViaWscript $PY $a2 "t2"

# t3: pvz-lab-probe 形态（cmd /c + 引号 + 重定向）
$t3out = Join-Path $D "t3.out"
Remove-Item $t3out -ErrorAction SilentlyContinue
$a3 = ('/c echo hello-world > "{0}"' -f $t3out)
RunViaWscript $CMD $a3 "t3"

""
"=== argv-t1.json ==="
if (Test-Path "$D\argv-t1.json") { Get-Content "$D\argv-t1.json" -Raw } else { "MISSING" }
"=== argv-t2.json ==="
if (Test-Path "$D\argv-t2.json") { Get-Content "$D\argv-t2.json" -Raw } else { "MISSING" }
"=== t3.out ==="
if (Test-Path $t3out) { "[" + ((Get-Content $t3out -Raw).Trim()) + "]" } else { "MISSING" }
