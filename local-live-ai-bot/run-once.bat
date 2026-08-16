@echo off
setlocal
cd /d "%~dp0"

if not exist config.json copy /Y config.example.json config.json >nul
node src\index.mjs --once
pause
