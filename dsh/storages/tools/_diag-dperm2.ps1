$ErrorActionPreference='Continue'
function T($p){
  $f = Join-Path $p ('__wtest_' + [guid]::NewGuid().ToString('N').Substring(0,8) + '.tmp')
  try { [IO.File]::WriteAllText($f,'x'); Remove-Item $f -Force; "OK    $p" }
  catch { "DENY  $p   :: " + $_.Exception.GetBaseException().Message }
}
T 'D:\'
T 'D:\80-系统'
T 'D:\80-系统\Toolbox'
T 'D:\80-系统\Toolbox\goat-gateway'
T 'D:\Temp'
T 'D:\Toolbox'
T 'D:\Toolbox\goat-gateway'
T 'C:\Users\27063\.dsh\storages\tools'
