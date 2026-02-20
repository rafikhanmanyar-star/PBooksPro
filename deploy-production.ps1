# PBooks Pro - Deploy to Production
# 1) Build electron production installer  2) Push to staging  3) Merge into main
#
# Usage:  .\deploy-production.ps1
#   or:   npm run deploy:production

$ErrorActionPreference = "Stop"

Write-Host "`n============================================" -ForegroundColor Magenta
Write-Host "  PBooks Pro - Deploy to PRODUCTION"          -ForegroundColor Magenta
Write-Host "============================================`n" -ForegroundColor Magenta

$currentBranch = git rev-parse --abbrev-ref HEAD
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version

Write-Host "  Current branch : $currentBranch" -ForegroundColor Gray
Write-Host "  Version        : v$version"       -ForegroundColor Gray

# ── Safety confirmation ──────────────────────────────────────────────────────
Write-Host ""
$confirm = Read-Host "  Deploy v$version to PRODUCTION? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "`n  Aborted." -ForegroundColor Yellow
    exit 0
}

# ── Step 1: Build electron production installer ──────────────────────────────
Write-Host "`n[1/5] Building production electron installer..." -ForegroundColor Yellow
Write-Host "       Output: release/" -ForegroundColor Gray

npm run electron:production:installer
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n  BUILD FAILED! Aborting deploy." -ForegroundColor Red
    exit 1
}

Write-Host "       Build complete." -ForegroundColor Green

# ── Step 2: Stage & commit ───────────────────────────────────────────────────
Write-Host "`n[2/5] Committing changes..." -ForegroundColor Yellow
git add -A
git commit -m "v$version - production deploy"
if ($LASTEXITCODE -ne 0) {
    Write-Host "       Nothing new to commit, continuing..." -ForegroundColor Yellow
}

# ── Step 3: Push to staging branch ───────────────────────────────────────────
Write-Host "`n[3/5] Pushing to staging branch..." -ForegroundColor Yellow

git push origin "${currentBranch}:staging" --force-with-lease
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n  PUSH TO STAGING FAILED!" -ForegroundColor Red
    exit 1
}
Write-Host "       Staging branch updated." -ForegroundColor Green

# ── Step 4: Merge into main and push ─────────────────────────────────────────
Write-Host "`n[4/5] Merging into main branch..." -ForegroundColor Yellow

if ($currentBranch -eq "main") {
    git push origin main
} else {
    git checkout main
    git pull origin main --ff-only 2>$null
    git merge $currentBranch -m "Merge $currentBranch into main - production v$version"
    git push origin main

    Write-Host "       Switching back to $currentBranch..." -ForegroundColor Gray
    git checkout $currentBranch
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n  PUSH TO MAIN FAILED!" -ForegroundColor Red
    exit 1
}
Write-Host "       Main branch updated." -ForegroundColor Green

# ── Step 5: Push current branch to its remote ────────────────────────────────
Write-Host "`n[5/5] Syncing current branch remote..." -ForegroundColor Yellow
if ($currentBranch -ne "main" -and $currentBranch -ne "staging") {
    git push origin $currentBranch 2>$null
}
Write-Host "       Done." -ForegroundColor Green

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  PRODUCTION DEPLOY COMPLETE"                  -ForegroundColor Green
Write-Host "============================================"  -ForegroundColor Green
Write-Host "  Version   : v$version"                       -ForegroundColor Green
Write-Host "  Installer : release/"                        -ForegroundColor Green
Write-Host ""
Write-Host "  Render auto-deploying (main branch):"        -ForegroundColor Green
Write-Host "    - pbookspro-api"                           -ForegroundColor Green
Write-Host "    - pbookspro-admin"                         -ForegroundColor Green
Write-Host "    - pbookspro-website"                       -ForegroundColor Green
Write-Host "============================================`n" -ForegroundColor Green
