@echo off
rem 由 agent 写入：延迟重启 dsh web —— 让当前回复先送达前端，再断链重启。
rem 用 ping 而非 timeout 做延迟（timeout 需要可交互控制台，Hidden 窗口下不可靠）。
ping -n 26 127.0.0.1 >nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3080 " ^| findstr LISTENING') do taskkill /PID %%a /T /F >nul 2>&1
ping -n 4 127.0.0.1 >nul
start "" powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\27063\.dsh\launch-dsh.ps1" -Mode Open
