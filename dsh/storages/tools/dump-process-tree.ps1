# dump-process-tree.ps1 -- elevated dump of full process tree with cmdlines + token IL.
param([switch]$NoElevate)
$Log = Join-Path $env:USERPROFILE '.dsh\logs\process-tree.txt'
function Test-Admin {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if (-not (Test-Admin) -and -not $NoElevate) {
    Write-Host '[*] requesting UAC elevation...'
    try {
        Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-NoElevate') -Verb RunAs -Wait
        "log => $Log"
    } catch { Write-Host "[!] $($_.Exception.Message)" }
    return
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class ILQ {
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint a, bool b, int p);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool OpenProcessToken(IntPtr h, uint a, out IntPtr t);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool GetTokenInformation(IntPtr t, int c, IntPtr i, uint l, out uint r);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  public static int[] Pack(int pid) {
    // returns [integrityRid, isAppContainer, ilRidFromSid]
    int rid = -1, appc = -1;
    IntPtr h = OpenProcess(0x1000, false, pid);
    if (h == IntPtr.Zero) return new int[]{-1,-1};
    IntPtr tok;
    if (!OpenProcessToken(h, 0x0008, out tok)) { CloseHandle(h); return new int[]{-2,-1}; }
    uint len = 0;
    // TokenIsAppContainer = 29
    IntPtr b1 = Marshal.AllocHGlobal(4);
    if (GetTokenInformation(tok, 29, b1, 4, out len)) appc = Marshal.ReadInt32(b1);
    Marshal.FreeHGlobal(b1);
    // TokenIntegrityLevel = 25
    len = 0;
    GetTokenInformation(tok, 25, IntPtr.Zero, 0, out len);
    uint need = (len == 0 ? 64 : len);
    IntPtr buf = Marshal.AllocHGlobal((int)need);
    if (GetTokenInformation(tok, 25, buf, need, out len)) {
      IntPtr sid = Marshal.ReadIntPtr(buf);
      if (sid != IntPtr.Zero) {
        byte cnt = Marshal.ReadByte(sid, 1);
        if (cnt > 0) rid = Marshal.ReadInt32(sid, 8 + 4 * (cnt - 1));
      }
    }
    Marshal.FreeHGlobal(buf); CloseHandle(tok); CloseHandle(h);
    return new int[]{ rid, appc };
  }
}
'@ -ErrorAction SilentlyContinue

function ILName($rid) {
    switch ($rid) { 0 {'Untrusted'} 4096 {'LOW'} 8192 {'Medium'} 8448 {'MediumPlus'} 12288 {'High'} 16384 {'System'} 20480 {'Protected'} -1 {'OpenFail'} -2 {'TokenFail'} default {"RID$rid"} }
}

$procs = Get-CimInstance Win32_Process
$byPid = @{}
foreach ($p in $procs) { $byPid[[int]$p.ProcessId] = $p }

$o = New-Object System.Collections.Generic.List[string]
$o.Add("# process-tree  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  elevated=$((Test-Admin))  total=$($procs.Count)")
$o.Add("# columns: IL | AppContainer | PID <- PPID | NAME | parentName | CMDLINE")
$o.Add('')

foreach ($p in ($procs | Sort-Object ProcessId)) {
    $r = [ILQ]::Pack([int]$p.ProcessId)
    $il = ILName $r[0]
    $ac = switch ($r[1]) { 1 {'APPC'} 0 {'noAC'} default {'?'} }
    $par = $byPid[[int]$p.ParentProcessId]
    $pn = if ($par) { $par.Name } else { '<gone>' }
    $cl = $p.CommandLine
    if ($null -eq $cl) { $cl = '' }
    if ($cl.Length -gt 260) { $cl = $cl.Substring(0, 260) + '...' }
    $o.Add(('{0,-10} {1,-5} {2,7} <- {3,-7} {4,-26} par={5,-26} {6}' -f $il, $ac, $p.ProcessId, $p.ParentProcessId, $p.Name, $pn, $cl))
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Log) | Out-Null
($o -join "`r`n") | Set-Content -LiteralPath $Log -Encoding UTF8
"log => $Log ($((Get-Item $Log).Length) bytes)"
