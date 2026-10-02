Set sh = CreateObject("WScript.Shell")
' 0 = 隐藏窗口, False = 不等待 —— VBS 的 detach 是最可靠的（goat-gateway 的 start-gateway.vbs 同款做法）
sh.Run "cmd /c ""C:\Users\27063\.dsh\_restart-web.cmd""", 0, False
