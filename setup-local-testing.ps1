# Local Testing Setup Script
# This script helps you set up environment files for local testing with Render

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("frontend-only", "full-local", "help")]
    [string]$Mode = "help"
)

$projectRoot = Get-Location

Write-Host "🚀 Local Testing Setup for Render" -ForegroundColor Cyan
Write-Host ""

if ($Mode -eq "help") {
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\setup-local-testing.ps1 -Mode frontend-only  # Local frontend → Render API" -ForegroundColor White
    Write-Host "  .\setup-local-testing.ps1 -Mode full-local      # Local everything → Render DB" -ForegroundColor White
    Write-Host ""
    Write-Host "Modes:" -ForegroundColor Yellow
    Write-Host "  frontend-only: Local client/admin apps → Render API" -ForegroundColor White
    Write-Host "  full-local:    Local server/client/admin → Render Database" -ForegroundColor White
    exit
}

if ($Mode -eq "frontend-only") {
    Write-Host "📋 Setting up: Local Frontend → Render API" -ForegroundColor Green
    Write-Host ""
    
    # Get Render API URL
    $apiUrl = Read-Host "Enter Render API URL (e.g., https://pbookspro-api.onrender.com)"
    if ([string]::IsNullOrWhiteSpace($apiUrl)) {
        $apiUrl = "https://pbookspro-api.onrender.com"
    }
    
    # Remove trailing slash
    $apiUrl = $apiUrl.TrimEnd('/')
    
    # Create client .env
    Write-Host "📝 Creating client .env..." -ForegroundColor Cyan
    $clientEnv = @"
# Client Application - Local Testing with Render API
VITE_API_URL=$apiUrl/api
"@
    $clientEnv | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline
    Write-Host "   ✅ Created .env" -ForegroundColor Green
    
    # Create admin .env
    Write-Host "📝 Creating admin .env..." -ForegroundColor Cyan
    $adminEnv = @"
# Admin Portal - Local Testing with Render API
VITE_ADMIN_API_URL=$apiUrl/api/admin
"@
    $adminEnv | Out-File -FilePath "admin\.env" -Encoding UTF8 -NoNewline
    Write-Host "   ✅ Created admin\.env" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "✅ Setup complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠️  IMPORTANT: Update CORS on Render!" -ForegroundColor Yellow
    Write-Host "   1. Go to Render Dashboard → API Service → Environment" -ForegroundColor White
    Write-Host "   2. Update CORS_ORIGIN to include: http://localhost:5173,http://localhost:5174" -ForegroundColor White
    Write-Host "   3. Save changes" -ForegroundColor White
    Write-Host ""
    Write-Host "🚀 Start development:" -ForegroundColor Cyan
    Write-Host "   Terminal 1: npm run dev" -ForegroundColor White
    Write-Host "   Terminal 2: cd admin && npm run dev" -ForegroundColor White
}

if ($Mode -eq "full-local") {
    Write-Host "📋 Setting up: Local Server → Render Database" -ForegroundColor Green
    Write-Host ""
    
    # Get Database URL
    Write-Host "📊 Database Configuration" -ForegroundColor Cyan
    Write-Host "   Get External Database URL from:" -ForegroundColor White
    Write-Host "   Render Dashboard → Database → Connections" -ForegroundColor White
    Write-Host ""
    $dbUrl = Read-Host "Enter External Database URL"
    
    if ([string]::IsNullOrWhiteSpace($dbUrl)) {
        Write-Host "❌ Database URL is required!" -ForegroundColor Red
        exit 1
    }
    
    # Get JWT Secret
    $jwtSecret = Read-Host "Enter JWT Secret (or press Enter for default)"
    if ([string]::IsNullOrWhiteSpace($jwtSecret)) {
        $jwtSecret = "local-development-secret-key-$(Get-Random)"
    }
    
    # Create server .env
    Write-Host ""
    Write-Host "📝 Creating server .env..." -ForegroundColor Cyan
    $serverEnv = @"
# Server - Local Development with Render Database
DATABASE_URL=$dbUrl
JWT_SECRET=$jwtSecret
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
LICENSE_SECRET_SALT=PBOOKSPRO_SECURE_SALT_2024
"@
    $serverEnv | Out-File -FilePath "server\.env" -Encoding UTF8 -NoNewline
    Write-Host "   ✅ Created server\.env" -ForegroundColor Green
    
    # Create client .env
    Write-Host "📝 Creating client .env..." -ForegroundColor Cyan
    $clientEnv = @"
# Client Application - Local Testing with Local Server
VITE_API_URL=http://localhost:3000/api
"@
    $clientEnv | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline
    Write-Host "   ✅ Created .env" -ForegroundColor Green
    
    # Create admin .env
    Write-Host "📝 Creating admin .env..." -ForegroundColor Cyan
    $adminEnv = @"
# Admin Portal - Local Testing with Local Server
VITE_ADMIN_API_URL=http://localhost:3000/api/admin
"@
    $adminEnv | Out-File -FilePath "admin\.env" -Encoding UTF8 -NoNewline
    Write-Host "   ✅ Created admin\.env" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "✅ Setup complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Start all services:" -ForegroundColor Cyan
    Write-Host "   Terminal 1: cd server && npm run dev" -ForegroundColor White
    Write-Host "   Terminal 2: npm run dev" -ForegroundColor White
    Write-Host "   Terminal 3: cd admin && npm run dev" -ForegroundColor White
}

Write-Host ""
Write-Host "📚 See LOCAL_TESTING_WITH_RENDER.md for detailed guide" -ForegroundColor Cyan

