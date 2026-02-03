# Quick Git Setup Script for PBooksPro
# Run this in PowerShell from your project root

# Navigate to project folder (adjust path if needed)
$projectPath = "f:\AntiGravity projects\PBooksPro"
Set-Location $projectPath

Write-Host "📁 Current directory: $(Get-Location)" -ForegroundColor Cyan
Write-Host ""

# Check if Git is already initialized
if (Test-Path ".git") {
    Write-Host "⚠️  Git is already initialized in this folder" -ForegroundColor Yellow
    Write-Host "   If you want to start fresh, delete the .git folder first" -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y") {
        exit
    }
}
else {
    # Initialize Git
    Write-Host "🔄 Initializing Git repository..." -ForegroundColor Green
    git init
    Write-Host "✅ Git initialized" -ForegroundColor Green
    Write-Host ""
}

# Check .gitignore exists
if (Test-Path ".gitignore") {
    Write-Host "✅ .gitignore found" -ForegroundColor Green
}
else {
    Write-Host "⚠️  .gitignore not found - creating one..." -ForegroundColor Yellow
    # Create basic .gitignore
    @"
node_modules
.env
*.log
dist
"@ | Out-File -FilePath ".gitignore" -Encoding UTF8
    Write-Host "✅ .gitignore created" -ForegroundColor Green
}

Write-Host ""
Write-Host "📋 Checking what will be committed..." -ForegroundColor Cyan
git status --short

Write-Host ""
Write-Host "⚠️  IMPORTANT: Verify that .env files are NOT listed above!" -ForegroundColor Yellow
Write-Host ""

$proceed = Read-Host "Proceed with adding files? (y/n)"
if ($proceed -ne "y") {
    Write-Host "❌ Cancelled" -ForegroundColor Red
    exit
}

# Add all files
Write-Host ""
Write-Host "📦 Adding files to Git..." -ForegroundColor Green
git add .

# Show what will be committed
Write-Host ""
Write-Host "📋 Files staged for commit:" -ForegroundColor Cyan
git status --short

Write-Host ""
$commitMessage = Read-Host "Enter commit message (or press Enter for default)"
if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $commitMessage = "Initial commit - Monorepo setup for Render deployment"
}

# Commit
Write-Host ""
Write-Host "💾 Committing files..." -ForegroundColor Green
git commit -m $commitMessage

Write-Host ""
Write-Host "✅ Git setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Create repository on GitHub: https://github.com/new" -ForegroundColor White
Write-Host "   2. DO NOT initialize with README, .gitignore, or license" -ForegroundColor White
Write-Host "   3. Copy the repository URL" -ForegroundColor White
Write-Host "   4. Run these commands:" -ForegroundColor White
Write-Host ""
Write-Host "      git remote add origin https://github.com/rafikhanmanyar-star/PBooksPro.git" -ForegroundColor Yellow
Write-Host "      git branch -M staging" -ForegroundColor Yellow
Write-Host "      git push -u origin staging" -ForegroundColor Yellow
Write-Host ""

