@echo off
chcp 65001 >nul
title ds-harness-remote 0.5.22 to 0.6.4
cd /d "%USERPROFILE%\.dsh\profiles\desktop"
echo ================================================
echo  Upgrading ds-harness-remote to 0.6.4
echo  Make sure DSH Desktop is FULLY CLOSED first
echo ================================================
echo.
call pnpm add ds-harness-remote@0.6.4
echo.
echo ---- installed version ----
node -e "console.log(require('./node_modules/ds-harness-remote/package.json').version)"
echo.
echo Done. Restart DSH Desktop now.
pause
