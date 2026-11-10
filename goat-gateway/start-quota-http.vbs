' start-quota-http.vbs -- launch the quota HTTP endpoint with no console window
Set sh = CreateObject("WScript.Shell")
' 2026-11-09：原来 sh.Run(node, 0, False) 会把 stdout/stderr 全部丢弃 —— 进程
' 静默消失后无从查证。改成 cmd /c 带追加重定向，崩溃信息留在 logs/quota-http.out.log。
sh.Run "cmd /c """"C:\Program Files\nodejs\node.exe"" ""D:\Toolbox\goat-gateway\quota-http.mjs"" >> ""D:\Toolbox\goat-gateway\logs\quota-http.out.log"" 2>&1""", 0, False
