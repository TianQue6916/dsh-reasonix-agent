$ErrorActionPreference='Continue'
function Line($s){ Write-Output $s }
Line '--- icacls raw (goat-gateway) ---'
(icacls 'D:\80-系统\Toolbox\goat-gateway') | Select-Object -First 14 | ForEach-Object { Line $_ }
Line ''
Line '--- icacls raw (D:\80-系统) ---'
(icacls 'D:\80-系统') | Select-Object -First 10 | ForEach-Object { Line $_ }
Line ''
Line '--- my token groups (S-1-16*) ---'
$id=[Security.Principal.WindowsIdentity]::GetCurrent()
Line ("Name=" + $id.Name + "  Owner=" + $id.Owner + "  TokenType=" + $id.Token)
foreach($g in $id.Groups){ $t=''; try{$t=$g.Translate([Security.Principal.NTAccount]).Value}catch{}; if($g.Value -like 'S-1-16*' -or $t -match 'Mandatory'){ Line ("  " + $g.Value + "  " + $t) } }
Line ''
Line '--- mandatory label on each dir (via .NET) ---'
foreach($q in @('D:\','D:\80-系统','D:\80-系统\Toolbox','D:\80-系统\Toolbox\goat-gateway','D:\Temp','C:\Users\27063\.dsh')){
  try{
    $sd=(Get-Acl $q).Sddl
    $m=[regex]::Match($sd,'S:\(ML;[^)]*\)')
    Line ("{0}`n    SACL={1}" -f $q, ($(if($m.Success){$m.Value}else{'(none)'})))
  }catch{ Line ("ERR " + $q + " " + $_.Exception.Message) }
}
