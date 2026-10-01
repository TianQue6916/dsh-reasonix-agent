param([string]$Path)
$errs = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$null, [ref]$errs)
if ($errs.Count) { $errs | ForEach-Object { 'PARSE ERROR: ' + $_.Message }; exit 1 }
'PS syntax OK'
