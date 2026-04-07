# Package the Express + PostgreSQL API for deployment on a Windows server.
# Produces: release-server/PBooksPro-Server/ with server code, migrations, and start scripts.
# Prerequisites: Node.js 20+ on the build machine; PostgreSQL on the target server.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "backend\package.json"))) {
  Write-Error "Run from repo root (scripts/package-server.ps1); could not find backend\package.json."
}

Set-Location $Root

Write-Host "Building backend TypeScript..."
npm run build --prefix backend
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$Out = Join-Path $Root "release-server\PBooksPro-Server"
$ServerDir = Join-Path $Out "server"
$DbDir = Join-Path $Out "database\migrations"

if (Test-Path $Out) {
  Remove-Item -Recurse -Force $Out
}
New-Item -ItemType Directory -Force -Path $ServerDir | Out-Null
New-Item -ItemType Directory -Force -Path $DbDir | Out-Null

Write-Host "Copying backend bundle..."
Copy-Item -Path (Join-Path $Root "backend\package.json") -Destination (Join-Path $ServerDir "package.json")
if (Test-Path (Join-Path $Root "backend\package-lock.json")) {
  Copy-Item -Path (Join-Path $Root "backend\package-lock.json") -Destination (Join-Path $ServerDir "package-lock.json")
}
Copy-Item -Path (Join-Path $Root "backend\dist") -Destination (Join-Path $ServerDir "dist") -Recurse

Write-Host "Copying SQL migrations (database/migrations)..."
Copy-Item -Path (Join-Path $Root "database\migrations\*") -Destination $DbDir -Force

Write-Host "Copying root package.json (app version for /api/app-info/version)..."
Copy-Item -Path (Join-Path $Root "package.json") -Destination (Join-Path $Out "package.json") -Force

Write-Host "Installing production dependencies in package..."
Push-Location $ServerDir
npm ci --omit=dev
if ($LASTEXITCODE -ne 0) {
  npm install --omit=dev
}
Pop-Location

$envExample = @"
# PBooks Pro API — copy this file to server\.env and set values.

DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/pbookspro
JWT_SECRET=change-me-to-a-long-random-string
PORT=3000
NODE_ENV=production

# Optional: seed dev users on first boot (see backend seed)
# SEED_DEV_USER=1
"@
Set-Content -Path (Join-Path $Out "env.example.txt") -Value $envExample -Encoding UTF8

$startBat = @"
@echo off
setlocal
cd /d "%~dp0server"
if not exist ".env" (
  echo Missing server\.env — copy env.example.txt to server\.env and set DATABASE_URL and JWT_SECRET.
  pause
  exit /b 1
)
set NODE_ENV=production
node dist/index.js
pause
"@
Set-Content -Path (Join-Path $Out "start-server.bat") -Value $startBat -Encoding ASCII

$migrateBat = @"
@echo off
cd /d "%~dp0server"
if not exist ".env" (
  echo Missing server\.env — copy env.example.txt to server\.env first.
  pause
  exit /b 1
)
node dist/migrate.js
pause
"@
Set-Content -Path (Join-Path $Out "run-migrations.bat") -Value $migrateBat -Encoding ASCII

$readme = @"
PBooks Pro — API server package
==============================

1. Install PostgreSQL on the server and create a database (e.g. pbookspro).

2. Copy env.example.txt to server\.env and set:
   - DATABASE_URL
   - JWT_SECRET (long random string)
   - PORT (default 3000)

3. Run run-migrations.bat once (from this folder) to apply SQL migrations in database\migrations.

4. Run start-server.bat to start the API. The client PCs use PBooks Pro Client and point to http://SERVER_IP:PORT on the login screen.

5. Firewall: allow inbound TCP on PORT (e.g. 3000) from your office LAN.

6. Node.js 20+ must be installed on the server (same as development).
"@
Set-Content -Path (Join-Path $Out "README-SERVER.txt") -Value $readme -Encoding UTF8

Write-Host ""
Write-Host "Done. Output: $Out"
Write-Host "Zip this folder and copy to your server, or run from a network share."
