# PBooks Pro - Deploy to Staging
# 1) Increment patch version  2) Build electron staging installer  3) Register release  4) Push to staging branch
#
# Usage:  .\deploy-staging.ps1
#   or:   npm run deploy:staging

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  PBooks Pro - Deploy to STAGING"        -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$currentBranch = git rev-parse --abbrev-ref HEAD
Write-Host "  Current branch: $currentBranch" -ForegroundColor Gray

# ── Step 1: Increment patch version ──────────────────────────────────────────
Write-Host "`n[1/7] Incrementing version (patch)..." -ForegroundColor Yellow

npm version patch --no-git-tag-version | Out-Null
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version

Write-Host "       New version: v$version" -ForegroundColor Green

# ── Step 2: Build electron staging installer ─────────────────────────────────
Write-Host "`n[2/7] Building staging electron installer..." -ForegroundColor Yellow
Write-Host "       Output: release-staging/" -ForegroundColor Gray

npm run electron:staging:installer
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n  BUILD FAILED! Aborting deploy." -ForegroundColor Red
    exit 1
}

Write-Host "       Build complete." -ForegroundColor Green

# ── Step 3: Copy latest.yml for auto-update ──────────────────────────────────
Write-Host "`n[3/7] Copying latest.yml for auto-update..." -ForegroundColor Yellow

$latestYml = "release-staging\latest.yml"
if (Test-Path $latestYml) {
    Copy-Item $latestYml "server\updates\latest.yml" -Force
    Copy-Item $latestYml "website\Website\updates\latest.yml" -Force
    Write-Host "       Copied to server/updates/ and website/Website/updates/" -ForegroundColor Green
} else {
    Write-Host "       WARNING: latest.yml not found in release-staging/" -ForegroundColor Red
}

# ── Step 4: Register release and upload to GitHub Releases ───────────────────
Write-Host "`n[4/7] Registering release in releases.json..." -ForegroundColor Yellow

$releaseDir = "release-staging"
$setupExe = Get-ChildItem -Path $releaseDir -Filter "*.exe" -ErrorAction SilentlyContinue |
    Where-Object { ($_.Name -like "*WebSetup*" -or $_.Name -like "*Setup*") -and $_.Name -notmatch "unpacked|uninstall" } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
$sevenZipParts = Get-ChildItem -Path $releaseDir -Filter "*.7z" -ErrorAction SilentlyContinue

$releasesJsonPath = "server\releases\releases.json"
$releasesData = Get-Content $releasesJsonPath -Raw | ConvertFrom-Json

$newFiles = @()

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
foreach ($part in $sevenZipParts) {
    Write-Host "       Resource: $($part.Name) ($([math]::Round($part.Length / 1MB, 1)) MB)" -ForegroundColor Gray
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

    # Build asset arguments: web setup exe + .7z resource packs + latest.yml + blockmaps
    $assets = @()
    if (Test-Path $latestYml) { $assets += (Resolve-Path $latestYml).Path }
    if ($setupExe) { $assets += $setupExe.FullName }
    foreach ($part in $sevenZipParts) { $assets += $part.FullName }
    $blockmapAssets = Get-ChildItem -Path $releaseDir -Filter "*.blockmap" -ErrorAction SilentlyContinue
    foreach ($bm in $blockmapAssets) { $assets += $bm.FullName }

    gh release create $ghTag @assets --title "v$version (Staging)" --notes "Staging release v$version" --prerelease 2>&1 | Write-Host

    if ($LASTEXITCODE -eq 0) {
        Write-Host "       GitHub Release created." -ForegroundColor Green
        $repoUrl = (gh repo view --json url -q ".url" 2>&1).Trim()

        foreach ($f in $newFiles) {
            $encodedName = [Uri]::EscapeDataString($f.name)
            $f.downloadUrl = "$repoUrl/releases/download/$ghTag/$encodedName"
        }
    } else {
        Write-Host "       WARNING: GitHub Release creation failed. Setting local API download URLs." -ForegroundColor Red
        $apiBase = "https://pbookspro-api-staging.onrender.com/api/app-info"
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
    $apiBase = "https://pbookspro-api-staging.onrender.com/api/app-info"
    foreach ($f in $newFiles) {
        $encodedName = [Uri]::EscapeDataString($f.name)
        $f.downloadUrl = "$apiBase/releases/download/$encodedName"
    }
}

# Add new release entry to releases.json
$newRelease = @{
    version = $version
    date = (Get-Date).ToUniversalTime().ToString("o")
    environment = "staging"
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

# ── Step 5: Stage all changes ────────────────────────────────────────────────
Write-Host "`n[5/7] Staging changes..." -ForegroundColor Yellow
git add -A

# ── Step 6: Commit ───────────────────────────────────────────────────────────
Write-Host "[6/7] Committing..." -ForegroundColor Yellow
git commit -m "v$version - staging deploy"
if ($LASTEXITCODE -ne 0) {
    Write-Host "       Nothing new to commit, continuing..." -ForegroundColor Yellow
}

# ── Step 7: Push to staging branch ONLY ──────────────────────────────────────
Write-Host "`n[7/7] Pushing to staging branch only (not main)..." -ForegroundColor Yellow

git push origin "${currentBranch}:staging" --force-with-lease 2>&1 | Write-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n  PUSH FAILED!" -ForegroundColor Red
    exit 1
}

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  STAGING DEPLOY COMPLETE"                -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Version   : v$version"                  -ForegroundColor Green
Write-Host "  Installer : release-staging/"            -ForegroundColor Green
Write-Host ""
Write-Host "  Render auto-deploying (staging branch):" -ForegroundColor Green
Write-Host "    - pbookspro-api-staging"               -ForegroundColor Green
Write-Host "    - pbookspro-admin-staging"             -ForegroundColor Green
Write-Host "    - pbookspro-website-staging"           -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green
