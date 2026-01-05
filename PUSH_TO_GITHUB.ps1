# Quick Push to GitHub Script
# Run this script to push your changes to GitHub

$ErrorActionPreference = "Continue"
$projectPath = "H:\AntiGravity projects\V1.1.3\MyProjectBooks"
Set-Location $projectPath

Write-Host "🚀 Push to GitHub Script" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host ""

# Check git status
Write-Host "📋 Checking repository status..." -ForegroundColor Yellow
git status --short

Write-Host ""
$hasChanges = git diff --quiet --exit-code 2>&1
$hasStaged = git diff --cached --quiet --exit-code 2>&1
$hasUntracked = git ls-files --others --exclude-standard | Measure-Object | Select-Object -ExpandProperty Count

if ($hasUntracked -gt 0 -or -not $hasChanges -or -not $hasStaged) {
    Write-Host "📝 Found changes to commit" -ForegroundColor Cyan
    Write-Host ""
    $add = Read-Host "Add all changes? (y/n)"
    if ($add -eq "y") {
        Write-Host "📦 Staging changes..." -ForegroundColor Green
        git add .
        Write-Host "✅ Changes staged" -ForegroundColor Green
        Write-Host ""
        
        $message = Read-Host "Enter commit message (or press Enter for default)"
        if ([string]::IsNullOrWhiteSpace($message)) {
            $message = "Update project files"
        }
        
        Write-Host "💾 Committing changes..." -ForegroundColor Green
        git commit -m $message
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Changes committed" -ForegroundColor Green
        } else {
            Write-Host "❌ Commit failed" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "⏭️  Skipping commit" -ForegroundColor Yellow
    }
}

# Check if there are commits to push
Write-Host ""
Write-Host "📤 Checking for commits to push..." -ForegroundColor Yellow
$currentBranch = git branch --show-current
$ahead = git rev-list --count @{u}..HEAD 2>&1

if ($LASTEXITCODE -eq 0 -and $ahead -gt 0) {
    Write-Host "Found $ahead commit(s) ahead of remote" -ForegroundColor Cyan
    Write-Host ""
    $push = Read-Host "Push to GitHub? (y/n)"
    if ($push -eq "y") {
        Write-Host "🚀 Pushing to origin/$currentBranch..." -ForegroundColor Green
        git push origin $currentBranch
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✅ Successfully pushed to GitHub!" -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "❌ Push failed. Possible issues:" -ForegroundColor Red
            Write-Host "   - Authentication required (GitHub credentials)" -ForegroundColor Yellow
            Write-Host "   - Network connectivity" -ForegroundColor Yellow
            Write-Host "   - Branch protection rules" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "💡 Solutions:" -ForegroundColor Cyan
            Write-Host "   1. Use GitHub Desktop for authentication" -ForegroundColor White
            Write-Host "   2. Use Personal Access Token:" -ForegroundColor White
            Write-Host "      git remote set-url origin https://YOUR_TOKEN@github.com/rafikhanmanyar-star/PBooksPro.git" -ForegroundColor Yellow
            Write-Host "   3. Use SSH (if configured):" -ForegroundColor White
            Write-Host "      git remote set-url origin git@github.com:rafikhanmanyar-star/PBooksPro.git" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "✅ Everything is up to date (no commits to push)" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Done!" -ForegroundColor Green

