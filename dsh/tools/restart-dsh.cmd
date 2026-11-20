@echo off
timeout /t 8 /nobreak >nul
taskkill /F /IM "DeepSeek Harness.exe" >> "%USERPROFILE%\.dsh\logs\restart-dsh.log" 2>&1
timeout /t 6 /nobreak >nul
start "" "C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe"
echo done >> "%USERPROFILE%\.dsh\logs\restart-dsh.log"
rem --- self-cleanup: a fired one-shot task must not keep its StartBoundary ---
rem --- incident 2026-11-19 23:59: task created with /sc once /st 23:59 + /run, ---
rem --- the task survived and fired again at 23:59, killing the live dsh session. ---
schtasks /delete /tn dsh-restart-once /f >nul 2>&1
exit /b 0
