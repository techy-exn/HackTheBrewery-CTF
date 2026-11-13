@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not on PATH.
  echo Install the current Node.js LTS release, then run this file again.
  pause
  exit /b 1
)
node tools\start-local.mjs
set "launchCode=%errorlevel%"
if not "%launchCode%"=="0" pause
exit /b %launchCode%

