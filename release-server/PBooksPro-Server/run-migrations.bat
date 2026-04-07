@echo off
cd /d "%~dp0server"
if not exist ".env" (
  echo Missing server\.env ??? copy env.example.txt to server\.env first.
  pause
  exit /b 1
)
node dist/migrate.js
pause
