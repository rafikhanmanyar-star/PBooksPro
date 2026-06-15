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

Assert-FileContains -Label 'contractsService lives in vendors module' `
    -Path (Join-Path $root 'backend/src/modules/vendors/services/contractsService.ts') `
    -Pattern 'export async function upsertContract'

Assert-FileContains -Label 'projectAgreementsService lives in project-selling module' `
    -Path (Join-Path $root 'backend/src/modules/project-selling/services/projectAgreementsService.ts') `
    -Pattern 'export async function createProjectAgreement'

Assert-FileContains -Label 'accountingPeriodService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/accountingPeriodService.ts') `
    -Pattern 'export async function assertAccountingPeriodOpen'

Assert-FileContains -Label 'billsService lives in vendors module' `
    -Path (Join-Path $root 'backend/src/modules/vendors/services/billsService.ts') `
    -Pattern 'export async function upsertBill'

Assert-FileContains -Label 'invoicesService lives in customers module' `
    -Path (Join-Path $root 'backend/src/modules/customers/services/invoicesService.ts') `
    -Pattern 'export async function upsertInvoice'

Assert-FileContains -Label 'transactionsService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/transactionsService.ts') `
    -Pattern 'export async function upsertTransaction'

Assert-FileContains -Label 'billsRoutes imports module billsService' `
    -Path (Join-Path $root 'backend/src/modules/vendors/routes/billsRoutes.ts') `
    -Pattern '\.\./services/billsService'

Assert-FileContains -Label 'FinancialPostingService imports module transaction types' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/FinancialPostingService.ts') `
    -Pattern '\./transactionsService'

Assert-FileContains -Label 'billJournalPostingService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/billJournalPostingService.ts') `
    -Pattern 'export async function syncBillJournalMirror'

Assert-FileContains -Label 'invoiceJournalPostingService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/invoiceJournalPostingService.ts') `
    -Pattern 'export async function syncInvoiceJournalMirror'

Assert-FileContains -Label 'transactionJournalPostingService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/transactionJournalPostingService.ts') `
    -Pattern 'export async function syncTransactionJournalMirror'

Assert-FileContains -Label 'FinancialPostingService uses module journal posting services' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/FinancialPostingService.ts') `
    -Pattern '\./billJournalPostingService'

Assert-FileContains -Label 'journalService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/journalService.ts') `
    -Pattern 'export async function insertJournalEntry'

Assert-FileContains -Label 'flat journalService is strangler re-export' `
    -Path (Join-Path $root 'backend/src/services/journalService.ts') `
    -Pattern 'modules/accounting/services/journalService'

Assert-FileContains -Label 'journalRoutes imports module journalService' `
    -Path (Join-Path $root 'backend/src/modules/accounting/routes/journalRoutes.ts') `
    -Pattern '\.\./services/journalService'

Assert-FileContains -Label 'pevJournalPostingService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/pevJournalPostingService.ts') `
    -Pattern 'export async function syncPeVJournalMirror'

Assert-FileContains -Label 'FinancialPostingService uses module pevJournalPostingService' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/FinancialPostingService.ts') `
    -Pattern '\./pevJournalPostingService'

Assert-FileContains -Label 'billJournalBackfillService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/billJournalBackfillService.ts') `
    -Pattern 'export async function backfillBillJournalMirrorsForTenant'

Assert-FileContains -Label 'invoiceJournalBackfillService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/invoiceJournalBackfillService.ts') `
    -Pattern 'export async function backfillInvoiceJournalMirrorsForTenant'

Assert-FileContains -Label 'transactionJournalBackfillService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/transactionJournalBackfillService.ts') `
    -Pattern 'export async function backfillTransactionJournalMirrorsForTenant'

Assert-FileContains -Label 'journalLedgerLoadService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/journalLedgerLoadService.ts') `
    -Pattern 'export async function loadJournalLedgerInput'

Assert-FileContains -Label 'journalDimensionsBackfillService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/journalDimensionsBackfillService.ts') `
    -Pattern 'export async function backfillJournalDimensionsForTenant'

Assert-FileContains -Label 'stateChangesService lives in app-settings module' `
    -Path (Join-Path $root 'backend/src/modules/app-settings/services/stateChangesService.ts') `
    -Pattern 'export async function getStateChanges'

Assert-FileContains -Label 'appStateBulkService lives in app-settings module' `
    -Path (Join-Path $root 'backend/src/modules/app-settings/services/appStateBulkService.ts') `
    -Pattern 'export async function getBulkAppState'

Assert-FileContains -Label 'stateRoutes imports module state services' `
    -Path (Join-Path $root 'backend/src/modules/app-settings/routes/stateRoutes.ts') `
    -Pattern '\.\./services/stateChangesService'

Assert-FileContains -Label 'trialBalanceReportService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/trialBalanceReportService.ts') `
    -Pattern 'export async function getTrialBalanceReportPayload'

Assert-FileContains -Label 'balanceSheetReportService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/balanceSheetReportService.ts') `
    -Pattern 'export async function loadBalanceSheetStateInput'

Assert-FileContains -Label 'trialBalanceRoutes imports module trialBalanceReportService' `
    -Path (Join-Path $root 'backend/src/modules/accounting/routes/trialBalanceRoutes.ts') `
    -Pattern '\.\./services/trialBalanceReportService'

Assert-FileContains -Label 'ownerRentalIncomeReportService lives in leases module' `
    -Path (Join-Path $root 'backend/src/modules/leases/services/ownerRentalIncomeReportService.ts') `
    -Pattern 'export async function loadOwnerRentalIncomeStateInput'

Assert-FileContains -Label 'tenantLedgerRoutes imports module tenantLedgerReportService' `
    -Path (Join-Path $root 'backend/src/modules/leases/routes/tenantLedgerRoutes.ts') `
    -Pattern '\.\./services/tenantLedgerReportService'

Assert-FileContains -Label 'vendorLedgerReportService lives in vendors module' `
    -Path (Join-Path $root 'backend/src/modules/vendors/services/vendorLedgerReportService.ts') `
    -Pattern 'export async function getVendorLedgerReportJson'

Assert-FileContains -Label 'clientLedgerReportService lives in customers module' `
    -Path (Join-Path $root 'backend/src/modules/customers/services/clientLedgerReportService.ts') `
    -Pattern 'export async function getClientLedgerReportJson'

Assert-FileContains -Label 'appStateBulkMutationService lives in app-settings module' `
    -Path (Join-Path $root 'backend/src/modules/app-settings/services/appStateBulkMutationService.ts') `
    -Pattern 'export async function recordBulkAppSettingsChangeLog'

Assert-FileContains -Label 'contactsService lives in crm module' `
    -Path (Join-Path $root 'backend/src/modules/crm/services/contactsService.ts') `
    -Pattern 'export async function createContact'

Assert-FileContains -Label 'contactsRoutes imports module contactsService' `
    -Path (Join-Path $root 'backend/src/modules/crm/routes/contactsRoutes.ts') `
    -Pattern '\.\./services/contactsService'

Assert-FileContains -Label 'buildingsService lives in properties module' `
    -Path (Join-Path $root 'backend/src/modules/properties/services/buildingsService.ts') `
    -Pattern 'export async function createBuilding'

Assert-FileContains -Label 'vendorsService lives in vendors module' `
    -Path (Join-Path $root 'backend/src/modules/vendors/services/vendorsService.ts') `
    -Pattern 'export async function createVendor'

Assert-FileContains -Label 'rentalAgreementsService lives in leases module' `
    -Path (Join-Path $root 'backend/src/modules/leases/services/rentalAgreementsService.ts') `
    -Pattern 'export async function listRentalAgreements'

Assert-FileContains -Label 'projectsService lives in project-selling module' `
    -Path (Join-Path $root 'backend/src/modules/project-selling/services/projectsService.ts') `
    -Pattern 'export async function createProject'

Assert-FileContains -Label 'financialReconciliationService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/financialReconciliationService.ts') `
    -Pattern 'export async function getFinancialReconciliationCertification'

Assert-FileContains -Label 'financialReconciliationRoutes imports module service' `
    -Path (Join-Path $root 'backend/src/modules/accounting/routes/financialReconciliationRoutes.ts') `
    -Pattern '\.\./services/financialReconciliationService'

Assert-FileContains -Label 'appSettingsService lives in app-settings module' `
    -Path (Join-Path $root 'backend/src/modules/app-settings/services/appSettingsService.ts') `
    -Pattern 'export async function listAllSettings'

Assert-FileContains -Label 'changeLogService lives in organization module' `
    -Path (Join-Path $root 'backend/src/modules/organization/services/changeLogService.ts') `
    -Pattern 'export async function appendChangeLog'

Assert-FileContains -Label 'recordDomainMutation uses module changeLogService' `
    -Path (Join-Path $root 'backend/src/core/recordDomainMutation.ts') `
    -Pattern 'modules/organization/services/changeLogService'

Assert-FileContains -Label 'personalCategoriesService lives in personal-finance module' `
    -Path (Join-Path $root 'backend/src/modules/personal-finance/services/personalCategoriesService.ts') `
    -Pattern 'export async function createPersonalCategory'

Assert-FileContains -Label 'payrollService lives in payroll module' `
    -Path (Join-Path $root 'backend/src/modules/payroll/services/payroll/payrollEmployees.ts') `
    -Pattern 'export async function listEmployees'

Assert-FileContains -Label 'payrollRoutes imports module payrollService' `
    -Path (Join-Path $root 'backend/src/modules/payroll/routes/payrollRoutes.ts') `
    -Pattern '\.\./services/payrollService'

Assert-FileContains -Label 'recurringInvoiceTemplatesService lives in customers module' `
    -Path (Join-Path $root 'backend/src/modules/customers/services/recurringInvoiceTemplatesService.ts') `
    -Pattern 'export async function upsertRecurringInvoiceTemplate'

Assert-FileContains -Label 'reportScheduleScheduler lives in reporting module' `
    -Path (Join-Path $root 'backend/src/modules/reporting/services/reportScheduleScheduler.ts') `
    -Pattern 'export function startReportScheduleScheduler'

Assert-FileContains -Label 'tenantBootstrap lives in organization module' `
    -Path (Join-Path $root 'backend/src/modules/organization/services/tenantBootstrap.ts') `
    -Pattern 'export async function bootstrapTenantChart'

Assert-FileContains -Label 'projectExpenseVoucherService lives in project-expense module' `
    -Path (Join-Path $root 'backend/src/modules/project-expense/services/projectExpenseVoucherService.ts') `
    -Pattern 'export type { PeVStatus, ProjectExpenseVoucherRow }'

Assert-FileContains -Label 'payrollLedgerService lives in payroll module' `
    -Path (Join-Path $root 'backend/src/modules/payroll/services/payrollLedgerService.ts') `
    -Pattern 'export async function syncPayrollLedgerForAllEmployees'

Assert-FileContains -Label 'backupSchedulerService lives in backup module' `
    -Path (Join-Path $root 'backend/src/modules/backup/services/backupSchedulerService.ts') `
    -Pattern 'export function startBackupScheduler'

Assert-FileContains -Label 'recordDomainMutation uses module syncQueueService' `
    -Path (Join-Path $root 'backend/src/core/recordDomainMutation.ts') `
    -Pattern 'modules/organization/services/syncQueueService'

Assert-FileContains -Label 'contractorBillingService lives in vendors module' `
    -Path (Join-Path $root 'backend/src/modules/vendors/services/contractorBillingService.ts') `
    -Pattern 'export async function createContractorAdvance'

Assert-FileContains -Label 'fiscalPeriodCloseService lives in accounting module' `
    -Path (Join-Path $root 'backend/src/modules/accounting/services/fiscalPeriodCloseService.ts') `
    -Pattern 'export const FISCAL_CLOSE_SOURCE_MODULE'

Assert-FileContains -Label 'enterpriseAuditService lives in organization module' `
    -Path (Join-Path $root 'backend/src/modules/organization/services/enterpriseAuditService.ts') `
    -Pattern 'export async function appendAuditEvent'

Assert-FileContains -Label 'backupOffsiteService lives in backup module' `
    -Path (Join-Path $root 'backend/src/modules/backup/services/backup/backupOffsiteService.ts') `
    -Pattern 'export async function queueOffsiteUploadAfterBackup'

Assert-FileContains -Label 'drHookService lives in dr module' `
    -Path (Join-Path $root 'backend/src/modules/dr/services/dr/drHookService.ts') `
    -Pattern 'export async function onBackupJobFinished'

Assert-FileContains -Label 'vendors billsRoutes imports module contractorBillingService' `
    -Path (Join-Path $root 'backend/src/modules/vendors/routes/billsRoutes.ts') `
    -Pattern '\.\./services/contractorBillingService'

Assert-FileContains -Label 'flat contractorBillingService is strangler shim' `
    -Path (Join-Path $root 'backend/src/services/contractorBillingService.ts') `
    -Pattern 'modules/vendors/services/contractorBillingService'

Assert-FileContains -Label 'flat backupRestoreAuthService is strangler shim' `
    -Path (Join-Path $root 'backend/src/services/backup/backupRestoreAuthService.ts') `
    -Pattern 'modules/backup/services/backup/backupRestoreAuthService'

Write-Host "[build] npm run build:backend"
npm run build:backend | Out-Null

Write-Host "[build] npm run build"
npm run build | Out-Null

Write-Host "`n=== Track E automated verification passed ===`n"
Write-Host 'Manual E.2 (two users, same tenant):'
Write-Host '  - Project Selling > Marketing: User A edits plan, User B sees update'
Write-Host '  - Settings > Clear transactions: User B reloads without manual refresh'
Write-Host '  - Bills/Invoices: User A posts, User B list updates'
