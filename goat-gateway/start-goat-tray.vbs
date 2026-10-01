' start-goat-tray.vbs -- launch the GOAT quota desktop widget with no console window
' (Windows Terminal as default host makes -WindowStyle Hidden unreliable; wscript avoids it)
Option Explicit
Dim fso, sh, dir
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = dir
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\goat-tray.ps1""", 0, False
