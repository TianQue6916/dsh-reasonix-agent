@echo off
timeout /t 8 /nobreak >nul
taskkill /F /IM "DeepSeek Harness.exe" >> "%USERPROFILE%\.dsh\logs\restart-dsh.log" 2>&1
timeout /t 6 /nobreak >nul
start "" "C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe"
echo done >> "%USERPROFILE%\.dsh\logs\restart-dsh.log"
