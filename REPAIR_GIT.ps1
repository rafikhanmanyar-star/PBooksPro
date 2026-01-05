# Git Repair and Setup Script for MyProjectBooks
# This script repairs git configuration and prepares for pushing to GitHub

$ErrorActionPreference = "Stop"
$projectPath = "H:\AntiGravity projects\V1.1.3\MyProjectBooks"
Set-Location $projectPath

Write-Host "🔧 Git Repair and Setup Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify Git is installed
Write-Host "📋 Step 1: Checking Git installation..." -ForegroundColor Yellow
try {
    $gitVersion = git --version
    Write-Host "✅ Git is installed: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Git is not installed or not in PATH" -ForegroundColor Red
    Write-Host "   Please install Git from https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}

# Step 2: Check if repository is initialized
Write-Host ""
Write-Host "📋 Step 2: Checking repository status..." -ForegroundColor Yellow
if (-not (Test-Path ".git")) {
    Write-Host "⚠️  Git repository not initialized" -ForegroundColor Yellow
    Write-Host "🔄 Initializing Git repository..." -ForegroundColor Green
    git init
    Write-Host "✅ Repository initialized" -ForegroundColor Green
} else {
    Write-Host "✅ Git repository is initialized" -ForegroundColor Green
}

# Step 3: Check remote configuration
Write-Host ""
Write-Host "📋 Step 3: Checking remote configuration..." -ForegroundColor Yellow
$remoteUrl = git config --get remote.origin.url
if ($remoteUrl) {
    Write-Host "✅ Remote 'origin' is configured: $remoteUrl" -ForegroundColor Green
} else {
    Write-Host "⚠️  No remote 'origin' configured" -ForegroundColor Yellow
    $addRemote = Read-Host "Enter GitHub repository URL (or press Enter to skip)"
    if ($addRemote) {
        git remote add origin $addRemote
        Write-Host "✅ Remote 'origin' added" -ForegroundColor Green
    }
}

# Step 4: Fix submodule issues
Write-Host ""
Write-Host "📋 Step 4: Checking submodule configuration..." -ForegroundColor Yellow
$submoduleStatus = git submodule status 2>&1
if ($LASTEXITCODE -ne 0 -or $submoduleStatus -match "fatal|error") {
    Write-Host "⚠️  Submodule configuration issue detected" -ForegroundColor Yellow
    
    # Check if update-server and website/Website are tracked as submodules
    $updateServerTracked = git ls-files --stage | Select-String "update-server" | Select-String "160000"
    $websiteTracked = git ls-files --stage | Select-String "website/Website" | Select-String "160000"
    
    if ($updateServerTracked -or $websiteTracked) {
        Write-Host "   Found directories tracked as submodules without .gitmodules" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "   Options:" -ForegroundColor Cyan
        Write-Host "   1. Remove submodule status (treat as regular directories)" -ForegroundColor White
        Write-Host "   2. Create proper .gitmodules file (if they should be submodules)" -ForegroundColor White
        Write-Host ""
        $choice = Read-Host "Choose option (1=remove submodule status, 2=create .gitmodules, default: 1)"
        
        if ([string]::IsNullOrWhiteSpace($choice) -or $choice -eq "1") {
            Write-Host "🔄 Removing submodule status..." -ForegroundColor Green
            
            # Remove from index
            if ($updateServerTracked) {
                git rm --cached update-server 2>&1 | Out-Null
                Write-Host "   ✅ Removed update-server from submodule tracking" -ForegroundColor Green
            }
            if ($websiteTracked) {
                git rm --cached website/Website 2>&1 | Out-Null
                Write-Host "   ✅ Removed website/Website from submodule tracking" -ForegroundColor Green
            }
            
            # Add as regular directories
            git add update-server website/Website 2>&1 | Out-Null
            Write-Host "   ✅ Added as regular directories" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Submodule setup requires manual configuration" -ForegroundColor Yellow
            Write-Host "   Please configure .gitmodules file manually" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "✅ Submodules are properly configured" -ForegroundColor Green
}

# Step 5: Check current status
Write-Host ""
Write-Host "📋 Step 5: Checking repository status..." -ForegroundColor Yellow
git status --short

# Step 6: Verify branch configuration
Write-Host ""
Write-Host "📋 Step 6: Checking branch configuration..." -ForegroundColor Yellow
$currentBranch = git branch --show-current
if ($currentBranch) {
    Write-Host "✅ Current branch: $currentBranch" -ForegroundColor Green
} else {
    Write-Host "⚠️  No branch checked out" -ForegroundColor Yellow
    git checkout -b main
    Write-Host "✅ Created and switched to 'main' branch" -ForegroundColor Green
}

# Step 7: Test remote connectivity
Write-Host ""
Write-Host "📋 Step 7: Testing remote connectivity..." -ForegroundColor Yellow
if ($remoteUrl) {
    try {
        git ls-remote --heads origin 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Successfully connected to remote repository" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Could not connect to remote (authentication may be required)" -ForegroundColor Yellow
            Write-Host "   This is normal if you haven't set up credentials yet" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  Could not test remote connectivity" -ForegroundColor Yellow
    }
}

# Step 8: Check for uncommitted changes
Write-Host ""
Write-Host "📋 Step 8: Checking for changes to commit..." -ForegroundColor Yellow
$status = git status --porcelain
if ($status) {
    Write-Host "📝 Found uncommitted changes:" -ForegroundColor Cyan
    git status --short
    Write-Host ""
    $commit = Read-Host "Would you like to commit these changes? (y/n)"
    if ($commit -eq "y") {
        $message = Read-Host "Enter commit message (or press Enter for default)"
        if ([string]::IsNullOrWhiteSpace($message)) {
            $message = "Update project files"
        }
        Write-Host "🔄 Staging changes..." -ForegroundColor Green
        git add .
        Write-Host "💾 Committing changes..." -ForegroundColor Green
        git commit -m $message
        Write-Host "✅ Changes committed" -ForegroundColor Green
    }
} else {
    Write-Host "✅ No uncommitted changes" -ForegroundColor Green
}

# Step 9: Check if there are commits to push
Write-Host ""
Write-Host "📋 Step 9: Checking if there are commits to push..." -ForegroundColor Yellow
if ($remoteUrl) {
    $ahead = git rev-list --count @{u}..HEAD 2>&1
    if ($LASTEXITCODE -eq 0 -and $ahead -gt 0) {
        Write-Host "📤 Found $ahead commit(s) to push" -ForegroundColor Cyan
        Write-Host ""
        $push = Read-Host "Would you like to push now? (y/n)"
        if ($push -eq "y") {
            Write-Host "🚀 Pushing to origin/$currentBranch..." -ForegroundColor Green
            git push origin $currentBranch
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Successfully pushed to GitHub!" -ForegroundColor Green
            } else {
                Write-Host "❌ Push failed. This might be due to:" -ForegroundColor Red
                Write-Host "   - Authentication issues (need GitHub credentials)" -ForegroundColor Yellow
                Write-Host "   - Network connectivity" -ForegroundColor Yellow
                Write-Host "   - Branch protection rules" -ForegroundColor Yellow
                Write-Host ""
                Write-Host "💡 To set up authentication:" -ForegroundColor Cyan
                Write-Host "   1. Use GitHub Desktop, or" -ForegroundColor White
                Write-Host "   2. Use Personal Access Token:" -ForegroundColor White
                Write-Host "      git remote set-url origin https://YOUR_TOKEN@github.com/rafikhanmanyar-star/PBooksPro.git" -ForegroundColor Yellow
                Write-Host "   3. Or use SSH: git remote set-url origin git@github.com:rafikhanmanyar-star/PBooksPro.git" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "✅ Everything is up to date (no commits to push)" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  No remote configured - skipping push check" -ForegroundColor Yellow
}

# Summary
Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "✅ Git repair complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Summary:" -ForegroundColor Cyan
Write-Host "   - Repository: $(Get-Location)" -ForegroundColor White
Write-Host "   - Branch: $currentBranch" -ForegroundColor White
if ($remoteUrl) {
    Write-Host "   - Remote: $remoteUrl" -ForegroundColor White
}
Write-Host ""
Write-Host "📚 Useful commands:" -ForegroundColor Cyan
Write-Host "   git status              - Check repository status" -ForegroundColor White
Write-Host "   git add .               - Stage all changes" -ForegroundColor White
Write-Host "   git commit -m 'message' - Commit changes" -ForegroundColor White
Write-Host "   git push                - Push to GitHub" -ForegroundColor White
Write-Host "   git pull                - Pull latest changes" -ForegroundColor White
Write-Host ""

