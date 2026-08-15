@echo off
cd /d "%~dp0"
echo ========================================
echo   OPAD - Agile Dashboard
echo ========================================
echo.
echo Starting server...
echo Open: http://127.0.0.1:3001
echo Press Ctrl+C to stop
echo.
node server.js
pause
