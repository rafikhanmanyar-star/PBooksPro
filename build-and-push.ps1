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
        $latestYmlPath = "$ProjectRoot\release\latest.yml"

        if (-not (Test-Path $latestYmlPath)) {
            Write-Host "  latest.yml not found! Skipping release." -ForegroundColor Red
        } else {
            # Delete existing release with same tag if it exists (ignore if not found)
            try { gh release delete $tagName --yes 2>&1 | Out-Null } catch {}

            # Collect all release assets: web setup exe, .7z resource packs, latest.yml, blockmaps
            $releaseAssets = @($latestYmlPath)

            $webSetupExe = Get-ChildItem "$ProjectRoot\release" -Filter "*.exe" -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like "*WebSetup*" -or $_.Name -like "*Setup*" } |
                Where-Object { $_.Name -notmatch "unpacked|uninstall" } |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($webSetupExe) {
                $releaseAssets += $webSetupExe.FullName
                Write-Host "  Web installer: $($webSetupExe.Name) ($([math]::Round($webSetupExe.Length / 1MB, 1)) MB)" -ForegroundColor Cyan
            }

            $sevenZipParts = Get-ChildItem "$ProjectRoot\release" -Filter "*.7z" -ErrorAction SilentlyContinue
            foreach ($part in $sevenZipParts) {
                $releaseAssets += $part.FullName
                Write-Host "  Resource pack: $($part.Name) ($([math]::Round($part.Length / 1MB, 1)) MB)" -ForegroundColor Cyan
            }

            $blockmaps = Get-ChildItem "$ProjectRoot\release" -Filter "*.blockmap" -ErrorAction SilentlyContinue
            foreach ($bm in $blockmaps) { $releaseAssets += $bm.FullName }

            Push-Location $ProjectRoot
            try {
                gh release create $tagName $releaseAssets --title $tagName --notes "PBooks Pro v$newVersion"
                if ($LASTEXITCODE -ne 0) { throw "gh release create failed!" }
                Write-Host "  Release $tagName created!" -ForegroundColor Green
            } finally { Pop-Location }
        }
    }
} else {
    Write-Host "`n[5/5] Skipping release (-SkipRelease)." -ForegroundColor DarkGray
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Done! v$newVersion"                       -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green
