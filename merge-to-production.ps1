# Merge Staging to Production Script
# Usage: .\merge-to-production.ps1
#
# This script:
# 1. Updates staging branch
# 2. Creates a backup tag
# 3. Merges staging into main (production)
# 4. Pushes to production
# 5. Provides next steps for verification

$ErrorActionPreference = "Stop"

Write-Host "Starting production upgrade from staging..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Check for uncommitted changes
Write-Host "Checking git status..." -ForegroundColor Yellow
$status = git status --porcelain
if ($status) {
    Write-Host "You have uncommitted changes. Please commit or stash them first." -ForegroundColor Red
    Write-Host ""
    Write-Host "Uncommitted files:" -ForegroundColor Yellow
    $status | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
    Write-Host ""
    Write-Host "To commit changes: git add . ; git commit -m 'Your message'" -ForegroundColor Yellow
    Write-Host "To stash changes: git stash" -ForegroundColor Yellow
    exit 1
}
Write-Host "Working directory is clean" -ForegroundColor Green
Write-Host ""

# Step 2: Update staging
Write-Host "Updating staging branch..." -ForegroundColor Yellow
git checkout staging
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to checkout staging" -ForegroundColor Red
    exit 1
}
git pull origin staging
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to pull staging" -ForegroundColor Red
    exit 1
}
Write-Host "Staging branch is up to date" -ForegroundColor Green
Write-Host ""

# Step 3: Create backup tag
Write-Host "Creating backup tag..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
git checkout main
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to checkout main" -ForegroundColor Red
    exit 1
}
git tag "backup-before-merge-$timestamp"
Write-Host "Created backup tag: backup-before-merge-$timestamp" -ForegroundColor Green
Write-Host ""

# Step 4: Switch to production
Write-Host "Switching to main branch..." -ForegroundColor Yellow
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to pull main" -ForegroundColor Red
    exit 1
}
Write-Host "Main branch is up to date" -ForegroundColor Green
Write-Host ""

# Step 5: Merge staging
Write-Host "Merging staging into main..." -ForegroundColor Yellow
$mergeMessage = "Merge staging to production: $timestamp"
git merge staging --no-ff -m $mergeMessage
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Merge conflicts detected! Please resolve them manually." -ForegroundColor Red
    Write-Host ""
    Write-Host "To resolve conflicts:" -ForegroundColor Yellow
    Write-Host "   1. Open conflicted files and resolve manually" -ForegroundColor White
    Write-Host "   2. Stage resolved files: git add ." -ForegroundColor White
    Write-Host "   3. Complete merge: git commit" -ForegroundColor White
    Write-Host "   4. Push to production: git push origin main" -ForegroundColor White
    exit 1
}
Write-Host "Merge completed successfully" -ForegroundColor Green
Write-Host ""

# Step 6: Push to production
Write-Host "Pushing to production..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to push to production" -ForegroundColor Red
    exit 1
}
Write-Host "Pushed to production successfully" -ForegroundColor Green

# Push tags
git push origin --tags
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to push tags (non-critical)" -ForegroundColor Yellow
} else {
    Write-Host "Pushed backup tag to remote" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Production upgrade completed successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Wait for deployment to complete (check Render dashboard)" -ForegroundColor White
Write-Host ""
Write-Host "2. Verify database migrations:" -ForegroundColor White
Write-Host "   cd server" -ForegroundColor Gray
Write-Host "   npm run verify-rental-migration" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Check server startup logs for:" -ForegroundColor White
Write-Host "   - org_id migration completed" -ForegroundColor Gray
Write-Host "   - contact_id migration completed" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Test rental agreements API endpoint:" -ForegroundColor White
Write-Host "   GET /api/rental-agreements" -ForegroundColor Gray
Write-Host "   Expected: 200 OK with rental agreements array" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Monitor server logs for errors:" -ForegroundColor White
Write-Host "   - Database errors related to org_id or contact_id" -ForegroundColor Gray
Write-Host "   - 500 errors on rental agreements endpoint" -ForegroundColor Gray
Write-Host ""
