# PBooks Pro - Deploy to Staging
# 1) Increment patch version  2) Build electron staging installer  3) Push to staging branch
#
# Usage:  .\deploy-staging.ps1
#   or:   npm run deploy:staging

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  PBooks Pro - Deploy to STAGING"        -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$currentBranch = git rev-parse --abbrev-ref HEAD
Write-Host "  Current branch: $currentBranch" -ForegroundColor Gray

# ── Step 1: Increment patch version ──────────────────────────────────────────
Write-Host "`n[1/5] Incrementing version (patch)..." -ForegroundColor Yellow

npm version patch --no-git-tag-version | Out-Null
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version

Write-Host "       New version: v$version" -ForegroundColor Green

# ── Step 2: Build electron staging installer ─────────────────────────────────
Write-Host "`n[2/5] Building staging electron installer..." -ForegroundColor Yellow
Write-Host "       Output: release-staging/" -ForegroundColor Gray

npm run electron:staging:installer
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n  BUILD FAILED! Aborting deploy." -ForegroundColor Red
    exit 1
}

Write-Host "       Build complete." -ForegroundColor Green

# ── Step 3: Stage all changes ────────────────────────────────────────────────
Write-Host "`n[3/5] Staging changes..." -ForegroundColor Yellow
git add -A

# ── Step 4: Commit ───────────────────────────────────────────────────────────
Write-Host "[4/5] Committing..." -ForegroundColor Yellow
git commit -m "v$version - staging deploy"
if ($LASTEXITCODE -ne 0) {
    Write-Host "       Nothing new to commit, continuing..." -ForegroundColor Yellow
}

# ── Step 5: Push to staging branch ───────────────────────────────────────────
Write-Host "`n[5/5] Pushing to staging branch..." -ForegroundColor Yellow

git push origin "${currentBranch}:staging" --force-with-lease 2>&1 | Write-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n  PUSH FAILED!" -ForegroundColor Red
    exit 1
}

if ($currentBranch -ne "staging") {
    git push origin $currentBranch 2>&1 | Write-Host
}

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  STAGING DEPLOY COMPLETE"                -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Version   : v$version"                  -ForegroundColor Green
Write-Host "  Installer : release-staging/"            -ForegroundColor Green
Write-Host ""
Write-Host "  Render auto-deploying (staging branch):" -ForegroundColor Green
Write-Host "    - pbookspro-api-staging"               -ForegroundColor Green
Write-Host "    - pbookspro-admin-staging"             -ForegroundColor Green
Write-Host "    - pbookspro-website-staging"           -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green
