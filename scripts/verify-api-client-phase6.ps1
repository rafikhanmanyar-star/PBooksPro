# Architecture v2.1 Phase 6 / Track D — API client verification (no Electron UI)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "`n=== PBooks Pro API Client Phase 6 Verification ===`n"

function Assert-NoMatch {
    param([string]$Label, [string[]]$Paths, [string]$Pattern)
    $hits = @()
    foreach ($p in $Paths) {
        if (Test-Path $p) {
            $hits += Select-String -Path $p -Pattern $Pattern -SimpleMatch -ErrorAction SilentlyContinue
        }
    }
    if ($hits.Count -gt 0) {
        Write-Host "FAIL: $Label"
        $hits | ForEach-Object { Write-Host "  $($_.Path):$($_.LineNumber)" }
        exit 1
    }
    Write-Host "OK: $Label"
}

# 1. Builds
Write-Host "[1/5] npm run build:backend"
npm run build:backend | Out-Null

Write-Host "[2/5] npm run build"
npm run build | Out-Null

# 2. Unit tests
Write-Host "[3/5] npm run test:date-only"
npm run test:date-only | Out-Null

# 3. No legacy-sqlite in client bundle
$distAssets = Join-Path $root 'dist/assets'
Assert-NoMatch -Label 'dist/assets has no legacy-sqlite references' `
    -Paths (Get-ChildItem $distAssets -Filter '*.js' | Select-Object -ExpandProperty FullName) `
    -Pattern 'legacy-sqlite-stubs'

Assert-NoMatch -Label 'dist/assets has no sql.js unavailable stub text' `
    -Paths (Get-ChildItem $distAssets -Filter '*.js' | Select-Object -ExpandProperty FullName) `
    -Pattern 'sql.js is unavailable'

# 4. Source sanity — removed paths
foreach ($missing in @(
    'services/importService.ts',
    'services/legacySqliteLoader.ts',
    'scripts/vite-legacy-sqlite-stub-plugin.mjs'
)) {
    if (Test-Path (Join-Path $root $missing)) {
        Write-Host "FAIL: expected removed file still exists: $missing"
        exit 1
    }
}
Write-Host 'OK: Phase 6 deleted files absent'

# 5. Critical imports
$appContext = Get-Content (Join-Path $root 'context/AppContext.tsx') -Raw
if ($appContext -notmatch "import \{ logger \} from '\.\./services/logger'") {
    Write-Host 'FAIL: AppContext.tsx missing logger import'
    exit 1
}
Write-Host 'OK: AppContext logger import present'

$plReport = Get-Content (Join-Path $root 'components/reports/ProjectProfitLossReport.tsx') -Raw
if ($plReport -match 'const report = !clientReport') {
    Write-Host 'FAIL: ProjectProfitLossReport still has inverted report assignment'
    exit 1
}
Write-Host 'OK: ProjectProfitLossReport report assignment'

$marketing = Get-Content (Join-Path $root 'components/marketing/MarketingPage.tsx') -Raw
if ($marketing -notmatch 'const usersForApproval =') {
    Write-Host 'FAIL: MarketingPage missing usersForApproval'
    exit 1
}
if ($marketing -match 'isLocalOnlyMode') {
    Write-Host 'FAIL: MarketingPage still references isLocalOnlyMode'
    exit 1
}
Write-Host 'OK: MarketingPage approval users restored (API-only)'

# 6. Staging API health (optional if server running)
$port = 3001
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -TimeoutSec 5
    if ($health.success -and $health.data.ok) {
        Write-Host "OK: Staging API health on port $port"
    } else {
        Write-Host "WARN: Staging API responded but health payload unexpected"
    }
} catch {
    Write-Host "SKIP: Staging API not running on port $port (run npm run test:staging for full stack)"
}

Write-Host "`n=== Phase 6 automated verification passed ===`n"
Write-Host 'Manual: npm run test:staging - confirm no console errors on login and Project P and L report.'
