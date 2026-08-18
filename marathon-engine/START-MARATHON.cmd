@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo   NOMADTIPS3 - MARATHON ENGINE
echo ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20+ was not found.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Running source-truth tests...
call npm test
if errorlevel 1 (
  echo TEST FAILED - engine will not start.
  pause
  exit /b 1
)

echo.
echo Starting Marathon Engine...
echo Monitor: http://127.0.0.1:8791/
echo Detector is OFF unless DETECTOR_ENABLED=true is configured.
echo.
call npm start

pause
