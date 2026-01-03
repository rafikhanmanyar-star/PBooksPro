@echo off
REM Fix for electron-builder code signing cache issue
REM This script extracts the winCodeSign archive with proper permissions

echo Fixing electron-builder code signing cache...
echo.

REM Find the latest winCodeSign cache directory
set CACHE_DIR=%LOCALAPPDATA%\electron-builder\Cache\winCodeSign
if not exist "%CACHE_DIR%" (
    echo Cache directory not found. Build will download it automatically.
    pause
    exit /b 0
)

echo Cache directory found: %CACHE_DIR%
echo.
echo NOTE: This requires running as Administrator to create symbolic links.
echo If you see permission errors, right-click this file and "Run as Administrator"
echo.

REM Try to extract with 7zip, ignoring symlink errors
for /d %%d in ("%CACHE_DIR%\*") do (
    if exist "%%d\*.7z" (
        echo Extracting archive in %%d...
        "%~dp0node_modules\7zip-bin\win\x64\7za.exe" x -y -bd "%%d\*.7z" "-o%%d" 2>nul
        if %ERRORLEVEL% EQU 0 (
            echo Successfully extracted!
        ) else (
            echo Extraction completed with warnings (symlink errors are OK)
        )
    )
)

echo.
echo Cache fix complete. You can now run the build.
pause

