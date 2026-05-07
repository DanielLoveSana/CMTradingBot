@echo off
setlocal

set "PROJECT_DIR=%~dp0"
set "HOST=127.0.0.1"
set "PORT=3210"
set "PANEL_URL=http://%HOST%:%PORT%"
set "STATE_URL=%PANEL_URL%/api/state"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  echo Please install Node.js or add it to PATH, then try again.
  pause
  exit /b 1
)

if not exist "%PROJECT_DIR%package.json" (
  echo [ERROR] package.json was not found in %PROJECT_DIR%
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $resp = Invoke-WebRequest -UseBasicParsing -Uri '%STATE_URL%' -TimeoutSec 2; if ($resp.StatusCode -eq 200) { exit 0 } } catch { }; exit 1"
if not errorlevel 1 (
  echo K-line panel is already running. Opening browser...
  start "" "%PANEL_URL%"
  exit /b 0
)

echo Starting K-line panel server...
start "TradingView K-line Panel" /min cmd /k "cd /d ""%PROJECT_DIR%"" && node examples\KlineWebPanel.js --host=%HOST% --port=%PORT%"

echo Waiting for the local panel to become ready...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline = (Get-Date).AddSeconds(20); while ((Get-Date) -lt $deadline) { try { $resp = Invoke-WebRequest -UseBasicParsing -Uri '%STATE_URL%' -TimeoutSec 2; if ($resp.StatusCode -eq 200) { exit 0 } } catch { }; Start-Sleep -Milliseconds 500 }; exit 1"
if errorlevel 1 (
  echo [ERROR] The panel did not become ready within 20 seconds.
  echo Please check the minimized server window for details.
  pause
  exit /b 1
)

echo K-line panel started successfully: %PANEL_URL%
start "" "%PANEL_URL%"
exit /b 0
