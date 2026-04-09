import type pg from 'pg';
import { listAllSettings } from './appSettingsService.js';
import { listContactsChangedSince, rowToContactApi } from './contactsService.js';
import { listVendorsChangedSince, rowToVendorApi } from './vendorsService.js';
import {
  listRentalAgreementsChangedSince,
  rowToRentalAgreementApi,
} from './rentalAgreementsService.js';
import {
  enrichRowsWithUnitIds,
  listProjectAgreementsChangedSince,
  rowToProjectAgreementApi,
} from './projectAgreementsService.js';
import { listInvoicesChangedSince, rowToInvoiceApi } from './invoicesService.js';
import { listAccountsChangedSince, rowToAccountApi } from './accountsService.js';
import { listTransactionsChangedSince, rowToTransactionApi } from './transactionsService.js';
import {
  getCategoryById,
  listCategoriesChangedSince,
  rowToCategoryApi,
  fetchPlSubTypesForTenant,
} from './categoriesService.js';
import { listBillsChangedSince, rowToBillApi } from './billsService.js';
import {
  listRecurringInvoiceTemplatesChangedSince,
  rowToRecurringInvoiceTemplateApi,
} from './recurringInvoiceTemplatesService.js';
import { listProjectsChangedSince, rowToProjectApi } from './projectsService.js';
import { listBuildingsChangedSince, rowToBuildingApi } from './buildingsService.js';
import { listPropertiesChangedSince, rowToPropertyApi } from './propertiesService.js';
import { listUnitsChangedSince, rowToUnitApi } from './unitsService.js';
import {
  listProjectReceivedAssetsChangedSince,
  rowToProjectReceivedAssetApi,
} from './projectReceivedAssetsService.js';
import { listSalesReturnsChangedSince, rowToSalesReturnApi } from './salesReturnsService.js';
import { listContractsChangedSince, rowToContractApi } from './contractsService.js';
import { listBudgetsChangedSince, rowToBudgetApi } from './budgetsService.js';
import {
  listPersonalCategoriesChangedSince,
  rowToPersonalCategoryApi,
} from './personalCategoriesService.js';
import {
  listPersonalTransactionsChangedSince,
  rowToPersonalTransactionApi,
} from './personalTransactionsService.js';
import {
  listPmCycleAllocationsChangedSince,
  rowToPmCycleAllocationApi,
} from './pmCycleAllocationsService.js';
import { listPlanAmenitiesChangedSince, rowToPlanAmenityApi } from './planAmenitiesService.js';
import {
  listInstallmentPlansChangedSince,
  rowToInstallmentPlanApi,
} from './installmentPlansService.js';
import {
  getTenantConfigIfChangedSince,
  listDepartmentsChangedSince,
  listEmployeesChangedSince,
  listGradesChangedSince,
  listPayrollProjectsChangedSince,
  listPayrollRunsChangedSince,
  listPayslipsChangedSince,
  listSalaryComponentsChangedSince,
  rowToDepartmentApi,
  rowToEmployeeApi,
  rowToGradeApi,
  rowToPayrollProjectApi,
  rowToPayrollRunApi,
  rowToPayslipApi,
  rowToSalaryComponentApi,
  rowToTenantConfigApi,
} from './payrollService.js';

export type StateChangesPayload = {
  since: string;
  updatedAt: string;
  entities: Record<string, unknown[]>;
  /** Present when any tenant app_settings row changed since `since` (full map for client merge). */
  appSettings?: Record<string, unknown>;
};

export async function getStateChanges(
  client: pg.PoolClient,
  tenantId: string,
  sinceIso: string
): Promise<StateChangesPayload> {
  const since = sinceIso ? new Date(sinceIso) : new Date(0);
  if (Number.isNaN(since.getTime())) {
    throw new Error('Invalid since timestamp');
  }

  const [
    vendorRows,
    contactRows,
    rentalAgreementRows,
    projectAgreementRowsRaw,
    invoiceRows,
    accountRows,
    transactionRows,
    categoryRows,
    billRows,
    recurringTemplateRows,
    projectRows,
    buildingRows,
    propertyRows,
    unitRows,
    projectReceivedAssetRows,
    salesReturnRows,
    contractRows,
    budgetRows,
    payrollDepartmentRows,
    payrollGradeRows,
    payrollEmployeeRows,
    payrollRunRows,
    payslipRows,
    payrollSalaryComponentRows,
    payrollProjectRows,
    payrollConfigRow,
    personalCategoryRows,
    personalTransactionRows,
    pmCycleAllocationRows,
    planAmenityRows,
    installmentPlanRows,
  ] = await Promise.all([
    listVendorsChangedSince(client, tenantId, since),
    listContactsChangedSince(client, tenantId, since),
    listRentalAgreementsChangedSince(client, tenantId, since),
    listProjectAgreementsChangedSince(client, tenantId, since),
    listInvoicesChangedSince(client, tenantId, since),
    listAccountsChangedSince(client, tenantId, since),
    listTransactionsChangedSince(client, tenantId, since),
    listCategoriesChangedSince(client, tenantId, since),
    listBillsChangedSince(client, tenantId, since),
    listRecurringInvoiceTemplatesChangedSince(client, tenantId, since),
    listProjectsChangedSince(client, tenantId, since),
    listBuildingsChangedSince(client, tenantId, since),
    listPropertiesChangedSince(client, tenantId, since),
    listUnitsChangedSince(client, tenantId, since),
    listProjectReceivedAssetsChangedSince(client, tenantId, since),
    listSalesReturnsChangedSince(client, tenantId, since),
    listContractsChangedSince(client, tenantId, since),
    listBudgetsChangedSince(client, tenantId, since),
    listDepartmentsChangedSince(client, tenantId, since),
    listGradesChangedSince(client, tenantId, since),
    listEmployeesChangedSince(client, tenantId, since),
    listPayrollRunsChangedSince(client, tenantId, since),
    listPayslipsChangedSince(client, tenantId, since),
    listSalaryComponentsChangedSince(client, tenantId, since),
    listPayrollProjectsChangedSince(client, tenantId, since),
    getTenantConfigIfChangedSince(client, tenantId, since),
    listPersonalCategoriesChangedSince(client, tenantId, since),
    listPersonalTransactionsChangedSince(client, tenantId, since),
    listPmCycleAllocationsChangedSince(client, tenantId, since),
    listPlanAmenitiesChangedSince(client, tenantId, since),
    listInstallmentPlansChangedSince(client, tenantId, since),
  ]);

  /** P&L overrides live in pl_category_mapping; system (global) category rows do not get updated_at bumps. */
  const seenCategoryIds = new Set(categoryRows.map((r) => r.id));
  const plMappingDeltas = await client.query<{ category_id: string }>(
    `SELECT DISTINCT category_id FROM pl_category_mapping
     WHERE tenant_id = $1 AND updated_at > $2`,
    [tenantId, since]
  );
  const mergedCategoryRows = [...categoryRows];
  for (const row of plMappingDeltas.rows) {
    if (seenCategoryIds.has(row.category_id)) continue;
    const cat = await getCategoryById(client, tenantId, row.category_id);
    if (cat) {
      mergedCategoryRows.push(cat);
      seenCategoryIds.add(row.category_id);
    }
  }

  const plMap = await fetchPlSubTypesForTenant(client, tenantId);
  const projectAgreementEnriched = await enrichRowsWithUnitIds(client, projectAgreementRowsRaw);
  const entities: Record<string, unknown[]> = {
    vendors: vendorRows.map((r) => rowToVendorApi(r)),
    contacts: contactRows.map((r) => rowToContactApi(r)),
    rental_agreements: rentalAgreementRows.map((r) => rowToRentalAgreementApi(r)),
    project_agreements: projectAgreementEnriched.map(({ row, unitIds }) =>
      rowToProjectAgreementApi(row, unitIds)
    ),
    invoices: invoiceRows.map((r) => rowToInvoiceApi(r)),
    accounts: accountRows.map((r) => rowToAccountApi(r)),
    transactions: transactionRows.map((r) => rowToTransactionApi(r)),
    categories: mergedCategoryRows.map((r) => rowToCategoryApi(r, plMap.get(r.id))),
    bills: billRows.map((r) => rowToBillApi(r)),
    pm_cycle_allocations: pmCycleAllocationRows.map((r) => rowToPmCycleAllocationApi(r)),
    recurring_invoice_templates: recurringTemplateRows.map((r) => rowToRecurringInvoiceTemplateApi(r)),
    projects: projectRows.map((r) => rowToProjectApi(r)),
    buildings: buildingRows.map((r) => rowToBuildingApi(r)),
    properties: propertyRows.map((r) => rowToPropertyApi(r)),
    units: unitRows.map((r) => rowToUnitApi(r)),
    project_received_assets: projectReceivedAssetRows.map((r) => rowToProjectReceivedAssetApi(r)),
    sales_returns: salesReturnRows.map((r) => rowToSalesReturnApi(r)),
    contracts: contractRows.map((r) => rowToContractApi(r)),
    budgets: budgetRows.map((r) => rowToBudgetApi(r)),
    payroll_departments: payrollDepartmentRows.map((r) => rowToDepartmentApi(r)),
    payroll_grades: payrollGradeRows.map((r) => rowToGradeApi(r)),
    payroll_employees: payrollEmployeeRows.map((r) => rowToEmployeeApi(r)),
    payroll_runs: payrollRunRows.map((r) => rowToPayrollRunApi(r)),
    payslips: payslipRows.map((r) => rowToPayslipApi(r)),
    payroll_salary_components: payrollSalaryComponentRows.map((r) => rowToSalaryComponentApi(r)),
    payroll_projects: payrollProjectRows.map((r) => rowToPayrollProjectApi(r)),
    payroll_tenant_config: payrollConfigRow ? [rowToTenantConfigApi(payrollConfigRow)] : [],
    personal_categories: personalCategoryRows.map((r) => rowToPersonalCategoryApi(r)),
    personal_transactions: personalTransactionRows.map((r) => rowToPersonalTransactionApi(r)),
    plan_amenities: planAmenityRows.map((r) => rowToPlanAmenityApi(r)),
    installment_plans: installmentPlanRows.map((r) => rowToInstallmentPlanApi(r)),
  };

  const cnt = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM app_settings WHERE tenant_id = $1 AND updated_at > $2`,
    [tenantId, since]
  );
  let appSettings: Record<string, unknown> | undefined;
  if (Number(cnt.rows[0]?.c ?? 0) > 0) {
    appSettings = await listAllSettings(client, tenantId);
  }

  return {
    since: sinceIso,
    updatedAt: new Date().toISOString(),
    entities,
    appSettings,
  };
}
