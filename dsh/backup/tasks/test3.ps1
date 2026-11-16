$ErrorActionPreference = "Stop"
$D   = "C:\Users\27063\.dsh\backup\tasks"
$RUN = "C:\Users\27063\.dsh\storages\tools\run-hidden.exe"
$PY  = "C:\Users\27063\AppData\Local\Programs\Python\Python313\python.exe"
$CMD = "C:\Windows\System32\cmd.exe"

function Go([string]$cmdline, [string]$name) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName  = $RUN
  $psi.Arguments = $cmdline
  $psi.UseShellExecute = $false
  $p = [System.Diagnostics.Process]::Start($psi)
  $p.WaitForExit()
  "$name -> launcher exit=$($p.ExitCode)"
}

# tC: ocr_p002 形态（-Command 整段，嵌单引号 + 重定向符）
$c1 = ('"{0}" "{1}\argvdump.py" tC -Command "Set-Location ''C:\Users\27063''; & ''x.exe'' ''y.py'' 1> ''a.log'' 2> ''b.err''"' -f $PY, $D)
Go $c1 "tC"

# tD: GitHub-Mirror-Agent 形态（-File + 空格 + 中文路径）
$c2 = ('"{0}" "{1}\argvdump.py" tD -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "D:\80-系统\Toolbox\gh-accel\watch-agent.ps1"' -f $PY, $D)
Go $c2 "tD"

# tE: cmd /c + 重定向
$tE = Join-Path $D "tE.out"
Remove-Item $tE -ErrorAction SilentlyContinue
$c3 = ('"{0}" /c echo hello-exe > "{1}"' -f $CMD, $tE)
Go $c3 "tE"

# tF: 退出码透传
$c4 = ('"{0}" /c exit 42' -f $CMD)
Go $c4 "tF"

""
"=== argv-tC.json ==="; if (Test-Path "$D\argv-tC.json") { Get-Content "$D\argv-tC.json" -Raw } else { "MISSING" }
"=== argv-tD.json ==="; if (Test-Path "$D\argv-tD.json") { Get-Content "$D\argv-tD.json" -Raw } else { "MISSING" }
"=== tE.out ===";       if (Test-Path $tE) { "[" + (Get-Content $tE -Raw).Trim() + "]" } else { "MISSING" }
