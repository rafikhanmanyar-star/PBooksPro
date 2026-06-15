# Architecture v2.1 Track E — real-time + strangler verification (automated)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "`n=== PBooks Pro Track E Verification ===`n"

function Assert-FileContains {
    param([string]$Label, [string]$Path, [string]$Pattern)
    if (-not (Test-Path $Path)) {
        Write-Host "FAIL: $Label (missing $Path)"
        exit 1
    }
    $content = Get-Content $Path -Raw
    if ($content -notmatch $Pattern) {
        Write-Host "FAIL: $Label"
        Write-Host "  Expected pattern in: $Path"
        exit 1
    }
    Write-Host "OK: $Label"
}

# E.1 — Backend emit on data management
Assert-FileContains -Label 'dataManagementRoutes emits bulkRefresh settings event' `
    -Path (Join-Path $root 'backend/src/modules/organization/routes/dataManagementRoutes.ts') `
    -Pattern "emitEntityEvent\(tenantId, 'updated', 'settings'"

# E.1 — Client bulk refresh + marketing patches
Assert-FileContains -Label 'AppContext handles settings bulkRefresh' `
    -Path (Join-Path $root 'context/AppContext.tsx') `
    -Pattern "bulkRefresh"

Assert-FileContains -Label 'AppContext patches remote installment_plan' `
    -Path (Join-Path $root 'context/AppContext.tsx') `
    -Pattern "payload\.type === 'installment_plan'"

Assert-FileContains -Label 'AppContext patches remote plan_amenity' `
    -Path (Join-Path $root 'context/AppContext.tsx') `
    -Pattern "payload\.type === 'plan_amenity'"

Assert-FileContains -Label 'entityQueryInvalidation handles settings bulk refresh' `
    -Path (Join-Path $root 'services/realtime/entityQueryInvalidation.ts') `
    -Pattern 'isSettingsBulkRefresh'

Assert-FileContains -Label 'SELLING_ANALYTICS includes installment_plan' `
    -Path (Join-Path $root 'services/realtime/entityQueryInvalidation.ts') `
    -Pattern "'installment_plan'"

# E.3 — Module services + strangler shims
Assert-FileContains -Label 'installmentPlansService lives in project-selling module' `
    -Path (Join-Path $root 'backend/src/modules/project-selling/services/installmentPlansService.ts') `
    -Pattern 'export async function upsertInstallmentPlan'

Assert-FileContains -Label 'planAmenitiesService lives in project-selling module' `
    -Path (Join-Path $root 'backend/src/modules/project-selling/services/planAmenitiesService.ts') `
    -Pattern 'export async function upsertPlanAmenity'

Assert-FileContains -Label 'flat installmentPlansService is strangler re-export' `
    -Path (Join-Path $root 'backend/src/services/installmentPlansService.ts') `
    -Pattern 'modules/project-selling/services/installmentPlansService'

Assert-FileContains -Label 'module installmentPlansRoutes imports module service' `
    -Path (Join-Path $root 'backend/src/modules/project-selling/routes/installmentPlansRoutes.ts') `
    -Pattern '\.\./services/installmentPlansService'

Assert-FileContains -Label 'recordLocksService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/recordLocksService.ts') `
    -Pattern 'export async function acquireLock'

Assert-FileContains -Label 'flat recordLocksService is strangler re-export' `
    -Path (Join-Path $root 'backend/src/services/recordLocksService.ts') `
    -Pattern 'modules/accounting/services/recordLocksService'

Assert-FileContains -Label 'locksRoutes imports module recordLocksService' `
    -Path (Join-Path $root 'backend/src/modules/accounting/routes/locksRoutes.ts') `
    -Pattern '\.\./services/recordLocksService'

Assert-FileContains -Label 'accountsService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/accountsService.ts') `
    -Pattern 'export async function listAccounts'

Assert-FileContains -Label 'categoriesService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/categoriesService.ts') `
    -Pattern 'export async function listCategories'

Assert-FileContains -Label 'budgetsService lives in project-selling module' `
    -Path (Join-Path $root 'backend/src/modules/project-selling/services/budgetsService.ts') `
    -Pattern 'export async function upsertBudget'

Assert-FileContains -Label 'pmCycleAllocationsService lives in project-selling module' `
    -Path (Join-Path $root 'backend/src/modules/project-selling/services/pmCycleAllocationsService.ts') `
    -Pattern 'export async function upsertPmCycleAllocation'

Write-Host "[build] npm run build:backend"
npm run build:backend | Out-Null

Write-Host "[build] npm run build"
npm run build | Out-Null

Write-Host "`n=== Track E automated verification passed ===`n"
Write-Host 'Manual E.2 (two users, same tenant):'
Write-Host '  - Project Selling > Marketing: User A edits plan, User B sees update'
Write-Host '  - Settings > Clear transactions: User B reloads without manual refresh'
Write-Host '  - Bills/Invoices: User A posts, User B list updates'
