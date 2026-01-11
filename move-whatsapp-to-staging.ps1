# PowerShell script to rollback WhatsApp from main and move to staging
# This script uses safe revert (Option 1 - preserves history)

Write-Host "=== Rollback WhatsApp from Main and Move to Staging ===" -ForegroundColor Cyan
Write-Host ""

# Check current branch
$currentBranch = git rev-parse --abbrev-ref HEAD
Write-Host "Current branch: $currentBranch" -ForegroundColor Yellow

if ($currentBranch -ne "main" -and $currentBranch -ne "staging") {
    Write-Host "⚠️  Warning: Not on main or staging branch" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 1: Fetching latest changes..." -ForegroundColor Cyan
git fetch origin

Write-Host ""
Write-Host "Step 2: Checking out main branch..." -ForegroundColor Cyan
git checkout main
git pull origin main

Write-Host ""
Write-Host "Step 3: Reverting WhatsApp commit from main..." -ForegroundColor Cyan
Write-Host "This will create a revert commit that undoes the changes" -ForegroundColor Yellow
$revert = Read-Host "Continue? (y/n)"
if ($revert -ne "y" -and $revert -ne "Y") {
    Write-Host "Cancelled." -ForegroundColor Red
    exit
}

git revert 36112cf -m 1 --no-edit
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Revert failed. There may be conflicts." -ForegroundColor Red
    Write-Host "Resolve conflicts and run: git revert --continue" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Revert commit created" -ForegroundColor Green

Write-Host ""
Write-Host "Step 4: Pushing reverted main to origin..." -ForegroundColor Cyan
$pushMain = Read-Host "Push reverted main to origin? (y/n)"
if ($pushMain -eq "y" -or $pushMain -eq "Y") {
    git push origin main
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Push failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Main branch reverted and pushed" -ForegroundColor Green
} else {
    Write-Host "⚠️  Skipping push. You can push later with: git push origin main" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 5: Checking out staging branch..." -ForegroundColor Cyan
git checkout staging
git pull origin staging

Write-Host ""
Write-Host "Step 6: Cherry-picking WhatsApp commit to staging..." -ForegroundColor Cyan
$cherryPick = Read-Host "Continue? (y/n)"
if ($cherryPick -ne "y" -and $cherryPick -ne "Y") {
    Write-Host "Cancelled." -ForegroundColor Red
    exit
}

git cherry-pick 36112cf
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Cherry-pick failed. There may be conflicts." -ForegroundColor Red
    Write-Host "Resolve conflicts and run: git cherry-pick --continue" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ WhatsApp commit cherry-picked to staging" -ForegroundColor Green

Write-Host ""
Write-Host "Step 7: Pushing staging with WhatsApp changes..." -ForegroundColor Cyan
$pushStaging = Read-Host "Push staging to origin? (y/n)"
if ($pushStaging -eq "y" -or $pushStaging -eq "Y") {
    git push origin staging
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Push failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Staging branch pushed with WhatsApp changes" -ForegroundColor Green
} else {
    Write-Host "⚠️  Skipping push. You can push later with: git push origin staging" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  ✅ WhatsApp commit reverted from main" -ForegroundColor Green
Write-Host "  ✅ WhatsApp commit added to staging" -ForegroundColor Green
Write-Host ""
Write-Host "Verification:" -ForegroundColor Cyan
Write-Host "  git log origin/main --oneline -3    # Should show revert commit" -ForegroundColor Yellow
Write-Host "  git log origin/staging --oneline -3 # Should show WhatsApp commit" -ForegroundColor Yellow
