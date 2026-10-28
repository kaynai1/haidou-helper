@echo off
setlocal
set "HTML=%~dp0web\index.html"
if not exist "%HTML%" (
  echo [ERROR] web\index.html not found.
  pause
  exit /b 1
)
start "" "%HTML%"
