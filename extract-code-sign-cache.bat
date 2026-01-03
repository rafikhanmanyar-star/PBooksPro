@echo off
REM Extract electron-builder code signing cache with admin privileges
REM This fixes the symlink error that prevents builds

echo ========================================
echo Extracting Code Signing Cache
echo ========================================
echo.
echo This script will extract the electron-builder code signing cache.
echo It requires Administrator privileges to create symbolic links.
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Running with administrator privileges - OK
) else (
    echo ERROR: This script must be run as Administrator!
    echo.
    echo Right-click this file and select "Run as Administrator"
    pause
    exit /b 1
)

set CACHE_DIR=%LOCALAPPDATA%\electron-builder\Cache\winCodeSign

if not exist "%CACHE_DIR%" (
    echo Cache directory not found: %CACHE_DIR%
    echo The cache will be created on first build attempt.
    pause
    exit /b 0
)

echo Cache directory: %CACHE_DIR%
echo.

REM Find and extract all .7z files in cache subdirectories
for /d %%d in ("%CACHE_DIR%\*") do (
    if exist "%%d\*.7z" (
        echo Extracting archive in %%d...
        "%~dp0node_modules\7zip-bin\win\x64\7za.exe" x -y -bd "%%d\*.7z" "-o%%d" >nul 2>&1
        if %ERRORLEVEL% EQU 0 (
            echo   Success!
        ) else (
            echo   Completed with warnings (symlink errors are OK for macOS files)
        )
    )
)

echo.
echo ========================================
echo Cache extraction complete!
echo You can now run electron-build.bat normally
echo ========================================
pause

