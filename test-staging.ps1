# PBooks Pro - Staging full stack local test (pBookspro_Staging + API port 3001 + Electron client)
#
# Run from repo root:
#   npm run test:staging
#
# Production-like local test (pbookspro + API port 3000) - unchanged:
#   npm run test:local-only
#
# Requires: PostgreSQL with database pBookspro_Staging; copy .env.staging.example to .env.staging
#
# Optional live backend reload:
#   npm run test:staging:watch
#   # or: $env:PBooks_BACKEND_WATCH = "1"; npm run test:staging

param(
    [switch]$BackendWatch
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$EnvFile = ".env.staging"

$LocalApiBase = "http://127.0.0.1:3001/api"
$LocalWsRoot = "http://127.0.0.1:3001"
$HealthUrl = "http://127.0.0.1:3001/health"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host '   PBooks Pro - Staging PostgreSQL + API + Client' -ForegroundColor Cyan
Write-Host '   (pBookspro_Staging on port 3001)                  ' -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $ProjectRoot

if (-not (Test-Path $EnvFile)) {
    Write-Host "  Missing $EnvFile - copy from .env.staging.example and set DATABASE_URL." -ForegroundColor Red
    exit 1
}

Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
        }
    }
}
Write-Host "  Loaded $EnvFile" -ForegroundColor DarkGray

Write-Host ""
Write-Host "  [1/8] Rebuilding native modules..." -ForegroundColor Yellow
& npm run rebuild:native
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Native rebuild failed, continuing anyway..." -ForegroundColor Yellow
}

if (-not $BackendWatch -and -not ($env:PBooks_BACKEND_WATCH -eq "1")) {
    Write-Host ""
    Write-Host '  [2/8] Building backend: tsc to dist...' -ForegroundColor Yellow
    & npm run build:backend
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Backend build failed!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host ""
    Write-Host '  [2/8] Skipping build:backend (tsx watch)' -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  [3/8] Running staging database migrations (pBookspro_Staging)..." -ForegroundColor Yellow
& npm run db:migrate:staging
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Migration failed! Check DATABASE_URL in $EnvFile" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  [4/8] Seeding staging defaults (test company / Rafi - idempotent)..." -ForegroundColor Yellow
& npm run db:seed:staging
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Staging seed failed! Check $EnvFile and DATABASE_URL." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  [5/8] Starting staging backend API (PORT=3001)..." -ForegroundColor Yellow
$env:NODE_ENV = "production"
if (-not $env:PORT) { $env:PORT = "3001" }

$useWatch = $BackendWatch -or ($env:PBooks_BACKEND_WATCH -eq "1")
if ($useWatch) {
    $watchCmd = 'cd /d "' + $ProjectRoot + '" && set NODE_ENV=development&& npm run dev:backend:staging'
    $backendJob = Start-Process -FilePath "cmd.exe" -ArgumentList @("/k", $watchCmd) -PassThru -WindowStyle Normal
    Write-Host ('  Backend dev [tsx watch] started. PID: ' + $backendJob.Id) -ForegroundColor Green
} else {
    $runCmd = 'set NODE_ENV=production&& npm run start:backend:staging'
    $backendJob = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $runCmd) -WorkingDirectory $ProjectRoot -PassThru -NoNewWindow
    Write-Host ('  Staging backend started. PID: ' + $backendJob.Id) -ForegroundColor Green
}

Write-Host ""
Write-Host "  Waiting for API at $HealthUrl ..." -ForegroundColor DarkGray
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $ready) {
    Write-Host "  API did not become ready. Check pbooks_staging and $EnvFile." -ForegroundColor Red
    try { Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue } catch {}
    exit 1
}
Write-Host "  Staging API is up." -ForegroundColor Green

Write-Host ""
Write-Host '  [6/8] Building Electron staging client...' -ForegroundColor Yellow
& npm run electron:extract-schema

$env:VITE_LOCAL_ONLY = "false"
$env:VITE_ELECTRON_BUILD = "true"
$env:VITE_STAGING = "true"
$env:VITE_API_URL = $LocalApiBase
$env:VITE_WS_URL = $LocalWsRoot

& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Frontend build failed!" -ForegroundColor Red
    if ($useWatch) {
        try { taskkill /PID $backendJob.Id /T /F 2>$null } catch {}
    } else {
        try { Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    exit 1
}

Write-Host ""
Write-Host "  [7/8] Launching Electron client..." -ForegroundColor Green
Write-Host ""
& npx electron . --enable-logging

Write-Host ""
Write-Host "  [8/8] Stopping staging backend..." -ForegroundColor Yellow
try {
    if ($useWatch) {
        taskkill /PID $backendJob.Id /T /F 2>$null | Out-Null
    } else {
        Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue
    }
} catch {}
