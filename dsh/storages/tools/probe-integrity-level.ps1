# probe-integrity-level.ps1 — 读任意 PID 的 token integrity level（IL）。
# 用途：定位「D 盘不可写 / EPERM」是 DACL 拒绝还是 mandatory integrity level (no-write-up) 拒绝。
# 原理：OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION) -> OpenProcessToken(TOKEN_QUERY)
#       -> GetTokenInformation(TokenIntegrityLevel=25) -> SID S-1-16-<rid>
#       rid: 4096=Low 8192=Medium 12288=High 16384=System
param([string]$NameMatch = 'DeepSeek|node|bash|explorer|powershell|ollama|cmd')

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class TokIL {
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr h, int acc, out IntPtr t);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(int acc, bool inherit, int pid);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr t, int cls, IntPtr info, int len, out int ret);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static string Get(int pid) {
    IntPtr h = OpenProcess(0x1000, false, pid);
    if (h == IntPtr.Zero) return "OPEN_FAIL err=" + Marshal.GetLastWin32Error();
    IntPtr tok;
    if (!OpenProcessToken(h, 0x0008, out tok)) { int e = Marshal.GetLastWin32Error(); CloseHandle(h); return "TOKEN_FAIL err=" + e; }
    IntPtr buf = Marshal.AllocHGlobal(128);
    int ret;
    string res;
    if (GetTokenInformation(tok, 25, buf, 128, out ret)) {
      IntPtr sid = Marshal.ReadIntPtr(buf);
      byte n = Marshal.ReadByte(sid, 1);
      int rid = Marshal.ReadInt32(sid, 8 + 4 * (n - 1));
      string nm = rid == 4096 ? "Low" : rid == 8192 ? "Medium" : rid == 12288 ? "High" : rid == 16384 ? "System" : "Unknown";
      res = "IL=" + nm + " (S-1-16-" + rid + ")";
    } else res = "GETINFO_FAIL err=" + Marshal.GetLastWin32Error();
    Marshal.FreeHGlobal(buf); CloseHandle(tok); CloseHandle(h);
    return res;
  }
}
'@

Get-Process | Where-Object { $_.Name -match $NameMatch } | Sort-Object Id | ForEach-Object {
  "{0,-8} {1,-24} {2}" -f $_.Id, $_.Name, [TokIL]::Get($_.Id)
}
