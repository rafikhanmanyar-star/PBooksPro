# PBooks Pro - Local Testing with Staging Database
# Runs API server (connected to staging DB) + Electron app locally
# No compiling, no git push, no installer - just quick local testing

param(
    [switch]$ServerOnly,
    [switch]$ElectronOnly
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

# Preflight: ensure server/.env exists
$envFile = Join-Path $ProjectRoot "server\.env"
$envTemplate = Join-Path $ProjectRoot "server\.env.staging.template"

if (-not (Test-Path $envFile)) {
    if (Test-Path $envTemplate) {
        Write-Host ""
        Write-Host "  server/.env not found. Creating from template..." -ForegroundColor Yellow
        Copy-Item $envTemplate $envFile
        Write-Host "  Created server/.env - EDIT IT NOW with your staging DATABASE_URL" -ForegroundColor Red
        Write-Host "  Get it from Render Dashboard, pbookspro-db-staging, Connections, External Database URL" -ForegroundColor Cyan
        Write-Host ""
        notepad $envFile
        Read-Host "Press Enter after saving server/.env"
    } else {
        Write-Host "  server/.env not found and no template available." -ForegroundColor Red
        Write-Host "  Create server/.env with DATABASE_URL pointing to staging database." -ForegroundColor Yellow
        exit 1
    }
}

# Verify DATABASE_URL is set (not the placeholder)
$envContent = Get-Content $envFile -Raw
if ($envContent -match "YOUR_PASSWORD" -or $envContent -match "dpg-XXXXX") {
    Write-Host "  server/.env still has placeholder values!" -ForegroundColor Red
    Write-Host "  Update DATABASE_URL with actual staging database credentials." -ForegroundColor Yellow
    notepad $envFile
    Read-Host "Press Enter after saving server/.env"
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   PBooks Pro - Local Test (Staging DB)          " -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$serverJob = $null

try {
    # Start API Server
    if (-not $ElectronOnly) {
        Write-Host "  Starting API server on http://localhost:3000 ..." -ForegroundColor Green
        Write-Host "  Connected to: STAGING database" -ForegroundColor Yellow
        Write-Host ""

        $serverJob = Start-Job -ScriptBlock {
            param($root)
            Set-Location (Join-Path $root "server")
            & npm run dev 2>&1
        } -ArgumentList $ProjectRoot

        Start-Sleep -Seconds 3

        $serverOutput = Receive-Job $serverJob -ErrorAction SilentlyContinue
        if ($serverOutput) {
            $serverOutput | ForEach-Object { Write-Host "  [Server] $_" -ForegroundColor DarkGray }
        }
    }

    if ($ServerOnly) {
        Write-Host ""
        Write-Host "  API server running. Press Ctrl+C to stop." -ForegroundColor Green
        Write-Host ""

        while ($true) {
            $output = Receive-Job $serverJob -ErrorAction SilentlyContinue
            if ($output) {
                $output | ForEach-Object { Write-Host "  [Server] $_" -ForegroundColor DarkGray }
            }
            Start-Sleep -Seconds 1
        }
        return
    }

    # Build and Run Electron App
    if (-not $ServerOnly) {
        Write-Host "  Building Electron app (pointing to localhost:3000) ..." -ForegroundColor Green
        Write-Host ""

        Set-Location $ProjectRoot

        $env:VITE_ELECTRON_BUILD = "true"
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Vite build failed!" -ForegroundColor Red
            exit 1
        }

        Write-Host ""
        Write-Host "  Launching Electron app..." -ForegroundColor Green
        Write-Host "  API: http://localhost:3000/api (staging DB)" -ForegroundColor Yellow
        Write-Host "  Local DB: PBooksPro-Staging.db" -ForegroundColor Yellow
        Write-Host ""

        $env:ELECTRON_USE_STAGING_DB = "1"
        & npx electron . --enable-logging
    }
}
finally {
    if ($serverJob) {
        Write-Host ""
        Write-Host "  Stopping API server..." -ForegroundColor Yellow
        Stop-Job $serverJob -ErrorAction SilentlyContinue
        Remove-Job $serverJob -ErrorAction SilentlyContinue
    }
    Write-Host "  Done." -ForegroundColor Green
}
