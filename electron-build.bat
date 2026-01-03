@echo off
REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Running with administrator privileges - code signing cache will work properly
) else (
    echo WARNING: Not running as administrator
    echo If you see code signing cache errors, right-click this file and "Run as Administrator"
)
echo.
echo ========================================
echo Building PBooksPro for Windows...
echo ========================================
echo.

echo [1/3] Checking prerequisites...
if not exist "dist" (
    echo ERROR: dist folder not found! Run 'npm run build' first.
    pause
    exit /b 1
)
if not exist "build\icon.ico" (
    echo WARNING: build\icon.ico not found. Build will continue but may have issues.
)

REM Check if code signing cache needs extraction
set CACHE_DIR=%LOCALAPPDATA%\electron-builder\Cache\winCodeSign
if exist "%CACHE_DIR%" (
    for /d %%d in ("%CACHE_DIR%\*") do (
        if exist "%%d\*.7z" (
            echo.
            echo WARNING: Code signing cache needs extraction.
            echo If build fails with symlink errors, run extract-code-sign-cache.bat as Administrator
            goto :cache_check_done
        )
    )
)
:cache_check_done
echo.

echo [2/3] Setting build environment...
set CSC_IDENTITY_AUTO_DISCOVERY=false
set WIN_CSC_LINK=
set WIN_CSC_KEY_PASSWORD=
set CSC_LINK=
set CSC_KEY_PASSWORD=
set SKIP_NOTARIZATION=true
set APPLE_ID=
set APPLE_APP_SPECIFIC_PASSWORD=
echo Disabled code signing tools download
echo.

echo [3/3] Starting Electron Builder...
echo This may take several minutes. Please be patient...
echo.
echo NOTE: If you see code signing cache errors, you can:
echo   1. Ignore them (they're for macOS files, not needed for Windows)
echo   2. Run this script as Administrator to fix the cache
echo.
call npm.cmd run electron:build:win

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Build completed successfully!
    echo Check: C:\MyProjectsProBuild\release
    echo ========================================
) else (
    echo.
    echo ========================================
    echo Build FAILED with error code: %ERRORLEVEL%
    echo ========================================
)
pause

