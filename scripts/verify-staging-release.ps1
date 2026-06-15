# Architecture v2.1 — guardrails for npm run release:staging / deploy:staging-inner
# Ensures staging installers are API Server + API Client (PostgreSQL), not legacy SQLite.
param(
    [ValidateSet('Preflight', 'AfterBackend', 'AfterApiServer', 'AfterClient', 'Full')]
    [string]$Step = 'Full'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Assert-FileContains {
    param([string]$Label, [string]$Path, [string]$Pattern, [switch]$MustNotMatch)
    if (-not (Test-Path $Path)) {
        Write-Host "FAIL: $Label - missing file: $Path"
        exit 1
    }
    $raw = Get-Content $Path -Raw
    $hit = $raw -match $Pattern
    if ($MustNotMatch) {
        if ($hit) {
            Write-Host "FAIL: $Label - forbidden pattern in $Path"
            exit 1
        }
    } elseif (-not $hit) {
        Write-Host "FAIL: $Label - expected pattern in $Path"
        exit 1
    }
    Write-Host "OK: $Label"
}

function Assert-NoMatchInAssets {
    param([string]$Label, [string]$Pattern)
    $assets = Join-Path $root 'dist/assets'
    if (-not (Test-Path $assets)) {
        Write-Host "FAIL: $Label - dist/assets missing (run staging client build first)"
        exit 1
    }
    $files = @(Get-ChildItem $assets -Filter '*.js' | Select-Object -ExpandProperty FullName)
    $hits = @()
    if ($files.Count -gt 0) {
        $hits = @(Select-String -Path $files -Pattern $Pattern -SimpleMatch -ErrorAction SilentlyContinue)
    }
    if ($hits.Count -gt 0) {
        Write-Host "FAIL: $Label"
        $hits | Select-Object -First 5 | ForEach-Object { Write-Host "  $($_.Path):$($_.LineNumber)" }
        exit 1
    }
    Write-Host "OK: $Label"
}

function Run-Preflight {
    Write-Host "`n--- Staging release preflight (v2.1 pipeline) ---`n"

    $pkg = Get-Content (Join-Path $root 'package.json') -Raw
    Assert-FileContains -Label 'deploy:staging-inner builds backend' -Path (Join-Path $root 'package.json') -Pattern 'build:backend'
    Assert-FileContains -Label 'deploy:staging-inner uses API client staging yml' -Path (Join-Path $root 'package.json') -Pattern 'electron-builder-api-client-staging.yml'
    Assert-FileContains -Label 'deploy:staging-inner uses API server staging yml' -Path (Join-Path $root 'package.json') -Pattern 'electron-builder-api-server-staging.yml'
    Assert-FileContains -Label 'deploy:staging-inner sets VITE_LOCAL_ONLY=false' -Path (Join-Path $root 'package.json') -Pattern 'VITE_LOCAL_ONLY=false'
    Assert-FileContains -Label 'deploy:staging-inner stages electron API server' -Path (Join-Path $root 'package.json') -Pattern 'electron:stage-api-server'
    if ($pkg -match 'electron-builder-staging\.yml') {
        Write-Host 'FAIL: deploy:staging-inner must not use legacy electron-builder-staging.yml (SQLite)'
        exit 1
    }
    Write-Host 'OK: deploy:staging-inner does not reference legacy SQLite staging yml'

    $clientYml = Join-Path $root 'electron-builder-api-client-staging.yml'
    Assert-FileContains -Label 'API client staging yml documents v2.1' -Path $clientYml -Pattern 'Architecture v2.1'
    Assert-FileContains -Label 'API client staging yml excludes sql.js assets' -Path $clientYml -Pattern '!dist/assets/sql-wasm'
    Assert-FileContains -Label 'API client staging yml has no better-sqlite3' -Path $clientYml -Pattern 'better-sqlite3' -MustNotMatch
    Assert-FileContains -Label 'API client staging yml has no sqliteBridge' -Path $clientYml -Pattern 'sqliteBridge' -MustNotMatch

    $serverYml = Join-Path $root 'electron-builder-api-server-staging.yml'
    Assert-FileContains -Label 'API server staging yml bundles staged backend' -Path $serverYml -Pattern 'build/electron-api-server'
    Assert-FileContains -Label 'API server staging yml uses server-main' -Path $serverYml -Pattern 'electron/server-main.cjs'
}

function Run-AfterBackend {
    Write-Host "`n--- After build:backend ---`n"
    $index = Join-Path $root 'backend/dist/index.js'
    if (-not (Test-Path $index)) {
        Write-Host 'FAIL: backend/dist/index.js missing'
        exit 1
    }
    Write-Host 'OK: backend/dist/index.js present'

    $moduleSample = Join-Path $root 'backend/dist/modules/vendors/routes/billsRoutes.js'
    if (-not (Test-Path $moduleSample)) {
        Write-Host 'FAIL: backend/dist/modules/* missing - v2 module layout not in compiled output'
        exit 1
    }
    Write-Host 'OK: backend/dist/modules (v2) present'
}

function Run-AfterApiServer {
    Write-Host "`n--- After electron:stage-api-server ---`n"
    $staged = Join-Path $root 'build/electron-api-server'
    $stagedIndex = Join-Path $staged 'backend/dist/index.js'
    $migrations = Join-Path $staged 'database/migrations'
    if (-not (Test-Path $stagedIndex)) {
        Write-Host 'FAIL: build/electron-api-server/backend/dist/index.js missing'
        exit 1
    }
    Write-Host 'OK: staged API server backend present'

    $sqlCount = (Get-ChildItem $migrations -Filter '*.sql' -ErrorAction SilentlyContinue).Count
    if ($sqlCount -lt 1) {
        Write-Host 'FAIL: staged migrations missing under build/electron-api-server/database/migrations'
        exit 1
    }
    Write-Host "OK: staged migrations ($sqlCount files)"

    $stagingMarker = Join-Path $staged 'backend/.pbooks-staging-api-server'
    if (-not (Test-Path $stagingMarker)) {
        Write-Host 'FAIL: staging API server marker missing (PBOOKS_STAGE_API_SERVER=1?)'
        exit 1
    }
    Write-Host 'OK: staging API server marker present'
}

function Run-AfterClient {
    Write-Host "`n--- After staging Vite client build ---`n"
    Assert-NoMatchInAssets -Label 'dist/assets has no legacy-sqlite references' -Pattern 'legacy-sqlite-stubs'
    Assert-NoMatchInAssets -Label 'dist/assets has no sql.js unavailable stub' -Pattern 'sql.js is unavailable'

    $envConfig = Join-Path $root 'dist/env-config.json'
    if (-not (Test-Path $envConfig)) {
        Write-Host 'FAIL: dist/env-config.json missing'
        exit 1
    }
    $cfg = Get-Content $envConfig -Raw | ConvertFrom-Json
    if (-not $cfg.isStaging) {
        Write-Host 'FAIL: dist/env-config.json isStaging is not true - rebuild with VITE_STAGING=true'
        exit 1
    }
    if ($cfg.apiUrl -notmatch ':3001') {
        Write-Host "FAIL: dist/env-config.json apiUrl should target staging port 3001 (got $($cfg.apiUrl))"
        exit 1
    }
    Write-Host 'OK: dist/env-config.json staging API (port 3001)'

    $sqlAssets = Get-ChildItem (Join-Path $root 'dist/assets') -Filter 'sql-*' -ErrorAction SilentlyContinue
    if ($sqlAssets.Count -gt 0) {
        Write-Host 'FAIL: dist/assets contains sql-* chunks (SQLite client bundle leak)'
        exit 1
    }
    Write-Host 'OK: dist/assets has no sql-* chunks'
}

Write-Host "`n=== PBooks Pro Staging Release Verification ($Step) ===`n"

switch ($Step) {
    'Preflight' { Run-Preflight }
    'AfterBackend' { Run-AfterBackend }
    'AfterApiServer' { Run-AfterApiServer }
    'AfterClient' { Run-AfterClient }
    'Full' {
        Run-Preflight
        Run-AfterBackend
        Run-AfterApiServer
        if (Test-Path (Join-Path $root 'dist/assets')) {
            Run-AfterClient
        } else {
            Write-Host 'SKIP: AfterClient (dist/assets missing - run staging client build for full check)'
        }
    }
}

Write-Host "`n=== Staging release verification passed ($Step) ===`n"
