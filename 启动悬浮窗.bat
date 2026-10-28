@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
set "APP=%~dp0overlay"
set "EXE=%~dp0node_modules\electron\dist\electron.exe"
if not exist "%EXE%" (
  echo [ERROR] Electron runtime missing.
  echo Run: cd /d "%~dp0" ^&^& npm install
  pause
  exit /b 1
)
start "" "%EXE%" "%APP%"
