# PBooks Pro - Staging full stack local test (pBookspro_Staging + API port 3001 + Electron client)
#
# Run from repo root:
#   npm run test:staging
#
# Does NOT bump package.json version — use npm run release:staging for version bumps + installers.
#
# Production-like local test (pbookspro + API port 3000) - unchanged:
#   npm run test:local-only
#
# Requires: PostgreSQL with database pBookspro_Staging; copy .env.staging.example to .env.staging
#
# Optional live backend reload:
#   npm run test:staging:watch
#   # or: $env:PBooks_BACKEND_WATCH = "1"; npm run test:staging

param(
    [switch]$BackendWatch
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$EnvFile = ".env.staging"
$StagingApiPort = 3001

function Get-ListeningPidsOnPort {
    param([int]$Port)

    $pids = [System.Collections.Generic.HashSet[int]]::new()
    try {
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
            ForEach-Object { [void]$pids.Add($_.OwningProcess) }
    } catch {
        netstat -ano | Select-String "LISTENING" | Select-String ":$Port\s" | ForEach-Object {
            $parts = ($_.Line -split '\s+') | Where-Object { $_ }
            if ($parts.Count -gt 0) {
                $processId = [int]$parts[-1]
                if ($processId -gt 0) { [void]$pids.Add($processId) }
            }
        }
    }

    $pidList = @()
    foreach ($procId in $pids) {
        if ($procId -gt 0 -and $procId -ne $PID) { $pidList += $procId }
    }
    return $pidList
}

function Stop-ProcessesOnPort {
    param([int]$Port)

    $pidList = Get-ListeningPidsOnPort -Port $Port
    if ($pidList.Count -eq 0) {
        Write-Host "  Port $Port is free." -ForegroundColor DarkGray
        return
    }

    foreach ($procId in $pidList) {
        Write-Host "  Stopping process on port $Port (PID $procId)..." -ForegroundColor DarkGray
        taskkill /PID $procId /T /F 2>$null | Out-Null
    }
    Start-Sleep -Seconds 1
    Write-Host "  Freed port $Port ($($pidList.Count) process(es))." -ForegroundColor Green
}

function Assert-PortIsFree {
    param([int]$Port)

    $remaining = Get-ListeningPidsOnPort -Port $Port
    if ($remaining.Count -eq 0) { return }

    Write-Host "  Port $Port is still in use (PID(s): $($remaining -join ', '))." -ForegroundColor Red
    Write-Host "  Stop any manual staging API (npm run dev:backend:staging / start:backend:staging) and retry." -ForegroundColor Yellow
    exit 1
}

function Get-ProcessTreePids {
    param([int]$RootPid)

    $all = [System.Collections.Generic.HashSet[int]]::new()
    [void]$all.Add($RootPid)
    $queue = [System.Collections.Queue]::new()
    $queue.Enqueue($RootPid)
    while ($queue.Count -gt 0) {
        $currentPid = [int]$queue.Dequeue()
        Get-CimInstance Win32_Process -Filter "ParentProcessId=$currentPid" -ErrorAction SilentlyContinue |
            ForEach-Object {
                $childPid = [int]$_.ProcessId
                if ($all.Add($childPid)) { $queue.Enqueue($childPid) }
            }
    }
    return @($all)
}

function Get-PackageVersion {
    $pkgPath = Join-Path $ProjectRoot "package.json"
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
    return [string]$pkg.version
}

function Assert-PackageVersionUnchanged {
    param([string]$ExpectedVersion)

    $current = Get-PackageVersion
    if ($current -eq $ExpectedVersion) { return }

    Write-Host ""
    Write-Host "  ERROR: package.json version changed ($ExpectedVersion -> $current)." -ForegroundColor Red
    Write-Host "  npm run test:staging must not bump the app version." -ForegroundColor Red
    Write-Host "  Use npm run release:staging when you need a version bump and installers." -ForegroundColor Yellow
    exit 1
}

$LocalApiBase = "http://127.0.0.1:3001/api"
$LocalWsRoot = "http://127.0.0.1:3001"
$HealthUrl = "http://127.0.0.1:3001/health"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host '   PBooks Pro - Staging PostgreSQL + API + Client' -ForegroundColor Cyan
Write-Host '   (pBookspro_Staging on port 3001)                  ' -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $ProjectRoot

# Local test only — never patch-bump package.json (release:staging sets PBOOKS_BUMP_VERSION=1).
$env:PBOOKS_BUMP_VERSION = "0"
$packageVersionAtStart = Get-PackageVersion

try {

if (-not (Test-Path $EnvFile)) {
    Write-Host "  Missing $EnvFile - copy from .env.staging.example and set DATABASE_URL." -ForegroundColor Red
    exit 1
}

Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
        }
    }
}
Write-Host "  Loaded $EnvFile" -ForegroundColor DarkGray

Write-Host ""
Write-Host "  [0/7] Freeing staging API port $StagingApiPort..." -ForegroundColor Yellow
Stop-ProcessesOnPort -Port $StagingApiPort

Write-Host ""
Write-Host "  [1/7] Rebuilding native modules..." -ForegroundColor Yellow
& npm run rebuild:native
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Native rebuild failed, continuing anyway..." -ForegroundColor Yellow
}

if (-not $BackendWatch -and -not ($env:PBooks_BACKEND_WATCH -eq "1")) {
    Write-Host ""
    Write-Host '  [2/7] Building backend: tsc to dist...' -ForegroundColor Yellow
    & npm run build:backend
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Backend build failed!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host ""
    Write-Host '  [2/7] Skipping build:backend (tsx watch)' -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  [3/7] Running staging database migrations (pBookspro_Staging)..." -ForegroundColor Yellow
& npm run db:migrate:staging
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Migration failed! Check DATABASE_URL in $EnvFile" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  [4/7] Starting staging backend API (PORT=3001)..." -ForegroundColor Yellow
Stop-ProcessesOnPort -Port $StagingApiPort
Assert-PortIsFree -Port $StagingApiPort

$env:NODE_ENV = "production"
$env:PORT = "3001"

$backendLog = Join-Path $ProjectRoot "logs\test-staging-backend.log"
$backendLogDir = Split-Path $backendLog -Parent
if (-not (Test-Path $backendLogDir)) {
    New-Item -ItemType Directory -Path $backendLogDir -Force | Out-Null
}

$useWatch = $BackendWatch -or ($env:PBooks_BACKEND_WATCH -eq "1")
if ($useWatch) {
    $watchCmd = 'cd /d "' + $ProjectRoot + '" && set NODE_ENV=development&& npm run dev:backend:staging'
    $backendJob = Start-Process -FilePath "cmd.exe" -ArgumentList @("/k", $watchCmd) -PassThru -WindowStyle Normal
    Write-Host ('  Backend dev [tsx watch] started. PID: ' + $backendJob.Id) -ForegroundColor Green
} else {
    # Run node directly (same as test-local-only.ps1) so npm output does not interleave with vite build.
    # Log via cmd redirection — PowerShell forbids the same path for RedirectStandardOutput and RedirectStandardError.
    $runCmd = 'set NODE_ENV=production&& node backend/dist/index.js >> "' + $backendLog + '" 2>&1'
    $backendJob = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $runCmd) -WorkingDirectory $ProjectRoot -PassThru
    Write-Host ('  Staging backend started. PID: ' + $backendJob.Id + ' (log: logs/test-staging-backend.log)') -ForegroundColor Green
}

Write-Host ""
Write-Host "  Waiting for API at $HealthUrl ..." -ForegroundColor DarkGray
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    if (-not $useWatch -and $backendJob.HasExited) {
        Write-Host "  Staging backend exited early (often EADDRINUSE). See logs/test-staging-backend.log" -ForegroundColor Red
        if (Test-Path $backendLog) {
            Get-Content $backendLog -Tail 20 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        }
        exit 1
    }
    try {
        $r = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $ready) {
    Write-Host "  API did not become ready. Check pBookspro_Staging and $EnvFile." -ForegroundColor Red
    if (Test-Path $backendLog) {
        Get-Content $backendLog -Tail 20 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    }
    try { taskkill /PID $backendJob.Id /T /F 2>$null | Out-Null } catch {}
    exit 1
}

if (-not $useWatch) {
    $treePids = Get-ProcessTreePids -RootPid $backendJob.Id
    $portPids = Get-ListeningPidsOnPort -Port $StagingApiPort
    $ownsPort = @($portPids | Where-Object { $treePids -contains $_ })
    if ($ownsPort.Count -eq 0) {
        Write-Host "  Health check passed but port $StagingApiPort is owned by another process (PID(s): $($portPids -join ', '))." -ForegroundColor Red
        Write-Host "  Stop the other API on 3001 and retry npm run test:staging." -ForegroundColor Yellow
        try { taskkill /PID $backendJob.Id /T /F 2>$null | Out-Null } catch {}
        exit 1
    }
}

Write-Host "  Staging API is up." -ForegroundColor Green

Write-Host ""
Write-Host '  [5/7] Building Electron staging client (Architecture v2.1 API mode)...' -ForegroundColor Yellow

$env:VITE_LOCAL_ONLY = "false"
$env:VITE_ELECTRON_BUILD = "true"
$env:VITE_STAGING = "true"
$env:VITE_API_URL = $LocalApiBase
$env:VITE_WS_URL = $LocalWsRoot

& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Frontend build failed!" -ForegroundColor Red
    try { taskkill /PID $backendJob.Id /T /F 2>$null | Out-Null } catch {}
    exit 1
}

Write-Host ""
Write-Host "  [6/7] Launching Electron client..." -ForegroundColor Green
Write-Host ""
& npx electron . --enable-logging

Write-Host ""
Write-Host "  [7/7] Stopping staging backend..." -ForegroundColor Yellow
try {
    taskkill /PID $backendJob.Id /T /F 2>$null | Out-Null
} catch {}

} finally {
    Assert-PackageVersionUnchanged -ExpectedVersion $packageVersionAtStart
}
