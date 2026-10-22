# 只读探测 + 单文件写测试（不修改任何内容，只验证权限边界）
$ErrorActionPreference='Continue'
$out = 'C:\Users\27063\.dsh\logs\elev-write-probe.log'
function W($m){ Add-Content -Path $out -Value ("{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) -Encoding UTF8 }
W ("=== probe start  elevated=" + ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) + " ===")
$dir='D:\80-系统\Toolbox\goat-gateway'
$f = Join-Path $dir '.__probe.tmp'
try { [IO.File]::WriteAllText($f,'probe'); Remove-Item $f -Force; W "CREATE+DELETE in dir : OK" }
catch { W ("CREATE+DELETE in dir : DENY :: " + $_.Exception.GetBaseException().Message) }
$t = Join-Path $dir 'keys.json'
try { $s=[IO.File]::Open($t,'Open','ReadWrite','None'); $s.Close(); W "OPEN keys.json RW : OK" }
catch { W ("OPEN keys.json RW : DENY :: " + $_.Exception.GetBaseException().Message) }
try { [IO.File]::WriteAllText('D:\Temp\__probe2.tmp','x'); Remove-Item 'D:\Temp\__probe2.tmp' -Force; W "D:\Temp : OK" } catch { W ("D:\Temp : DENY :: " + $_.Exception.GetBaseException().Message) }
W "=== probe end ==="
