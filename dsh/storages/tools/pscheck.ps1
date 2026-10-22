param([Parameter(Mandatory=$true)][string]$Path)
$e = $null
[void][System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw -LiteralPath $Path), [ref]$e)
if ($e.Count -eq 0) { "SYNTAX OK" } else { $e | ForEach-Object { "ERR line $($_.Token.StartLine): $($_.Message)" } }
