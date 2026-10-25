@echo off
setlocal EnableExtensions
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

echo.
echo Checking encrypted local M88 login...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-login.ps1" ensure
if errorlevel 1 (
  echo Local login setup failed.
  pause
  exit /b 1
)

echo.
echo Logging in to M88 using credentials stored on this PC...
node "%~dp0auto-login.mjs"
if errorlevel 1 (
  echo.
  echo M88 auto-login did not complete.
  echo If Chrome showed CAPTCHA, OTP, or verification, complete it and run this file again.
  pause
  exit /b 1
)

echo.
echo Starting M88 Private Monitor collector...
echo Keep the Chrome window open while the monitor is running.
call npm start

echo.
echo M88 Private Monitor stopped.
pause
