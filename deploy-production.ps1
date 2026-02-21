# PBooks Pro - Deploy to Production
# 1) Build electron production installer  2) Register release  3) Push to staging  4) Merge into main
#
# Usage:  .\deploy-production.ps1
#   or:   npm run deploy:production

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
Write-Host "`n[1/6] Building production electron installer..." -ForegroundColor Yellow
Write-Host "       Output: release/" -ForegroundColor Gray

npm run electron:production:installer
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n  BUILD FAILED! Aborting deploy." -ForegroundColor Red
    exit 1
}

Write-Host "       Build complete." -ForegroundColor Green

# ── Step 2: Copy latest.yml for auto-update ──────────────────────────────────
Write-Host "`n[2/6] Copying latest.yml for auto-update..." -ForegroundColor Yellow

$latestYml = "release\latest.yml"
if (Test-Path $latestYml) {
    Copy-Item $latestYml "server\updates\latest.yml" -Force
    Copy-Item $latestYml "website\Website\updates\latest.yml" -Force
    Write-Host "       Copied to server/updates/ and website/Website/updates/" -ForegroundColor Green
} else {
    Write-Host "       WARNING: latest.yml not found in release/" -ForegroundColor Red
}

# ── Step 3: Register release and upload to GitHub Releases ───────────────────
Write-Host "`n[3/6] Registering release in releases.json..." -ForegroundColor Yellow

$releaseDir = "release"
$setupExe = Get-ChildItem -Path $releaseDir -Filter "*.exe" | Where-Object { $_.Name -like "*Setup*$version*" } | Select-Object -First 1
$portableExe = Get-ChildItem -Path $releaseDir -Filter "*.exe" | Where-Object { $_.Name -notlike "*Setup*" -and $_.Name -like "*$version*" } | Select-Object -First 1
if (-not $setupExe) {
    $setupExe = Get-ChildItem -Path $releaseDir -Filter "*.exe" | Where-Object { $_.Name -like "*Setup*" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($setupExe) { Write-Host "       WARNING: No Setup exe matched version $version, using latest: $($setupExe.Name)" -ForegroundColor Yellow }
}
if (-not $portableExe) {
    $portableExe = Get-ChildItem -Path $releaseDir -Filter "*.exe" | Where-Object { $_.Name -notlike "*Setup*" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($portableExe) { Write-Host "       WARNING: No portable exe matched version $version, using latest: $($portableExe.Name)" -ForegroundColor Yellow }
}

$releasesJsonPath = "server\releases\releases.json"
$releasesData = Get-Content $releasesJsonPath -Raw | ConvertFrom-Json

$newFiles = @()

# Build file entries
if ($setupExe) {
    $hash = (Get-FileHash -Path $setupExe.FullName -Algorithm SHA512).Hash
    $newFiles += @{
        name = $setupExe.Name
        type = "installer"
        size = $setupExe.Length
        sha512 = $hash
        downloadUrl = ""
    }
    Write-Host "       Setup:    $($setupExe.Name) ($([math]::Round($setupExe.Length / 1MB, 1)) MB)" -ForegroundColor Gray
}
if ($portableExe) {
    $hash = (Get-FileHash -Path $portableExe.FullName -Algorithm SHA512).Hash
    $newFiles += @{
        name = $portableExe.Name
        type = "portable"
        size = $portableExe.Length
        sha512 = $hash
        downloadUrl = ""
    }
    Write-Host "       Portable: $($portableExe.Name) ($([math]::Round($portableExe.Length / 1MB, 1)) MB)" -ForegroundColor Gray
}

# Upload to GitHub Releases if gh CLI is available
$ghAvailable = $false
# Ensure gh CLI is on PATH (common install locations)
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    $ghPaths = @("C:\Program Files\GitHub CLI", "C:\Program Files (x86)\GitHub CLI", "$env:LOCALAPPDATA\Programs\GitHub CLI")
    foreach ($p in $ghPaths) {
        if (Test-Path "$p\gh.exe") { $env:PATH = "$p;$env:PATH"; break }
    }
}
try {
    $null = gh --version 2>&1
    if ($LASTEXITCODE -eq 0) { $ghAvailable = $true }
} catch { }

$ghTag = "V$version"

if ($ghAvailable -and ($setupExe -or $portableExe)) {
    Write-Host "       Uploading to GitHub Releases (tag: $ghTag)..." -ForegroundColor Yellow

    # Delete existing release with same tag if it exists
    gh release delete $ghTag --yes 2>&1 | Out-Null

    # Build asset arguments (blockmap files only; .exe files are uploaded manually due to size)
    $assets = @()
    $blockmapAssets = Get-ChildItem -Path $releaseDir -Filter "*.blockmap" -ErrorAction SilentlyContinue
    foreach ($bm in $blockmapAssets) { $assets += $bm.FullName }

    gh release create $ghTag @assets --title "v$version" --notes "Production release v$version" --latest 2>&1 | Write-Host

    if ($LASTEXITCODE -eq 0) {
        Write-Host "       GitHub Release created (blockmap uploaded)." -ForegroundColor Green

        # Get the repo info for download URLs
        $repoUrl = (gh repo view --json url -q ".url" 2>&1).Trim()

        foreach ($f in $newFiles) {
            $encodedName = [Uri]::EscapeDataString($f.name)
            $f.downloadUrl = "$repoUrl/releases/download/$ghTag/$encodedName"
        }

        Write-Host ""
        Write-Host "       REMINDER: Manually upload .exe files to GitHub Release ($ghTag):" -ForegroundColor Yellow
        if ($setupExe)    { Write-Host "         - $($setupExe.Name)" -ForegroundColor Yellow }
        if ($portableExe) { Write-Host "         - $($portableExe.Name)" -ForegroundColor Yellow }
        Write-Host "         URL: $repoUrl/releases/tag/$ghTag" -ForegroundColor Gray
    } else {
        Write-Host "       WARNING: GitHub Release creation failed. Setting local API download URLs." -ForegroundColor Red
        $apiBase = "https://api.pbookspro.com/api/app-info"
        foreach ($f in $newFiles) {
            $encodedName = [Uri]::EscapeDataString($f.name)
            $f.downloadUrl = "$apiBase/releases/download/$encodedName"
        }
    }
} else {
    if (-not $ghAvailable) {
        Write-Host "       gh CLI not found. Skipping GitHub Release upload." -ForegroundColor Yellow
        Write-Host "       Install: https://cli.github.com/ then run: gh auth login" -ForegroundColor Gray
    }
    $apiBase = "https://api.pbookspro.com/api/app-info"
    foreach ($f in $newFiles) {
        $encodedName = [Uri]::EscapeDataString($f.name)
        $f.downloadUrl = "$apiBase/releases/download/$encodedName"
    }
}

# Add new release entry to releases.json
$newRelease = @{
    version = $version
    date = (Get-Date).ToUniversalTime().ToString("o")
    environment = "production"
    files = $newFiles
    changelog = ""
}

# Append to releases array
$releasesList = [System.Collections.ArrayList]@()
if ($releasesData.releases) {
    foreach ($r in $releasesData.releases) { $releasesList.Add($r) | Out-Null }
}
$releasesList.Add($newRelease) | Out-Null

$releasesData.releases = $releasesList.ToArray()
$jsonContent = $releasesData | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($releasesJsonPath, $jsonContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "       Release v$version registered in releases.json" -ForegroundColor Green

# Copy installer and blockmap to server/releases/ for auto-update serving
if ($setupExe) {
    Copy-Item $setupExe.FullName "server\releases\" -Force
    Write-Host "       Copied installer to server/releases/" -ForegroundColor Gray
}
$blockmapFiles = Get-ChildItem -Path $releaseDir -Filter "*.blockmap" -ErrorAction SilentlyContinue
foreach ($bm in $blockmapFiles) {
    Copy-Item $bm.FullName "server\releases\" -Force
    Write-Host "       Copied $($bm.Name) to server/releases/ (differential updates)" -ForegroundColor Gray
}

# ── Step 4: Stage & commit ───────────────────────────────────────────────────
Write-Host "`n[4/6] Committing changes..." -ForegroundColor Yellow
git add -A
git commit -m "v$version - production deploy"
if ($LASTEXITCODE -ne 0) {
    Write-Host "       Nothing new to commit, continuing..." -ForegroundColor Yellow
}

# ── Step 5: Push to staging branch ───────────────────────────────────────────
Write-Host "`n[5/6] Pushing to staging branch..." -ForegroundColor Yellow

git push origin "${currentBranch}:staging" --force-with-lease 2>&1 | Write-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n  PUSH TO STAGING FAILED!" -ForegroundColor Red
    exit 1
}
Write-Host "       Staging branch updated." -ForegroundColor Green

# ── Step 6: Merge into main and push ─────────────────────────────────────────
Write-Host "`n[6/6] Merging into main branch..." -ForegroundColor Yellow

if ($currentBranch -eq "main") {
    git push origin main 2>&1 | Write-Host
} else {
    git checkout main 2>&1 | Write-Host
    git pull origin main --ff-only 2>&1 | Write-Host
    git merge $currentBranch -m "Merge $currentBranch into main - production v$version" 2>&1 | Write-Host
    git push origin main 2>&1 | Write-Host

    Write-Host "       Switching back to $currentBranch..." -ForegroundColor Gray
    git checkout $currentBranch 2>&1 | Write-Host
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n  PUSH TO MAIN FAILED!" -ForegroundColor Red
    exit 1
}
Write-Host "       Main branch updated." -ForegroundColor Green

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
