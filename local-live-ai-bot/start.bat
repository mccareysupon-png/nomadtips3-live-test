@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 18 or newer is required.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist config.json (
  copy /Y config.example.json config.json >nul
  echo [SETUP] Created config.json from config.example.json
)

echo [1/2] Checking CAR 3.1 and LM Studio...
node src\doctor.mjs
if errorlevel 1 (
  echo.
  echo [STOP] Fix the doctor errors above, then run start.bat again.
  pause
  exit /b 1
)

echo.
echo [2/2] Starting NOMADTIPS3 Local Live AI Bot...
node src\index.mjs

pause
