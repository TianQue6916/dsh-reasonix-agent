@echo off
ping -n 14 127.0.0.1 >nul
taskkill /IM "DeepSeek Harness.exe" /F /T >nul 2>&1
ping -n 8 127.0.0.1 >nul
start "" "C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe"
