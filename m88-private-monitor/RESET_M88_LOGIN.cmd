@echo off
setlocal
cd /d "%~dp0"
title Reset M88 Local Login
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-login.ps1" reset
echo.
echo Run start-m88.cmd again to enter a new M88 username and password on this PC.
pause
