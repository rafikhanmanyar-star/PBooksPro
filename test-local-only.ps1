# PBooks Pro - Local-Only Testing (No Server, No Cloud)
# Runs Electron app with local SQLite only. No API server or cloud required.

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   PBooks Pro - Local-Only Mode (No Cloud)       " -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  No server or database setup required." -ForegroundColor Green
Write-Host "  Data stored in local SQLite only." -ForegroundColor Green
Write-Host ""

Set-Location $ProjectRoot

$env:VITE_LOCAL_ONLY = "true"
$env:VITE_ELECTRON_BUILD = "true"

Write-Host "  Rebuilding native modules for Electron..." -ForegroundColor Yellow
& npm run rebuild:native
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Native rebuild failed, continuing anyway..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Building and launching Electron app..." -ForegroundColor Green
Write-Host ""

& npm run electron:local
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Failed!" -ForegroundColor Red
    exit 1
}
