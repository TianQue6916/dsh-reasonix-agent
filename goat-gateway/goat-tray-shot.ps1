$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;using System.Runtime.InteropServices;
public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra); }
"@
$log = 'D:\Toolbox\goat-gateway\logs\shot.log'
try {
  Start-Sleep -Milliseconds 400
  [K]::keybd_event(0x2C, 0, 0, [UIntPtr]::Zero)
  [K]::keybd_event(0x2C, 0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 1200
  $img = [System.Windows.Forms.Clipboard]::GetImage()
  if ($img) {
    $out = 'D:\Toolbox\goat-gateway\logs\desktop-shot.png'
    $img.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    "saved $out $($img.Width)x$($img.Height) $((Get-Item $out).Length) bytes" | Out-File $log -Encoding utf8
    $img.Dispose()
  } else { "clipboard empty" | Out-File $log -Encoding utf8 }
} catch { "error: $($_.Exception.Message)" | Out-File $log -Encoding utf8 }
