@echo off
setlocal
cd /d %~dp0

if not exist .venv (
  py -m venv .venv
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt

if not exist config.json copy /Y config.example.json config.json >nul

echo.
echo Setup complete.
echo 1. Open LM Studio and start Local Server on port 1234.
echo 2. Load one chat model.
echo 3. Run start.bat.
echo.
pause
