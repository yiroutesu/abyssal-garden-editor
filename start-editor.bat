@echo off
setlocal
cd /d "%~dp0source"

where node >nul 2>nul
if errorlevel 1 goto nonode

if not exist "node_modules\esbuild" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto noinstall
)

echo.
echo   Editor : http://127.0.0.1:8765/editor/
echo   Saves rebuild abyssal-garden\index.html automatically.
echo   Close this window to stop the server.
echo.

call npm run edit
echo.
echo Server stopped.
pause
exit /b 0

:nonode
echo.
echo Node.js not found. Install it from https://nodejs.org/ and run this file again.
pause
exit /b 1

:noinstall
echo.
echo Dependency install failed.
pause
exit /b 1
