' start-quota-http.vbs -- launch the quota HTTP endpoint with no console window
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.Run """C:\Program Files\nodejs\node.exe"" ""D:\Toolbox\goat-gateway\quota-http.mjs""", 0, False