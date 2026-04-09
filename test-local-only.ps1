# PBooks Pro Client - Local PostgreSQL Mode
# Builds backend, runs migrations, starts API server, then launches the Electron client.
# Requires: PostgreSQL running locally with DATABASE_URL configured in root .env

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   PBooks Pro Client - Local PostgreSQL Mode     " -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Backend API + PostgreSQL + Electron Client"    -ForegroundColor Green
Write-Host "  Ensure PostgreSQL is running and DATABASE_URL" -ForegroundColor Green
Write-Host "  is set in the root .env file."                -ForegroundColor Green
Write-Host ""

Set-Location $ProjectRoot

# ── Load .env so DATABASE_URL, JWT_SECRET, etc. are available ──
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split "=", 2
            if ($parts.Count -eq 2) {
                [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
            }
        }
    }
    Write-Host "  Loaded .env" -ForegroundColor DarkGray
}

# ── 1. Rebuild native modules for Electron ──
Write-Host ""
Write-Host "  [1/6] Rebuilding native modules..." -ForegroundColor Yellow
& npm run rebuild:native
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Native rebuild failed, continuing anyway..." -ForegroundColor Yellow
}

# ── 2. Build the backend (bundles engines + compiles TS) ──
Write-Host ""
Write-Host "  [2/6] Building backend..." -ForegroundColor Yellow
& npm run build:backend
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Backend build failed!" -ForegroundColor Red
    exit 1
}

# ── 3. Run PostgreSQL migrations ──
Write-Host ""
Write-Host "  [3/6] Running database migrations..." -ForegroundColor Yellow
& npm run db:migrate:lan
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Migration failed! Check DATABASE_URL in .env" -ForegroundColor Red
    exit 1
}

# ── 4. Start the backend API server in background ──
Write-Host ""
Write-Host "  [4/6] Starting backend API server..." -ForegroundColor Yellow
$backendJob = Start-Process -FilePath "node" `
    -ArgumentList "backend/dist/index.js" `
    -WorkingDirectory $ProjectRoot `
    -PassThru -NoNewWindow
Write-Host "  Backend API started (PID: $($backendJob.Id))" -ForegroundColor Green

# Give server a moment to bind
Start-Sleep -Seconds 3

# ── 5. Build the Vite frontend for API client mode ──
Write-Host ""
Write-Host "  [5/6] Building Electron client (API mode)..." -ForegroundColor Yellow
& npm run electron:extract-schema

$env:VITE_LOCAL_ONLY = "false"
$env:VITE_ELECTRON_BUILD = "true"
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Frontend build failed!" -ForegroundColor Red
    Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

# ── 6. Launch Electron ──
Write-Host ""
Write-Host "  [6/6] Launching Electron client..." -ForegroundColor Green
Write-Host ""
& npx electron . --enable-logging

# ── Cleanup: stop the backend when Electron exits ──
Write-Host ""
Write-Host "  Stopping backend API server..." -ForegroundColor Yellow
try {
    Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  Backend stopped." -ForegroundColor Green
} catch {
    Write-Host "  Backend already stopped." -ForegroundColor DarkGray
}
