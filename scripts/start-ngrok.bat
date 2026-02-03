@echo off
title ngrok - Port 3000
REM This window will stay open so you can see any output or errors.

echo ============================================
echo  ngrok - Keeping this window open
echo ============================================
echo.

echo Step 1: Checking if ngrok is available...
where ngrok >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: ngrok is not in your PATH.
    echo.
    echo Option A - Add ngrok to PATH:
    echo   1. Find where ngrok.exe is installed
    echo   2. Add that folder to Windows PATH
    echo.
    echo Option B - Run with full path:
    echo   Replace ngrok below with full path, e.g.:
    echo   C:\Users\Rafi\Downloads\ngrok.exe http 3000
    echo.
    echo Option C - Install ngrok:
    echo   Download from https://ngrok.com/download
    echo   Extract ngrok.exe and add folder to PATH
    echo.
    goto :pause
)

echo Running: ngrok version
ngrok version
echo.

echo Step 2: Starting ngrok http 3000...
echo Keep this window open. Your webhook URL will appear below.
echo.
ngrok http 3000

:pause
echo.
echo ============================================
echo  Window kept open - see output above
echo ============================================
pause
