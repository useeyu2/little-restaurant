@echo off
setlocal
cd /d "%~dp0"

echo Starting Little restaurant management system on http://localhost:3001
echo Keep this window open while using the app.
echo.

node apps\api\src\server.js

if errorlevel 1 (
  echo.
  echo The server stopped unexpectedly.
  pause
)
