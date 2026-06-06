# Push unpushed commits to GitHub when a Cursor agent session ends.
# Does NOT auto-commit — use release:staging / release:production or commit manually.
# Set PBOOKS_AUTO_COMMIT=1 to restore legacy auto-commit behaviour.

$ErrorActionPreference = "Continue"

[void][Console]::In.ReadToEnd()

$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repoRoot

if (-not (Test-Path ".git")) {
    exit 0
}

function Push-CurrentBranch {
    param([string]$Branch)

    if ([string]::IsNullOrWhiteSpace($Branch) -or $Branch -eq "HEAD") {
        return
    }

    $pushOutput = git push -u origin $Branch 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "auto-sync-github: push failed for branch '$Branch': $pushOutput"
    }
}

$branch = git rev-parse --abbrev-ref HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
    exit 0
}

if ($env:PBOOKS_AUTO_COMMIT -eq "1") {
    git add -A 2>&1 | Out-Null
    $status = git status --porcelain 2>$null
    if (-not [string]::IsNullOrWhiteSpace($status)) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $message = "Auto-sync: Cursor agent changes ($timestamp)"
        $commitOutput = git commit -m $message 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "auto-sync-github: commit failed: $commitOutput"
            exit 0
        }
    }
}

$upstream = git rev-parse --abbrev-ref "@{u}" 2>$null
if ($LASTEXITCODE -eq 0) {
    $ahead = git rev-list --count "@{u}..HEAD" 2>$null
    if ($ahead -gt 0) {
        Push-CurrentBranch -Branch $branch
    }
} else {
    Push-CurrentBranch -Branch $branch
}

exit 0
