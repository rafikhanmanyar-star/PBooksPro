@echo off
echo Building PBooksPro Portable for Windows...
echo Cleaning previous build artifacts...
if exist "release" rmdir /s /q "release"
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm.cmd run electron:build:win:portable

