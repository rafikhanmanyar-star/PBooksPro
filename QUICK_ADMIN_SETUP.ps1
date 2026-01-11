# Quick Admin User Setup Script for Staging
# This script helps you set up the DATABASE_URL and create admin user

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Staging Admin User Setup" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "server")) {
    Write-Host "❌ Error: server directory not found!" -ForegroundColor Red
    Write-Host "   Please run this script from the project root directory" -ForegroundColor Yellow
    exit 1
}

Write-Host "Step 1: Checking .env file..." -ForegroundColor Yellow
$envPath = Join-Path "server" ".env"
$envExists = Test-Path $envPath

if (-not $envExists) {
    Write-Host "   ⚠️  .env file not found. Creating new one..." -ForegroundColor Yellow
    New-Item -Path $envPath -ItemType File -Force | Out-Null
}

Write-Host ""
Write-Host "Step 2: Get External Database URL from Render" -ForegroundColor Yellow
Write-Host "   1. Go to: https://dashboard.render.com" -ForegroundColor Gray
Write-Host "   2. Click on: pbookspro-db-staging database" -ForegroundColor Gray
Write-Host "   3. Go to: Info tab" -ForegroundColor Gray
Write-Host "   4. Copy: External Database URL" -ForegroundColor Gray
Write-Host ""
Write-Host "   The URL should look like:" -ForegroundColor Gray
Write-Host "   postgresql://user:pass@dpg-xxx-a.oregon-postgres.render.com:5432/dbname" -ForegroundColor Cyan
Write-Host ""

$databaseUrl = Read-Host "   Paste External Database URL here"

if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    Write-Host "   ❌ Database URL cannot be empty!" -ForegroundColor Red
    exit 1
}

# Validate URL format
if (-not $databaseUrl.Contains(".render.com")) {
    Write-Host "   ⚠️  Warning: URL doesn't contain '.render.com'" -ForegroundColor Yellow
    Write-Host "   Make sure you're using the External Database URL (not Internal)" -ForegroundColor Yellow
    $continue = Read-Host "   Continue anyway? (y/n)"
    if ($continue -ne "y") {
        exit 1
    }
}

Write-Host ""
Write-Host "Step 3: Updating .env file..." -ForegroundColor Yellow

# Read existing .env or create new content
$envContent = @()
if ($envExists) {
    $envContent = Get-Content $envPath
}

# Remove existing DATABASE_URL and NODE_ENV if present
$envContent = $envContent | Where-Object {
    -not ($_ -match "^DATABASE_URL=") -and
    -not ($_ -match "^NODE_ENV=")
}

# Add new values
$envContent += "DATABASE_URL=$databaseUrl"
$envContent += "NODE_ENV=staging"

# Write to file
$envContent | Set-Content $envPath -Encoding UTF8

Write-Host "   ✅ .env file updated!" -ForegroundColor Green
Write-Host ""

Write-Host "Step 4: Running create-admin script..." -ForegroundColor Yellow
Write-Host ""

Set-Location server

try {
    npm run create-admin
    
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "  ✅ Setup Complete!" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now log in to:" -ForegroundColor Cyan
    Write-Host "  https://pbookspro-admin-staging.onrender.com" -ForegroundColor White
    Write-Host ""
    Write-Host "Credentials:" -ForegroundColor Cyan
    Write-Host "  Username: Admin" -ForegroundColor White
    Write-Host "  Password: admin123" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ Error running script:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Check that DATABASE_URL in server/.env is correct" -ForegroundColor Gray
    Write-Host "  2. Verify External Database URL from Render Dashboard" -ForegroundColor Gray
    Write-Host "  3. Make sure URL includes .render.com in hostname" -ForegroundColor Gray
    Write-Host ""
    exit 1
} finally {
    Set-Location ..
}
