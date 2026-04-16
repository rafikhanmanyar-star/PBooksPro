# PBooks Pro — Local full stack test (PostgreSQL + API + Electron, production-like client)
#
# Same data path as production / LAN client: VITE_LOCAL_ONLY=false, REST + Socket.IO to this machine.
# Forces local API/WebSocket URLs into the Vite build so a remote VITE_API_URL in .env cannot break the test.
#
# Real-time: the client uses Socket.IO (entity_created / entity_updated / entity_deleted) to refresh from
# PostgreSQL when other users/sessions change data; your own saves are reflected via the normal client flow.
#
# Optional: run the API with live reload (backend TypeScript changes without rebuilding dist):
#   $env:PBooks_BACKEND_WATCH = "1"
#   npm run test:local-only
#
# Requires: PostgreSQL running locally; DATABASE_URL (and JWT_SECRET, etc.) in root or backend/.env

param(
    [switch]$BackendWatch
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

$LocalApiBase = "http://127.0.0.1:3000/api"
$LocalWsRoot = "http://127.0.0.1:3000"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host '   PBooks Pro - Local PostgreSQL + API + Electron' -ForegroundColor Cyan
Write-Host '   (production-like API client; local REST + WS)   ' -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host '  Stack: PostgreSQL -> Express API -> Electron (API mode)' -ForegroundColor Green
Write-Host "  REST:  $LocalApiBase" -ForegroundColor DarkGray
Write-Host ('  WS:    ' + $LocalWsRoot + ' (Socket.IO)') -ForegroundColor DarkGray
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
Write-Host "  [1/7] Rebuilding native modules..." -ForegroundColor Yellow
& npm run rebuild:native
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Native rebuild failed, continuing anyway..." -ForegroundColor Yellow
}

# ── 2. Backend: dist build (default) or skip when using tsx watch ──
if (-not $BackendWatch -and -not ($env:PBooks_BACKEND_WATCH -eq "1")) {
    Write-Host ""
    Write-Host '  [2/7] Building backend: tsc to dist...' -ForegroundColor Yellow
    & npm run build:backend
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Backend build failed!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host ""
    Write-Host '  [2/7] Skipping build:backend (tsx watch; PBooks_BACKEND_WATCH or -BackendWatch)' -ForegroundColor Yellow
}

# ── 3. Run PostgreSQL migrations ──
Write-Host ""
Write-Host "  [3/7] Running database migrations..." -ForegroundColor Yellow
& npm run db:migrate:lan
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Migration failed! Check DATABASE_URL in .env" -ForegroundColor Red
    exit 1
}

# ── 4. Start the backend API ──
Write-Host ""
Write-Host "  [4/7] Starting backend API server..." -ForegroundColor Yellow
$env:NODE_ENV = "production"

$useWatch = $BackendWatch -or ($env:PBooks_BACKEND_WATCH -eq "1")
if ($useWatch) {
    # New console so tsx watch logs are visible; child tree killed via /T on cleanup
    # Build cmd line without nested double-quotes (breaks PowerShell parser on some hosts).
    $watchCmd = 'cd /d "' + $ProjectRoot + '" && set NODE_ENV=development&& npm run dev --prefix backend'
    $backendJob = Start-Process -FilePath "cmd.exe" -ArgumentList @("/k", $watchCmd) -PassThru -WindowStyle Normal
    Write-Host ('  Backend dev [tsx watch] started in new window. PID: ' + $backendJob.Id) -ForegroundColor Green
} else {
    $runCmd = 'set NODE_ENV=production&& node backend/dist/index.js'
    $backendJob = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $runCmd) -WorkingDirectory $ProjectRoot -PassThru -NoNewWindow
    Write-Host ('  Backend API started. PID: ' + $backendJob.Id + ' NODE_ENV=production') -ForegroundColor Green
}

# ── Wait until HTTP server responds (Socket.IO shares the same port) ──
Write-Host ""
Write-Host '  Waiting for API at http://127.0.0.1:3000/health ...' -ForegroundColor DarkGray
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $ready) {
    Write-Host "  API did not become ready in time. Check PostgreSQL and DATABASE_URL." -ForegroundColor Red
    try { Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue } catch {}
    exit 1
}
Write-Host "  API is up." -ForegroundColor Green

# ── 5. Build Vite frontend: same flags as production API client, but pin local API + WS ──
Write-Host ""
Write-Host '  [5/7] Building Electron client: API mode, local URLs...' -ForegroundColor Yellow
& npm run electron:extract-schema

# Force production-like LAN client; do not let a remote VITE_API_URL from .env leak into the bundle.
$env:VITE_LOCAL_ONLY = "false"
$env:VITE_ELECTRON_BUILD = "true"
$env:VITE_STAGING = "false"
$env:VITE_API_URL = $LocalApiBase
$env:VITE_WS_URL = $LocalWsRoot

Write-Host "  VITE_API_URL=$($env:VITE_API_URL)" -ForegroundColor DarkGray
Write-Host "  VITE_WS_URL=$($env:VITE_WS_URL)" -ForegroundColor DarkGray

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

# ── 6. Launch Electron ──
Write-Host ""
Write-Host "  [6/7] Launching Electron client..." -ForegroundColor Green
Write-Host ""
& npx electron . --enable-logging

# ── 7. Cleanup: stop the backend when Electron exits ──
Write-Host ""
Write-Host "  [7/7] Stopping backend API server..." -ForegroundColor Yellow
try {
    if ($useWatch) {
        taskkill /PID $backendJob.Id /T /F 2>$null | Out-Null
        Write-Host '  Backend [watch] stopped.' -ForegroundColor Green
    } else {
        Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue
        Write-Host '  Backend stopped.' -ForegroundColor Green
    }
} catch {
    Write-Host '  Backend already stopped.' -ForegroundColor DarkGray
}
