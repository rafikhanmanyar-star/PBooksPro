param(
    [ValidateSet("patch", "minor", "major")]
    [string]$BumpType = "patch",
    [string]$Message = "",
    [switch]$SkipRelease
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Bump-Version {
    param([string]$Version, [string]$Type)
    $parts = $Version -split '\.'
    $major = [int]$parts[0]; $minor = [int]$parts[1]; $patch = [int]$parts[2]
    switch ($Type) {
        "major" { $major++; $minor = 0; $patch = 0 }
        "minor" { $minor++; $patch = 0 }
        "patch" { $patch++ }
    }
    return "$major.$minor.$patch"
}

function Update-PackageVersion {
    param([string]$FilePath, [string]$NewVersion)
    if (-not (Test-Path $FilePath)) { return }
    $content = Get-Content $FilePath -Raw
    $updated = $content -replace '"version"\s*:\s*"[^"]*"', "`"version`": `"$NewVersion`""
    Set-Content -Path $FilePath -Value $updated -NoNewline
    Write-Host "  Updated $FilePath -> v$NewVersion" -ForegroundColor Cyan
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  PBooks Pro - Build & Release"          -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# --- Step 1: Version bump ---
Write-Host "[1/5] Incrementing version ($BumpType)..." -ForegroundColor Yellow
$rootPkg = Get-Content "$ProjectRoot\package.json" -Raw | ConvertFrom-Json
$currentVersion = $rootPkg.version
$newVersion = Bump-Version -Version $currentVersion -Type $BumpType
Write-Host "  $currentVersion -> $newVersion" -ForegroundColor Green

Update-PackageVersion -FilePath "$ProjectRoot\package.json" -NewVersion $newVersion

# --- Step 2: Build ---
Write-Host "`n[2/5] Building..." -ForegroundColor Yellow
Push-Location $ProjectRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed!" }

    npx electron-builder --win
    if ($LASTEXITCODE -ne 0) { throw "Electron build failed!" }

    Write-Host "  Build complete." -ForegroundColor Green
} finally { Pop-Location }

# Copy latest.yml for auto-update serving
$latestYml = "$ProjectRoot\release\latest.yml"
if (Test-Path $latestYml) {
    if (Test-Path "$ProjectRoot\server\updates") {
        Copy-Item $latestYml "$ProjectRoot\server\updates\latest.yml" -Force
    }
    if (Test-Path "$ProjectRoot\website\Website\updates") {
        Copy-Item $latestYml "$ProjectRoot\website\Website\updates\latest.yml" -Force
    }
    Write-Host "  Copied latest.yml for auto-update serving." -ForegroundColor Cyan
}

# --- Step 3: Git commit ---
Write-Host "`n[3/5] Committing..." -ForegroundColor Yellow
Push-Location $ProjectRoot
try {
    git add -A
    $status = git status --porcelain
    if (-not [string]::IsNullOrWhiteSpace($status)) {
        $commitMsg = if ([string]::IsNullOrWhiteSpace($Message)) {
            "build: v$newVersion - release build"
        } else { "$Message (v$newVersion)" }
        git commit -m $commitMsg
    } else {
        Write-Host "  Nothing to commit." -ForegroundColor Gray
    }
} finally { Pop-Location }

# --- Step 4: Push ---
Write-Host "`n[4/5] Pushing..." -ForegroundColor Yellow
Push-Location $ProjectRoot
try {
    git push origin
    if ($LASTEXITCODE -ne 0) { throw "Push failed!" }
    Write-Host "  Pushed successfully." -ForegroundColor Green
} finally { Pop-Location }

# --- Step 5: GitHub Release ---
if (-not $SkipRelease) {
    Write-Host "`n[5/5] Creating GitHub Release..." -ForegroundColor Yellow

    # Ensure gh CLI is on PATH
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        $ghPaths = @("C:\Program Files\GitHub CLI", "C:\Program Files (x86)\GitHub CLI", "$env:LOCALAPPDATA\Programs\GitHub CLI")
        foreach ($p in $ghPaths) {
            if (Test-Path "$p\gh.exe") { $env:PATH = "$p;$env:PATH"; break }
        }
    }

    $ghCmd = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $ghCmd) {
        Write-Host "  GitHub CLI (gh) not installed." -ForegroundColor Red
        Write-Host "  Install: winget install GitHub.cli && gh auth login" -ForegroundColor Cyan
        Write-Host "  Skipping GitHub Release creation." -ForegroundColor Yellow
    } else {
        $tagName = "v$newVersion"
        $installerName = "PBooks Pro-Setup-$newVersion.exe"
        $installerPath = "$ProjectRoot\release\$installerName"
        $latestYmlPath = "$ProjectRoot\release\latest.yml"
        $blockmapPath = "$installerPath.blockmap"

        # Fallback: find any matching .exe if exact name differs
        if (-not (Test-Path $installerPath)) {
            $fallback = Get-ChildItem "$ProjectRoot\release" -Filter "*.exe" -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like "*Setup*" -and $_.Name -notmatch "unpacked" } |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($fallback) {
                $installerPath = $fallback.FullName
                $installerName = $fallback.Name
                $blockmapPath = "$($fallback.FullName).blockmap"
            }
        }

        if (-not (Test-Path $installerPath)) {
            Write-Host "  Installer not found! Skipping release." -ForegroundColor Red
        } elseif (-not (Test-Path $latestYmlPath)) {
            Write-Host "  latest.yml not found! Skipping release." -ForegroundColor Red
        } else {
            # Delete existing release with same tag if it exists
            gh release delete $tagName --yes 2>&1 | Out-Null

            # Handle large installers (>100 MB)
            $maxSizeMB = 95
            $installerSizeMB = (Get-Item $installerPath).Length / 1MB

            if ($installerSizeMB -gt $maxSizeMB) {
                Write-Host "  Installer is $([math]::Round($installerSizeMB,1)) MB (exceeds $maxSizeMB MB)." -ForegroundColor Yellow

                # Check for nsis-web artifacts
                $webSetupParts = Get-ChildItem "$ProjectRoot\release" -Filter "*.7z" -ErrorAction SilentlyContinue
                if ($webSetupParts) {
                    Write-Host "  nsis-web artifacts detected. Uploading all parts..." -ForegroundColor Cyan
                    $releaseAssets = @($installerPath, $latestYmlPath)
                    foreach ($part in $webSetupParts) { $releaseAssets += $part.FullName }
                    if (Test-Path $blockmapPath) { $releaseAssets += $blockmapPath }
                } else {
                    Write-Host "  WARNING: Installer exceeds GitHub Release size limit." -ForegroundColor Yellow
                    Write-Host "  Uploading latest.yml and blockmap only. Upload .exe manually." -ForegroundColor Yellow
                    $releaseAssets = @($latestYmlPath)
                    if (Test-Path $blockmapPath) { $releaseAssets += $blockmapPath }
                }
            } else {
                $releaseAssets = @($installerPath, $latestYmlPath)
                if (Test-Path $blockmapPath) { $releaseAssets += $blockmapPath }
            }

            Push-Location $ProjectRoot
            try {
                gh release create $tagName $releaseAssets --title $tagName --notes "PBooks Pro v$newVersion"
                if ($LASTEXITCODE -ne 0) { throw "gh release create failed!" }
                Write-Host "  Release $tagName created!" -ForegroundColor Green

                # Remind about manual upload if installer was too large
                if ($installerSizeMB -gt $maxSizeMB -and -not $webSetupParts) {
                    $repoUrl = (gh repo view --json url -q ".url" 2>&1).Trim()
                    Write-Host ""
                    Write-Host "  REMINDER: Manually upload .exe to GitHub Release:" -ForegroundColor Yellow
                    Write-Host "    $installerName" -ForegroundColor Yellow
                    Write-Host "    URL: $repoUrl/releases/tag/$tagName" -ForegroundColor Gray
                }
            } finally { Pop-Location }
        }
    }
} else {
    Write-Host "`n[5/5] Skipping release (-SkipRelease)." -ForegroundColor DarkGray
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Done! v$newVersion"                       -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green
