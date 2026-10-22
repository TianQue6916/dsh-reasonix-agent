# probe-all-il.ps1 -- enumerate EVERY process and read its token integrity level.
# Non-elevated can only see peers; we self-elevate so we see the whole system.
# Output goes to ~/.dsh/logs/all-process-il.txt ; stdout prints only a short digest.
param([switch]$NoElevate)

$Log = Join-Path $env:USERPROFILE '.dsh\logs\all-process-il.txt'
function Test-Admin {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if (-not (Test-Admin) -and -not $NoElevate) {
    Write-Host '[*] requesting UAC elevation...'
    try {
        Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-NoElevate') -Verb RunAs -Wait
        if (Test-Path $Log) { "log => $Log  ($((Get-Item $Log).Length) bytes)"; Get-Content $Log -TotalCount 40 }
    } catch { Write-Host "[!] $($_.Exception.Message)" }
    return
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class ILP {
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint a, bool b, int p);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool OpenProcessToken(IntPtr h, uint a, out IntPtr t);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool GetTokenInformation(IntPtr t, int c, IntPtr i, uint l, out uint r);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  public static int Rid(int pid) {
    IntPtr h = OpenProcess(0x1000, false, pid);
    if (h == IntPtr.Zero) return -1;
    IntPtr tok;
    if (!OpenProcessToken(h, 0x0008, out tok)) { CloseHandle(h); return -2; }
    uint len = 0;
    GetTokenInformation(tok, 25, IntPtr.Zero, 0, out len);
    IntPtr buf = Marshal.AllocHGlobal((int)(len == 0 ? 64 : len));
    int rid = -3;
    if (GetTokenInformation(tok, 25, buf, (uint)(len == 0 ? 64 : len), out len)) {
      IntPtr sid = Marshal.ReadIntPtr(buf);
      if (sid != IntPtr.Zero) {
        byte cnt = Marshal.ReadByte(sid, 1);
        if (cnt > 0) rid = Marshal.ReadInt32(sid, 8 + 4 * (cnt - 1));
      }
    }
    Marshal.FreeHGlobal(buf); CloseHandle(tok); CloseHandle(h);
    return rid;
  }
}
'@ -ErrorAction SilentlyContinue

function ILName($rid) {
    switch ($rid) {
        0      { 'Untrusted' }
        4096   { 'LOW' }
        8192   { 'Medium' }
        8448   { 'MediumPlus' }
        12288  { 'High' }
        16384  { 'System' }
        20480  { 'Protected' }
        -1     { 'OpenFail' }
        -2     { 'TokenFail' }
        -3     { 'InfoFail' }
        default { "RID$rid" }
    }
}

$o = New-Object System.Collections.Generic.List[string]
$o.Add("# probe-all-il  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  elevated=$((Test-Admin))")
$o.Add('')

$rows = @()
foreach ($p in (Get-Process | Sort-Object Id)) {
    $rid = [ILP]::Rid($p.Id)
    $rows += [pscustomobject]@{
        IL   = (ILName $rid)
        Rid  = $rid
        Pid  = $p.Id
        Name = $p.ProcessName
        Ses  = $p.SessionId
    }
}

$o.Add('=== count by integrity level ===')
$rows | Group-Object IL | Sort-Object Count -Descending | ForEach-Object { $o.Add(('{0,-12} {1,5}' -f $_.Name, $_.Count)) }
$o.Add("total processes: $($rows.Count)")
$o.Add('')
$o.Add('=== all processes (IL / pid / session / name) ===')
foreach ($r in ($rows | Sort-Object IL, Pid)) { $o.Add(('{0,-12} {1,7}  s{2}  {3}' -f $r.IL, $r.Pid, $r.Ses, $r.Name)) }

$o.Add('')
$o.Add('=== explorer / session hosts / key system procs ===')
$keys = 'explorer|winlogon|dwm|csrss|lsass|services|svchost|sihost|ctfmon|RuntimeBroker|SearchHost|StartMenuExperienceHost|ShellExperienceHost|Widgets|WmiPrvSE|fontdrvhost|smss|wininit|LogonUI|TextInputHost|SecurityHealth'
foreach ($r in ($rows | Where-Object { $_.Name -match $keys } | Sort-Object Pid)) { $o.Add(('{0,-12} {1,7}  s{2}  {3}' -f $r.IL, $r.Pid, $r.Ses, $r.Name)) }

$o.Add('')
$o.Add('=== dsh family ===')
foreach ($r in ($rows | Where-Object { $_.Name -match 'DeepSeek|node|bash|ollama|pythonw|conhost|powershell|dev-sidecar|FileCoAuth|msedgewebview2' } | Sort-Object Pid)) { $o.Add(('{0,-12} {1,7}  s{2}  {3}' -f $r.IL, $r.Pid, $r.Ses, $r.Name)) }

$o.Add('')
$o.Add('=== whoami /groups (elevated) ===')
try { $o.Add(((& "$env:SystemRoot\System32\whoami.exe" /groups 2>&1) | Out-String).Trim()) } catch { $o.Add("ERR $($_.Exception.Message)") }

$o.Add('')
$o.Add('=== local Administrators ===')
try { Get-LocalGroupMember -Group 'Administrators' | ForEach-Object { $o.Add("  $($_.Name) [$($_.ObjectClass)] src=$($_.PrincipalSource)") } } catch { $o.Add("ERR $($_.Exception.Message)") }

$o.Add('')
$o.Add('=== local Users ===')
try { Get-LocalGroupMember -Group 'Users' | ForEach-Object { $o.Add("  $($_.Name) [$($_.ObjectClass)] src=$($_.PrincipalSource)") } } catch { $o.Add("ERR $($_.Exception.Message)") }

$o.Add('')
$o.Add('=== non-Microsoft / third-party services (running) ===')
try {
    Get-CimInstance Win32_Service | Where-Object { $_.State -eq 'Running' -and $_.PathName -notmatch 'C:\Windows\' } |
        Sort-Object Name | ForEach-Object { $o.Add(('{0,-32} {1}' -f $_.Name, $_.PathName)) }
} catch { $o.Add("ERR $($_.Exception.Message)") }

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Log) | Out-Null
($o -join "`r`n") | Set-Content -LiteralPath $Log -Encoding UTF8
"log => $Log  ($((Get-Item $Log).Length) bytes)"
Get-Content $Log -TotalCount 30
