# Script to organize cleanup report files
# This script moves detailed reports to docs/ folder, keeps FINAL_CLEANUP_REPORT.md in root

Write-Host "=== Organizing Cleanup Report Files ===" -ForegroundColor Cyan
Write-Host ""

# Files to move to docs/ folder
$filesToMove = @(
    "UNUSED_CODE_REPORT.md",
    "CLEANUP_SUMMARY.md",
    "VERIFICATION_REPORT.md"
)

# File to keep in root
$keepInRoot = "FINAL_CLEANUP_REPORT.md"

$movedCount = 0
$notFoundCount = 0

foreach ($file in $filesToMove) {
    if (Test-Path $file) {
        try {
            Move-Item -Path $file -Destination "docs\$file" -Force
            Write-Host "✅ Moved: $file -> docs/$file" -ForegroundColor Green
            $movedCount++
        } catch {
            Write-Host "❌ Error moving $file : $_" -ForegroundColor Red
        }
    } else {
        Write-Host "⚠️  Not found: $file" -ForegroundColor Yellow
        $notFoundCount++
    }
}

if (Test-Path $keepInRoot) {
    Write-Host ""
    Write-Host "✅ Kept in root: $keepInRoot" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "⚠️  Warning: $keepInRoot not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Files moved to docs/: $movedCount"
Write-Host "Files kept in root: 1 ($keepInRoot)"
Write-Host ""
Write-Host "✅ Organization complete!" -ForegroundColor Green

