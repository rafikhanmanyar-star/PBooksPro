@echo off
setlocal
cd /d "%~dp0server"
if not exist ".env" (
  echo Missing server\.env ??? copy env.example.txt to server\.env and set DATABASE_URL and JWT_SECRET.
  pause
  exit /b 1
)
set NODE_ENV=production
node dist/index.js
pause
