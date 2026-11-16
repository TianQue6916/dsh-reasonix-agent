@echo off
chcp 65001 >nul
title 重装 ds-harness-remote 0.5.22
cd /d "%USERPROFILE%\.dsh\profiles\desktop"
echo ==========================================
echo  ds-harness-remote 重装
echo  前提：DSH Desktop 已完全退出（任务管理器里一个都不剩）
echo  这是纯重装：不修改 package.json，只重建 node_modules 里的包
echo ==========================================
pause
echo.
echo [1/3] 删除损坏的包目录 ...
if exist node_modules\ds-harness-remote rmdir /s /q node_modules\ds-harness-remote
echo.
echo [2/3] pnpm install 重建 ...
call pnpm install
echo.
echo [3/3] 校验 ...
node -e "const p='./node_modules/ds-harness-remote';console.log('version:',require(p+'/package.json').version);console.log('index.js:',require('fs').existsSync(p+'/dist/index.js'));console.log('client.js:',require('fs').existsSync(p+'/dist/client.js'))"
echo.
echo 完成。重新打开 DSH Desktop。
pause
