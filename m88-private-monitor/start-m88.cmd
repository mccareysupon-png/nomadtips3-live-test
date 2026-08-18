@echo off
setlocal
cd /d "%~dp0"
title M88 Private Monitor

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js was not found on this PC.
  echo Install Node.js LTS, then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\playwright\package.json" (
  echo Installing M88 Private Monitor dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting M88 Private Monitor...
echo Keep the Chrome window open while the monitor is running.
call npm start

echo.
echo M88 Private Monitor stopped.
pause
