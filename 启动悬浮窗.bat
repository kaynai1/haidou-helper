@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
set "APP=%~dp0overlay"
set "EXE=%APP%\node_modules\electron\dist\electron.exe"
if not exist "%EXE%" (
  echo [ERROR] Electron runtime missing.
  echo Run: cd /d "%~dp0overlay" ^&^& npm install
  pause
  exit /b 1
)
start "" "%EXE%" "%APP%"
