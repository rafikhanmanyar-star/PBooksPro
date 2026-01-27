# Test Staging API Connection
Write-Host "🧪 Testing Staging API Connection..." -ForegroundColor Cyan
Write-Host ""

# Test Health Endpoint
Write-Host "1️⃣ Testing /health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "https://pbookspro-api-staging.onrender.com/health" -ErrorAction Stop
    Write-Host "   ✅ Status: $($health.status)" -ForegroundColor Green
    Write-Host "   📊 Database: $($health.database)" -ForegroundColor $(if ($health.database -eq 'connected') { 'Green' } else { 'Yellow' })
    Write-Host "   🕐 Timestamp: $($health.timestamp)"
    
    if ($health.database -eq 'connected') {
        Write-Host ""
        Write-Host "   ✅ DATABASE CONNECTION IS WORKING!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "   ⚠️  Database shows as 'disconnected'" -ForegroundColor Yellow
        Write-Host "   💡 Check DATABASE_URL in Render Dashboard" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Error: $_" -ForegroundColor Red
    Write-Host "   💡 Service might be sleeping (first request takes 30-60 seconds)" -ForegroundColor Yellow
}
Write-Host ""

# Test Version Endpoint
Write-Host "2️⃣ Testing /api/app-info/version endpoint..." -ForegroundColor Yellow
try {
    $version = Invoke-RestMethod -Uri "https://pbookspro-api-staging.onrender.com/api/app-info/version" -ErrorAction Stop
    Write-Host "   ✅ Version: $($version.version)" -ForegroundColor Green
    Write-Host "   🌍 Environment: $($version.environment)" -ForegroundColor Green
    Write-Host "   📅 Build Date: $($version.buildDate)"
    Write-Host ""
    Write-Host "   ✅ Version endpoint is working!" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Version endpoint not available: $_" -ForegroundColor Yellow
    Write-Host "   (This might not be deployed yet - that's OK)" -ForegroundColor Gray
}
Write-Host ""

Write-Host "✨ Testing complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 If database shows 'disconnected', check:" -ForegroundColor Yellow
Write-Host "   1. Render Dashboard → pbookspro-api-staging → Environment tab" -ForegroundColor Gray
Write-Host "   2. Verify DATABASE_URL is set and points to pbookspro-db-staging" -ForegroundColor Gray
Write-Host "   3. Check API service logs for connection errors" -ForegroundColor Gray
