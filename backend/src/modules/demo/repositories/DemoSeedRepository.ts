import type pg from 'pg';
import { bootstrapTenantChart } from '../../../services/tenantBootstrap.js';
import { startTrialSubscription } from '../../../services/billing/subscriptionService.js';
import { wipeTenantBusinessData } from '../../../services/tenantDataManagementService.js';
import {
  DEMO_DEFAULT_USER_ID,
  DEMO_MASTER_TENANT_ID,
  DEMO_PRESENTATION_TENANT_ID,
  DEMO_PUBLIC_TENANT_ID,
  isDemoPresentationTenant,
} from '../../../constants/demoEnvironment.js';
import { syncPayrollLedgerForAllEmployees } from '../../../services/payrollLedgerService.js';
import { backfillBillJournalMirrorsForTenant } from '../../../services/billJournalBackfillService.js';
import { backfillInvoiceJournalMirrorsForTenant } from '../../../services/invoiceJournalBackfillService.js';
import { backfillTransactionJournalMirrorsForTenant } from '../../../services/transactionJournalBackfillService.js';

const SYS_CASH = 'sys-acc-cash';
const SYS_RENT = 'sys-cat-rent-inc';
const SYS_UNIT_SELL = 'sys-cat-unit-sell';
const SYS_PM_COST = 'sys-cat-pm-cost';
const SYS_BLD_MAINT = 'sys-cat-bld-maint';
const SYS_BROK_FEE = 'sys-cat-brok-fee';
const SYS_SAL_EXP = 'sys-cat-sal-exp';
const SYS_REV_ASSET = 'sys-cat-rev-asset-in-kind';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export type DemoSeedIds = {
  ownerAli: string;
  ownerSara: string;
  tenantAhmed: string;
  tenantFatima: string;
  tenantHassan: string;
  tenantZain: string;
  brokerKamran: string;
  bldSkyline: string;
  bldHarbor: string;
  prop101: string;
  prop102: string;
  prop103: string;
  prop104: string;
  prop201: string;
  prop202: string;
  prop203: string;
  prop204: string;
  projHorizon: string;
  projRiverside: string;
  unitH1: string;
  unitH2: string;
  unitR1: string;
  vendorSteel: string;
  vendorCement: string;
  vendorElectric: string;
  vendorPlumb: string;
  agr101: string;
  agr102: string;
  agr103: string;
  agr104: string;
  inv005: string;
  inv001: string;
  inv002: string;
  inv003: string;
  inv004: string;
  invProj001: string;
  invProj002: string;
  invProj003: string;
  invProj004: string;
  buyerImran: string;
  paHorizon: string;
  con001: string;
  con002: string;
  con003: string;
  con004: string;
  bill001: string;
  bill002: string;
  bill003: string;
  bill004: string;
  bill005: string;
  bill006: string;
  bill007: string;
  bill008: string;
  bill009: string;
  bill010: string;
  bill011: string;
  bill012: string;
  accOperating: string;
  accEscrow: string;
  accPetty: string;
  accOwnerCapital: string;
  catMaterials: string;
  catCement: string;
  catElectrical: string;
  catLabor: string;
  budMaterials: string;
  budCement: string;
  budElectrical: string;
  budLabor: string;
  persCatSalary: string;
  persCatGroceries: string;
  persCatFuel: string;
  persCatTransfer: string;
  persTx1: string;
  persTx2: string;
  persTx3: string;
  persTx4: string;
  assetPlot: string;
  assetVehicle: string;
  assetGold: string;
  assetShop: string;
  payDeptSite: string;
  payDeptAdmin: string;
  payDeptFinance: string;
  payDeptSales: string;
  payGrade1: string;
  payGrade2: string;
  payGrade3: string;
  payGrade4: string;
  payEmpAhmad: string;
  payEmpBilal: string;
  payEmpCara: string;
  payEmpDanish: string;
  payRunMar: string;
  payRunApr: string;
  payRunMay: string;
  payRunJun: string;
};

function demoIdPrefix(tenantId: string): string {
  if (tenantId === DEMO_MASTER_TENANT_ID) return 'dm';
  if (isDemoPresentationTenant(tenantId)) return 'dc';
  return 'demo';
}

function idsForTenant(tenantId: string): DemoSeedIds {
  const p = demoIdPrefix(tenantId);
  return {
    ownerAli: `${p}-owner-ali`,
    ownerSara: `${p}-owner-sara`,
    tenantAhmed: `${p}-tenant-ahmed`,
    tenantFatima: `${p}-tenant-fatima`,
    tenantHassan: `${p}-tenant-hassan`,
    tenantZain: `${p}-tenant-zain`,
    brokerKamran: `${p}-broker-kamran`,
    bldSkyline: `${p}-bld-skyline`,
    bldHarbor: `${p}-bld-harbor`,
    prop101: `${p}-prop-101`,
    prop102: `${p}-prop-102`,
    prop103: `${p}-prop-103`,
    prop104: `${p}-prop-104`,
    prop201: `${p}-prop-201`,
    prop202: `${p}-prop-202`,
    prop203: `${p}-prop-203`,
    prop204: `${p}-prop-204`,
    projHorizon: `${p}-proj-horizon`,
    projRiverside: `${p}-proj-riverside`,
    unitH1: `${p}-unit-h1`,
    unitH2: `${p}-unit-h2`,
    unitR1: `${p}-unit-r1`,
    vendorSteel: `${p}-vendor-steel`,
    vendorCement: `${p}-vendor-cement`,
    vendorElectric: `${p}-vendor-electric`,
    vendorPlumb: `${p}-vendor-plumb`,
    agr101: `${p}-agr-101`,
    agr102: `${p}-agr-201`,
    agr103: `${p}-agr-102`,
    agr104: `${p}-agr-104`,
    inv005: `${p}-inv-005`,
    inv001: `${p}-inv-001`,
    inv002: `${p}-inv-002`,
    inv003: `${p}-inv-003`,
    inv004: `${p}-inv-004`,
    invProj001: `${p}-inv-proj-001`,
    invProj002: `${p}-inv-proj-002`,
    invProj003: `${p}-inv-proj-003`,
    invProj004: `${p}-inv-proj-004`,
    buyerImran: `${p}-buyer-imran`,
    paHorizon: `${p}-pa-horizon`,
    con001: `${p}-con-001`,
    con002: `${p}-con-002`,
    con003: `${p}-con-003`,
    con004: `${p}-con-004`,
    bill001: `${p}-bill-stl-001`,
    bill002: `${p}-bill-cmt-001`,
    bill003: `${p}-bill-elc-001`,
    bill004: `${p}-bill-stl-002`,
    bill005: `${p}-bill-cmt-002`,
    bill006: `${p}-bill-cmt-003`,
    bill007: `${p}-bill-cmt-004`,
    bill008: `${p}-bill-elc-002`,
    bill009: `${p}-bill-stl-003`,
    bill010: `${p}-bill-stl-004`,
    bill011: `${p}-bill-elc-003`,
    bill012: `${p}-bill-elc-004`,
    accOperating: `${p}-acc-operating`,
    accEscrow: `${p}-acc-escrow`,
    accPetty: `${p}-acc-petty`,
    accOwnerCapital: `${p}-acc-owner-capital`,
    catMaterials: `${p}-cat-materials`,
    catCement: `${p}-cat-cement`,
    catElectrical: `${p}-cat-electrical`,
    catLabor: `${p}-cat-labor`,
    budMaterials: `${p}-bud-materials`,
    budCement: `${p}-bud-cement`,
    budElectrical: `${p}-bud-electrical`,
    budLabor: `${p}-bud-labor`,
    persCatSalary: `${p}-pers-cat-salary`,
    persCatGroceries: `${p}-pers-cat-groceries`,
    persCatFuel: `${p}-pers-cat-fuel`,
    persCatTransfer: `${p}-pers-cat-transfer`,
    persTx1: `${p}-pers-tx-1`,
    persTx2: `${p}-pers-tx-2`,
    persTx3: `${p}-pers-tx-3`,
    persTx4: `${p}-pers-tx-4`,
    assetPlot: `${p}-asset-plot`,
    assetVehicle: `${p}-asset-vehicle`,
    assetGold: `${p}-asset-gold`,
    assetShop: `${p}-asset-shop`,
    payDeptSite: `${p}-pay-dept-site`,
    payDeptAdmin: `${p}-pay-dept-admin`,
    payDeptFinance: `${p}-pay-dept-finance`,
    payDeptSales: `${p}-pay-dept-sales`,
    payGrade1: `${p}-pay-grade-1`,
    payGrade2: `${p}-pay-grade-2`,
    payGrade3: `${p}-pay-grade-3`,
    payGrade4: `${p}-pay-grade-4`,
    payEmpAhmad: `${p}-pay-emp-ahmad`,
    payEmpBilal: `${p}-pay-emp-bilal`,
    payEmpCara: `${p}-pay-emp-cara`,
    payEmpDanish: `${p}-pay-emp-danish`,
    payRunMar: `${p}-pay-run-mar`,
    payRunApr: `${p}-pay-run-apr`,
    payRunMay: `${p}-pay-run-may`,
    payRunJun: `${p}-pay-run-jun`,
  };
}

function padMonth(d: Date): string {
  return String(d.getMonth() + 1).padStart(2, '0');
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${padMonth(d)}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStart(offsetMonths: number, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth() - offsetMonths, 1);
  return isoDate(d);
}

function rentalMonth(offsetMonths: number, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth() - offsetMonths, 1);
  return `${d.getFullYear()}-${padMonth(d)}`;
}

function monthName(d: Date): string {
  return MONTH_NAMES[d.getMonth()];
}

function payrollPeriod(offsetMonths: number, base = new Date()): { month: string; year: number; start: string; end: string } {
  const d = new Date(base.getFullYear(), base.getMonth() - offsetMonths, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    month: monthName(d),
    year: d.getFullYear(),
    start: isoDate(d),
    end: isoDate(last),
  };
}

async function postSeedJournalMirrors(client: pg.PoolClient, tenantId: string): Promise<void> {
  await backfillTransactionJournalMirrorsForTenant(client, tenantId, { batchSize: 200 });
  await backfillInvoiceJournalMirrorsForTenant(client, tenantId);
  await backfillBillJournalMirrorsForTenant(client, tenantId);
}

export async function seedDemoBusinessData(
  client: pg.PoolClient,
  tenantId: string
): Promise<void> {
  await bootstrapTenantChart(client, tenantId, { legacyIds: false });

  if (tenantId !== DEMO_PUBLIC_TENANT_ID && !isDemoPresentationTenant(tenantId)) {
    try {
      await startTrialSubscription(client, tenantId);
    } catch {
      /* trial plan optional in dev */
    }
  }

  const ids = idsForTenant(tenantId);
  const today = new Date();
  const y = today.getFullYear();
  const m = padMonth(today);
  const prefix = demoIdPrefix(tenantId);

  await client.query(
    isDemoPresentationTenant(tenantId)
      ? `UPDATE tenants SET company_name = $2, updated_at = NOW() WHERE id = $1`
      : `UPDATE tenants SET company_name = $2, name = $2, updated_at = NOW() WHERE id = $1`,
    [tenantId, 'Al Noor Properties']
  );

  const contacts: Array<[string, string, string]> = [
    [ids.ownerAli, 'Ali Khan', 'Owner'],
    [ids.ownerSara, 'Sara Malik', 'Owner'],
    [ids.tenantAhmed, 'Ahmed Raza', 'Tenant'],
    [ids.tenantFatima, 'Fatima Noor', 'Tenant'],
    [ids.tenantHassan, 'Hassan Qureshi', 'Tenant'],
    [ids.tenantZain, 'Zain Abbas', 'Tenant'],
    [ids.buyerImran, 'Imran Shah', 'Client'],
    [ids.brokerKamran, 'Kamran Siddiqui', 'Broker'],
  ];

  for (const [id, name, type] of contacts) {
    await client.query(
      `INSERT INTO contacts (id, tenant_id, name, type, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, name, type]
    );
  }

  const demoAccounts: Array<[string, string, string, number]> = [
    [ids.accOperating, 'Main Operating Account', 'BANK', 0],
    [ids.accEscrow, 'Project Escrow Account', 'BANK', 0],
    [ids.accPetty, 'Petty Cash', 'CASH', 25000],
    [ids.accOwnerCapital, 'Owner Capital — Al Noor', 'EQUITY', 0],
  ];
  for (const [id, name, type, opening] of demoAccounts) {
    await client.query(
      `INSERT INTO accounts (id, tenant_id, name, type, balance, opening_balance, is_permanent, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5, FALSE, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, balance = EXCLUDED.balance, opening_balance = EXCLUDED.opening_balance,
         updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, name, type, opening]
    );
  }

  const demoCategories: Array<[string, string, string]> = [
    [ids.catMaterials, 'Materials & Steel', 'Expense'],
    [ids.catCement, 'Cement & Concrete', 'Expense'],
    [ids.catElectrical, 'Electrical Works', 'Expense'],
    [ids.catLabor, 'Construction Labor', 'Expense'],
  ];
  for (const [id, name, type] of demoCategories) {
    await client.query(
      `INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, is_hidden, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, FALSE, FALSE, FALSE, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, name, type]
    );
  }

  const buildings: Array<[string, string, string]> = [
    [ids.bldSkyline, 'Skyline Tower', '#4F46E5'],
    [ids.bldHarbor, 'Harbor View Residences', '#0EA5E9'],
  ];
  for (const [id, name, color] of buildings) {
    await client.query(
      `INSERT INTO buildings (id, tenant_id, name, color, description, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, description = EXCLUDED.description, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, name, color, `${name} — premium rental portfolio`]
    );
  }

  const properties: Array<[string, string, string, string, number]> = [
    [ids.prop101, 'Unit 101 — Skyline', ids.ownerAli, ids.bldSkyline, 4500],
    [ids.prop102, 'Unit 102 — Skyline', ids.ownerAli, ids.bldSkyline, 4200],
    [ids.prop103, 'Unit 103 — Skyline', ids.ownerAli, ids.bldSkyline, 4200],
    [ids.prop104, 'Unit 104 — Skyline', ids.ownerAli, ids.bldSkyline, 4500],
    [ids.prop201, 'Unit 201 — Harbor', ids.ownerSara, ids.bldHarbor, 5500],
    [ids.prop202, 'Unit 202 — Harbor', ids.ownerSara, ids.bldHarbor, 5200],
    [ids.prop203, 'Unit 203 — Harbor', ids.ownerSara, ids.bldHarbor, 5200],
    [ids.prop204, 'Unit 204 — Harbor', ids.ownerSara, ids.bldHarbor, 5500],
  ];
  for (const [id, name, ownerId, buildingId, sc] of properties) {
    await client.query(
      `INSERT INTO properties (id, tenant_id, name, owner_id, building_id, monthly_service_charge, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, owner_id = EXCLUDED.owner_id, building_id = EXCLUDED.building_id,
         monthly_service_charge = EXCLUDED.monthly_service_charge, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, name, ownerId, buildingId, sc]
    );
  }

  const vendors: Array<[string, string, string]> = [
    [ids.vendorSteel, 'Prime Steel Suppliers', '0300-1112233'],
    [ids.vendorCement, 'National Cement Co.', '0300-4445566'],
    [ids.vendorElectric, 'City Electric Works', '0300-7778899'],
    [ids.vendorPlumb, 'Gulf Plumbing & HVAC', '0300-2223344'],
  ];
  for (const [id, name, phone] of vendors) {
    await client.query(
      `INSERT INTO vendors (id, tenant_id, name, contact_no, is_active, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, contact_no = EXCLUDED.contact_no, is_active = TRUE, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, name, phone]
    );
  }

  await client.query(
    `INSERT INTO projects (id, tenant_id, name, location, project_type, status, description, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
    [
      ids.projHorizon,
      tenantId,
      'Horizon Heights Phase II',
      'Gulberg, Lahore',
      'residential',
      'active',
      '12-unit mid-rise with installment sales and construction cost tracking.',
    ]
  );

  await client.query(
    `INSERT INTO projects (id, tenant_id, name, location, project_type, status, description, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
    [
      ids.projRiverside,
      tenantId,
      'Riverside Commercial Plaza',
      'DHA Phase 6, Karachi',
      'commercial',
      'active',
      'Mixed-use development with vendor bills and project P&L visibility.',
    ]
  );

  const units: Array<[string, string, string, string, number]> = [
    [ids.unitH1, ids.projHorizon, 'A-101', 'sold', 8500000],
    [ids.unitH2, ids.projHorizon, 'A-102', 'available', 9200000],
    [ids.unitR1, ids.projRiverside, 'Shop-03', 'sold', 14500000],
  ];
  for (const [id, projectId, unitNumber, status, price] of units) {
    await client.query(
      `INSERT INTO units (id, tenant_id, project_id, unit_number, status, sale_price, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, sale_price = EXCLUDED.sale_price, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, projectId, unitNumber, status, price]
    );
  }

  const startDate = `${y}-01-01`;
  const endDate = `${y + 1}-12-31`;
  const expiringEnd = isoDate(new Date(today.getFullYear(), today.getMonth() + 2, today.getDate()));

  await client.query(
    `INSERT INTO rental_agreements (id, tenant_id, agreement_number, contact_id, property_id, start_date, end_date, monthly_rent, rent_due_date, status, owner_id, security_deposit, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 5, 'active', $9, 50000, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET monthly_rent = EXCLUDED.monthly_rent, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
    [ids.agr101, tenantId, 'RA-2024-101', ids.tenantAhmed, ids.prop101, startDate, endDate, 75000, ids.ownerAli]
  );

  await client.query(
    `INSERT INTO rental_agreements (id, tenant_id, agreement_number, contact_id, property_id, start_date, end_date, monthly_rent, rent_due_date, status, owner_id, security_deposit, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 5, 'active', $9, 60000, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET monthly_rent = EXCLUDED.monthly_rent, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
    [ids.agr102, tenantId, 'RA-2024-201', ids.tenantFatima, ids.prop201, startDate, endDate, 95000, ids.ownerSara]
  );

  await client.query(
    `INSERT INTO rental_agreements (id, tenant_id, agreement_number, contact_id, property_id, start_date, end_date, monthly_rent, rent_due_date, status, owner_id, security_deposit, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 5, 'active', $9, 50000, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET monthly_rent = EXCLUDED.monthly_rent, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
    [
      ids.agr103,
      tenantId,
      'RA-2023-102',
      ids.tenantHassan,
      ids.prop102,
      `${y - 1}-01-01`,
      expiringEnd,
      72000,
      ids.ownerAli,
    ]
  );

  await client.query(
    `INSERT INTO rental_agreements (id, tenant_id, agreement_number, contact_id, property_id, start_date, end_date, monthly_rent, rent_due_date, status, owner_id, security_deposit, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 5, 'active', $9, 55000, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET monthly_rent = EXCLUDED.monthly_rent, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
    [ids.agr104, tenantId, 'RA-2024-103', ids.tenantZain, ids.prop103, startDate, endDate, 68000, ids.ownerAli]
  );

  const issueDate = `${y}-${m}-01`;
  const dueDate = `${y}-${m}-10`;
  const overdueDue = monthStart(1);

  await client.query(
    `INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type, property_id, agreement_id, rental_month, building_id, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 75000, 75000, 'Paid', $5, $6, 'Rental', $7, $8, $9, $10, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, invoice_type = EXCLUDED.invoice_type, updated_at = NOW()`,
    [ids.inv001, tenantId, 'INV-RENT-001', ids.tenantAhmed, issueDate, dueDate, ids.prop101, ids.agr101, `${y}-${m}`, ids.bldSkyline]
  );

  await client.query(
    `INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type, property_id, agreement_id, rental_month, building_id, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 95000, 45000, 'Partially Paid', $5, $6, 'Rental', $7, $8, $9, $10, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, invoice_type = EXCLUDED.invoice_type, updated_at = NOW()`,
    [ids.inv002, tenantId, 'INV-RENT-002', ids.tenantFatima, issueDate, dueDate, ids.prop201, ids.agr102, `${y}-${m}`, ids.bldHarbor]
  );

  await client.query(
    `INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type, property_id, agreement_id, rental_month, building_id, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 72000, 0, 'Unpaid', $5, $6, 'Rental', $7, $8, $9, $10, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, invoice_type = EXCLUDED.invoice_type, updated_at = NOW()`,
    [
      ids.inv003,
      tenantId,
      'INV-RENT-003',
      ids.tenantHassan,
      overdueDue,
      overdueDue,
      ids.prop102,
      ids.agr103,
      rentalMonth(1),
      ids.bldSkyline,
    ]
  );

  await client.query(
    `INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type, property_id, agreement_id, rental_month, building_id, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 75000, 75000, 'Paid', $5, $6, 'Rental', $7, $8, $9, $10, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, invoice_type = EXCLUDED.invoice_type, updated_at = NOW()`,
    [
      ids.inv004,
      tenantId,
      'INV-RENT-004',
      ids.tenantAhmed,
      monthStart(1),
      monthStart(1),
      ids.prop101,
      ids.agr101,
      rentalMonth(1),
      ids.bldSkyline,
    ]
  );

  await client.query(
    `INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type, property_id, agreement_id, rental_month, building_id, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 68000, 34000, 'Partially Paid', $5, $6, 'Rental', $7, $8, $9, $10, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, invoice_type = EXCLUDED.invoice_type, updated_at = NOW()`,
    [
      ids.inv005,
      tenantId,
      'INV-RENT-005',
      ids.tenantZain,
      issueDate,
      dueDate,
      ids.prop103,
      ids.agr104,
      `${y}-${m}`,
      ids.bldSkyline,
    ]
  );

  await client.query(
    `INSERT INTO project_agreements (id, tenant_id, agreement_number, client_id, project_id, unit_ids, selling_price, issue_date, description, status, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 8500000, $7, $8, 'Active', 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET selling_price = EXCLUDED.selling_price, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
    [
      ids.paHorizon,
      tenantId,
      'PA-2024-001',
      ids.buyerImran,
      ids.projHorizon,
      JSON.stringify([ids.unitH1]),
      `${y}-02-15`,
      'Unit A-101 — Horizon Heights Phase II',
    ]
  );

  await client.query(
    `INSERT INTO project_agreement_units (agreement_id, unit_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [ids.paHorizon, ids.unitH1]
  );

  const projInv1Date = `${y}-02-15`;
  const projInv2Date = `${y}-04-15`;
  const projInv3Date = `${y}-06-15`;

  await client.query(
    `INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type, description, project_id, unit_id, agreement_id, category_id, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 2500000, 2500000, 'Paid', $5, $5, 'Installment', $6, $7, $8, $9, $10, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, invoice_type = EXCLUDED.invoice_type, updated_at = NOW()`,
    [
      ids.invProj001,
      tenantId,
      'P-INV-001',
      ids.buyerImran,
      projInv1Date,
      'Booking installment 1/5 — Unit A-101',
      ids.projHorizon,
      ids.unitH1,
      ids.paHorizon,
      SYS_UNIT_SELL,
    ]
  );

  await client.query(
    `INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type, description, project_id, unit_id, agreement_id, category_id, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 1700000, 1000000, 'Partially Paid', $5, $5, 'Installment', $6, $7, $8, $9, $10, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, invoice_type = EXCLUDED.invoice_type, updated_at = NOW()`,
    [
      ids.invProj002,
      tenantId,
      'P-INV-002',
      ids.buyerImran,
      projInv2Date,
      'Installment 2/5 — Unit A-101',
      ids.projHorizon,
      ids.unitH1,
      ids.paHorizon,
      SYS_UNIT_SELL,
    ]
  );

  await client.query(
    `INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type, description, project_id, unit_id, agreement_id, category_id, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 1700000, 0, 'Unpaid', $5, $5, 'Installment', $6, $7, $8, $9, $10, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, invoice_type = EXCLUDED.invoice_type, updated_at = NOW()`,
    [
      ids.invProj003,
      tenantId,
      'P-INV-003',
      ids.buyerImran,
      projInv3Date,
      'Installment 3/5 — Unit A-101',
      ids.projHorizon,
      ids.unitH1,
      ids.paHorizon,
      SYS_UNIT_SELL,
    ]
  );

  const projInv4Date = `${y}-08-15`;
  await client.query(
    `INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type, description, project_id, unit_id, agreement_id, category_id, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 1600000, 800000, 'Partially Paid', $5, $5, 'Installment', $6, $7, $8, $9, $10, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, invoice_type = EXCLUDED.invoice_type, updated_at = NOW()`,
    [
      ids.invProj004,
      tenantId,
      'P-INV-004',
      ids.buyerImran,
      projInv4Date,
      'Installment 4/5 — Unit A-101',
      ids.projHorizon,
      ids.unitH1,
      ids.paHorizon,
      SYS_UNIT_SELL,
    ]
  );

  const contracts: Array<[string, string, string, string, number, string]> = [
    [ids.con001, 'CON-2024-001', 'Structural Steel Package', ids.vendorSteel, 1850000, 'Active'],
    [ids.con002, 'CON-2024-002', 'Cement Supply Agreement', ids.vendorCement, 920000, 'Active'],
    [ids.con003, 'CON-2024-003', 'Electrical Works', ids.vendorElectric, 640000, 'Active'],
    [ids.con004, 'CON-2024-004', 'Plumbing & HVAC Package', ids.vendorPlumb, 480000, 'Active'],
  ];
  for (const [id, number, name, vendorId, total, status] of contracts) {
    await client.query(
      `INSERT INTO contracts (id, tenant_id, contract_number, name, project_id, vendor_id, total_amount, status, start_date, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, total_amount = EXCLUDED.total_amount, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, number, name, ids.projHorizon, vendorId, total, status, startDate]
    );
  }

  type BillSeed = [string, string, string, string, number, number, string, string, string, string];
  const bills: BillSeed[] = [
    [ids.bill001, 'BILL-STL-001', ids.vendorSteel, 'Steel procurement — Phase II', 185000, 185000, 'Paid', ids.con001, ids.projHorizon, ids.catMaterials],
    [ids.bill004, 'BILL-STL-002', ids.vendorSteel, 'Second steel delivery — Phase II', 120000, 60000, 'Partially Paid', ids.con001, ids.projHorizon, ids.catMaterials],
    [ids.bill009, 'BILL-STL-003', ids.vendorSteel, 'Steel reinforcement — Riverside', 95000, 95000, 'Paid', ids.con003, ids.projRiverside, ids.catMaterials],
    [ids.bill010, 'BILL-STL-004', ids.vendorSteel, 'Structural steel — Horizon podium', 78000, 0, 'Unpaid', ids.con001, ids.projHorizon, ids.catMaterials],
    [ids.bill002, 'BILL-CMT-001', ids.vendorCement, 'Cement delivery — Phase II', 92000, 0, 'Unpaid', ids.con002, ids.projHorizon, ids.catCement],
    [ids.bill005, 'BILL-CMT-002', ids.vendorCement, 'Ready-mix concrete — Horizon', 68000, 68000, 'Paid', ids.con002, ids.projHorizon, ids.catCement],
    [ids.bill006, 'BILL-CMT-003', ids.vendorCement, 'Foundation cement — Riverside', 54000, 54000, 'Paid', ids.con002, ids.projRiverside, ids.catCement],
    [ids.bill007, 'BILL-CMT-004', ids.vendorCement, 'Block work cement — Horizon', 41000, 20000, 'Partially Paid', ids.con002, ids.projHorizon, ids.catCement],
    [ids.bill003, 'BILL-ELC-001', ids.vendorElectric, 'Electrical fittings — Phase II', 34000, 34000, 'Paid', ids.con003, ids.projHorizon, ids.catElectrical],
    [ids.bill008, 'BILL-ELC-002', ids.vendorElectric, 'Wiring package — Riverside', 52000, 52000, 'Paid', ids.con003, ids.projRiverside, ids.catElectrical],
    [ids.bill011, 'BILL-ELC-003', ids.vendorElectric, 'Panel boards — Horizon', 38000, 0, 'Unpaid', ids.con003, ids.projHorizon, ids.catElectrical],
    [ids.bill012, 'BILL-ELC-004', ids.vendorElectric, 'Generator hookup — Riverside', 29000, 15000, 'Partially Paid', ids.con003, ids.projRiverside, ids.catElectrical],
    [`${prefix}-bill-plumb-001`, 'BILL-PLB-001', ids.vendorPlumb, 'Plumbing rough-in — Horizon', 62000, 62000, 'Paid', ids.con004, ids.projHorizon, ids.catLabor],
    [`${prefix}-bill-plumb-002`, 'BILL-PLB-002', ids.vendorPlumb, 'HVAC ducting — Horizon', 48000, 24000, 'Partially Paid', ids.con004, ids.projHorizon, ids.catLabor],
    [`${prefix}-bill-plumb-003`, 'BILL-PLB-003', ids.vendorPlumb, 'Sanitary works — Riverside', 36000, 36000, 'Paid', ids.con004, ids.projRiverside, ids.catLabor],
    [`${prefix}-bill-plumb-004`, 'BILL-PLB-004', ids.vendorPlumb, 'Firefighting lines — Horizon', 28000, 0, 'Unpaid', ids.con004, ids.projHorizon, ids.catLabor],
  ];
  for (const [id, number, vendorId, desc, amount, paid, status, contractId, projectId, categoryId] of bills) {
    await client.query(
      `INSERT INTO bills (id, tenant_id, bill_number, vendor_id, amount, paid_amount, status, issue_date, due_date, description, project_id, contract_id, category_id, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, number, vendorId, amount, paid, status, issueDate, dueDate, desc, projectId, contractId, categoryId]
    );
  }

  const budgets: Array<[string, string, number]> = [
    [ids.budMaterials, ids.catMaterials, 2000000],
    [ids.budCement, ids.catCement, 500000],
    [ids.budElectrical, ids.catElectrical, 400000],
    [ids.budLabor, ids.catLabor, 1200000],
  ];
  for (const [id, categoryId, amount] of budgets) {
    await client.query(
      `INSERT INTO budgets (id, tenant_id, category_id, project_id, amount, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())
       ON CONFLICT (tenant_id, category_id, project_id) DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, categoryId, ids.projHorizon, amount]
    );
  }

  type DemoTxSeed = {
    id: string;
    type: 'Income' | 'Expense';
    amount: number;
    date: string;
    desc: string;
    categoryId: string;
    propertyId?: string | null;
    contactId?: string | null;
    invoiceId?: string | null;
    projectId?: string | null;
    buildingId?: string | null;
    vendorId?: string | null;
    billId?: string | null;
  };

  const txRows: DemoTxSeed[] = [];

  const pushTx = (row: DemoTxSeed) => txRows.push(row);

  // Tenants — 4 rent receipts each
  pushTx({
    id: `${ids.inv001}-pay`,
    type: 'Income',
    amount: 75000,
    date: issueDate,
    desc: 'Rent received — Unit 101 (current month)',
    categoryId: SYS_RENT,
    propertyId: ids.prop101,
    contactId: ids.tenantAhmed,
    invoiceId: ids.inv001,
    buildingId: ids.bldSkyline,
  });
  pushTx({
    id: `${ids.inv004}-pay`,
    type: 'Income',
    amount: 75000,
    date: monthStart(1),
    desc: 'Rent received — Unit 101 (prior month)',
    categoryId: SYS_RENT,
    propertyId: ids.prop101,
    contactId: ids.tenantAhmed,
    invoiceId: ids.inv004,
    buildingId: ids.bldSkyline,
  });
  pushTx({
    id: `${prefix}-tx-rent-ahmed-2`,
    type: 'Income',
    amount: 75000,
    date: monthStart(2),
    desc: `Rent received — Unit 101 (${rentalMonth(2)})`,
    categoryId: SYS_RENT,
    propertyId: ids.prop101,
    contactId: ids.tenantAhmed,
    buildingId: ids.bldSkyline,
  });
  pushTx({
    id: `${prefix}-tx-rent-ahmed-3`,
    type: 'Income',
    amount: 75000,
    date: monthStart(3),
    desc: `Rent received — Unit 101 (${rentalMonth(3)})`,
    categoryId: SYS_RENT,
    propertyId: ids.prop101,
    contactId: ids.tenantAhmed,
    buildingId: ids.bldSkyline,
  });

  pushTx({
    id: `${ids.inv002}-pay`,
    type: 'Income',
    amount: 45000,
    date: issueDate,
    desc: 'Partial rent — Unit 201 (current month)',
    categoryId: SYS_RENT,
    propertyId: ids.prop201,
    contactId: ids.tenantFatima,
    invoiceId: ids.inv002,
    buildingId: ids.bldHarbor,
  });
  for (let i = 1; i <= 3; i += 1) {
    pushTx({
      id: `${prefix}-tx-rent-fatima-${i}`,
      type: 'Income',
      amount: i === 1 ? 95000 : 47500,
      date: monthStart(i),
      desc: `Rent received — Unit 201 (${rentalMonth(i)})`,
      categoryId: SYS_RENT,
      propertyId: ids.prop201,
      contactId: ids.tenantFatima,
      buildingId: ids.bldHarbor,
    });
  }

  for (let i = 1; i <= 4; i += 1) {
    pushTx({
      id: `${prefix}-tx-rent-hassan-${i}`,
      type: 'Income',
      amount: i === 4 ? 36000 : 72000,
      date: monthStart(i),
      desc: `Rent received — Unit 102 (${rentalMonth(i)})`,
      categoryId: SYS_RENT,
      propertyId: ids.prop102,
      contactId: ids.tenantHassan,
      buildingId: ids.bldSkyline,
    });
  }

  // Client — 4 installment receipts
  pushTx({
    id: `${ids.invProj001}-pay`,
    type: 'Income',
    amount: 2500000,
    date: projInv1Date,
    desc: 'Booking installment — Unit A-101',
    categoryId: SYS_UNIT_SELL,
    contactId: ids.buyerImran,
    invoiceId: ids.invProj001,
    projectId: ids.projHorizon,
  });
  pushTx({
    id: `${ids.invProj002}-pay`,
    type: 'Income',
    amount: 1000000,
    date: projInv2Date,
    desc: 'Partial installment — Unit A-101',
    categoryId: SYS_UNIT_SELL,
    contactId: ids.buyerImran,
    invoiceId: ids.invProj002,
    projectId: ids.projHorizon,
  });
  pushTx({
    id: `${ids.invProj004}-pay`,
    type: 'Income',
    amount: 800000,
    date: projInv4Date,
    desc: 'Partial installment 4 — Unit A-101',
    categoryId: SYS_UNIT_SELL,
    contactId: ids.buyerImran,
    invoiceId: ids.invProj004,
    projectId: ids.projHorizon,
  });
  pushTx({
    id: `${prefix}-tx-proj-imran-token`,
    type: 'Income',
    amount: 500000,
    date: monthStart(2),
    desc: 'Token money — Unit A-101',
    categoryId: SYS_UNIT_SELL,
    contactId: ids.buyerImran,
    projectId: ids.projHorizon,
  });

  // Owners — 4 payouts each
  const aliPayouts: Array<[string, string, number]> = [
    [ids.prop101, 'Unit 101', 68000],
    [ids.prop102, 'Unit 102', 62000],
    [ids.prop103, 'Unit 103', 61000],
    [ids.prop104, 'Unit 104', 65000],
  ];
  for (let i = 0; i < aliPayouts.length; i += 1) {
    const [propId, label, amount] = aliPayouts[i];
    pushTx({
      id: `${prefix}-tx-own-ali-${propId}`,
      type: 'Expense',
      amount,
      date: monthStart(i + 1),
      desc: `Owner payout — Ali Khan (${label})`,
      categoryId: SYS_PM_COST,
      propertyId: propId,
      contactId: ids.ownerAli,
      buildingId: ids.bldSkyline,
    });
  }

  const saraPayouts: Array<[string, string, number]> = [
    [ids.prop201, 'Unit 201', 82000],
    [ids.prop202, 'Unit 202', 78000],
    [ids.prop203, 'Unit 203', 76000],
    [ids.prop204, 'Unit 204', 80000],
  ];
  for (let i = 0; i < saraPayouts.length; i += 1) {
    const [propId, label, amount] = saraPayouts[i];
    pushTx({
      id: `${prefix}-tx-own-sara-${propId}`,
      type: 'Expense',
      amount,
      date: monthStart(i + 1),
      desc: `Owner payout — Sara Malik (${label})`,
      categoryId: SYS_PM_COST,
      propertyId: propId,
      contactId: ids.ownerSara,
      buildingId: ids.bldHarbor,
    });
  }

  // Vendors — 4 bill payments / expenses each
  const vendorSteelTx: Array<[string, number, string, string | null, string]> = [
    [ids.bill001, 185000, 'Steel procurement — Horizon', ids.projHorizon, monthStart(1)],
    [ids.bill004, 60000, 'Partial steel delivery — Horizon', ids.projHorizon, monthStart(2)],
    [ids.bill009, 95000, 'Steel reinforcement — Riverside', ids.projRiverside, monthStart(3)],
    ['', 42000, 'Steel cutting — Horizon site', ids.projHorizon, monthStart(4)],
  ];
  for (let i = 0; i < vendorSteelTx.length; i += 1) {
    const [billId, amount, desc, projectId, date] = vendorSteelTx[i];
    pushTx({
      id: `${prefix}-tx-vnd-steel-${i + 1}`,
      type: 'Expense',
      amount,
      date,
      desc,
      categoryId: ids.catMaterials,
      projectId,
      vendorId: ids.vendorSteel,
      billId: billId || null,
    });
  }

  const vendorCementTx: Array<[string, number, string, string | null, string]> = [
    [ids.bill005, 68000, 'Ready-mix concrete — Horizon', ids.projHorizon, monthStart(1)],
    [ids.bill006, 54000, 'Foundation cement — Riverside', ids.projRiverside, monthStart(2)],
    [ids.bill007, 20000, 'Partial block work cement — Horizon', ids.projHorizon, monthStart(3)],
    ['', 18000, 'Cement trucking — Horizon', ids.projHorizon, monthStart(4)],
  ];
  for (let i = 0; i < vendorCementTx.length; i += 1) {
    const [billId, amount, desc, projectId, date] = vendorCementTx[i];
    pushTx({
      id: `${prefix}-tx-vnd-cement-${i + 1}`,
      type: 'Expense',
      amount,
      date,
      desc,
      categoryId: ids.catCement,
      projectId,
      vendorId: ids.vendorCement,
      billId: billId || null,
    });
  }

  const vendorElectricTx: Array<[string, number, string, string | null, string]> = [
    [ids.bill003, 34000, 'Electrical fittings — Horizon', ids.projHorizon, monthStart(1)],
    [ids.bill008, 52000, 'Wiring package — Riverside', ids.projRiverside, monthStart(2)],
    [ids.bill012, 15000, 'Partial generator hookup — Riverside', ids.projRiverside, monthStart(3)],
    ['', 12000, 'Site electrical inspection — Horizon', ids.projHorizon, monthStart(4)],
  ];
  for (let i = 0; i < vendorElectricTx.length; i += 1) {
    const [billId, amount, desc, projectId, date] = vendorElectricTx[i];
    pushTx({
      id: `${prefix}-tx-vnd-electric-${i + 1}`,
      type: 'Expense',
      amount,
      date,
      desc,
      categoryId: ids.catElectrical,
      projectId,
      vendorId: ids.vendorElectric,
      billId: billId || null,
    });
  }

  const vendorPlumbTx: Array<[string, number, string, string | null, string]> = [
    [`${prefix}-bill-plumb-001`, 62000, 'Plumbing rough-in — Horizon', ids.projHorizon, monthStart(1)],
    [`${prefix}-bill-plumb-002`, 24000, 'Partial HVAC ducting — Horizon', ids.projHorizon, monthStart(2)],
    [`${prefix}-bill-plumb-003`, 36000, 'Sanitary works — Riverside', ids.projRiverside, monthStart(3)],
    ['', 14000, 'Plumbing inspection — Horizon', ids.projHorizon, monthStart(4)],
  ];
  for (let i = 0; i < vendorPlumbTx.length; i += 1) {
    const [billId, amount, desc, projectId, date] = vendorPlumbTx[i];
    pushTx({
      id: `${prefix}-tx-vnd-plumb-${i + 1}`,
      type: 'Expense',
      amount,
      date,
      desc,
      categoryId: ids.catLabor,
      projectId,
      vendorId: ids.vendorPlumb,
      billId: billId || null,
    });
  }

  pushTx({
    id: `${ids.inv005}-pay`,
    type: 'Income',
    amount: 34000,
    date: issueDate,
    desc: 'Partial rent — Unit 103 (current month)',
    categoryId: SYS_RENT,
    propertyId: ids.prop103,
    contactId: ids.tenantZain,
    invoiceId: ids.inv005,
    buildingId: ids.bldSkyline,
  });
  for (let i = 1; i <= 3; i += 1) {
    pushTx({
      id: `${prefix}-tx-rent-zain-${i}`,
      type: 'Income',
      amount: i === 2 ? 68000 : 34000,
      date: monthStart(i),
      desc: `Rent received — Unit 103 (${rentalMonth(i)})`,
      categoryId: SYS_RENT,
      propertyId: ids.prop103,
      contactId: ids.tenantZain,
      buildingId: ids.bldSkyline,
    });
  }

  // Buildings — 4 operating expenses each
  const skylineBuildingTx = [
    ['maint', 25000, 'Elevator maintenance — Skyline Tower'],
    ['util', 8500, 'Common area utilities — Skyline'],
    ['sec', 14000, 'Security services — Skyline Tower'],
    ['clean', 11000, 'Cleaning contract — Skyline Tower'],
  ] as const;
  for (let i = 0; i < skylineBuildingTx.length; i += 1) {
    const [key, amount, desc] = skylineBuildingTx[i];
    pushTx({
      id: `${prefix}-tx-bld-skyline-${key}`,
      type: 'Expense',
      amount,
      date: monthStart(i + 1),
      desc,
      categoryId: SYS_BLD_MAINT,
      buildingId: ids.bldSkyline,
    });
  }

  const harborBuildingTx = [
    ['pool', 18000, 'Pool maintenance — Harbor View'],
    ['lobby', 22000, 'Lobby upkeep — Harbor View'],
    ['park', 9500, 'Parking area maintenance — Harbor View'],
    ['land', 16000, 'Landscaping — Harbor View'],
  ] as const;
  for (let i = 0; i < harborBuildingTx.length; i += 1) {
    const [key, amount, desc] = harborBuildingTx[i];
    pushTx({
      id: `${prefix}-tx-bld-harbor-${key}`,
      type: 'Expense',
      amount,
      date: monthStart(i + 1),
      desc,
      categoryId: SYS_BLD_MAINT,
      buildingId: ids.bldHarbor,
    });
  }

  pushTx({
    id: `${prefix}-tx-asset-vehicle-sale`,
    type: 'Income',
    amount: 3350000,
    date: `${y}-04-05`,
    desc: 'Sale of received vehicle — Unit A-101 buyer',
    categoryId: SYS_REV_ASSET,
    contactId: ids.buyerImran,
    projectId: ids.projHorizon,
  });
  const assetRecognition = [
    { key: 'plot', id: ids.assetPlot, amount: 2200000, projectId: ids.projHorizon, offset: 2 },
    { key: 'gold', id: ids.assetGold, amount: 850000, projectId: ids.projRiverside, offset: 3 },
    { key: 'shop', id: ids.assetShop, amount: 1800000, projectId: ids.projRiverside, offset: 4 },
  ] as const;
  for (const asset of assetRecognition) {
    pushTx({
      id: `${prefix}-tx-asset-${asset.key}-recognition`,
      type: 'Income',
      amount: asset.amount,
      date: monthStart(asset.offset),
      desc: `In-kind asset recorded — ${asset.key}`,
      categoryId: SYS_REV_ASSET,
      contactId: ids.buyerImran,
      projectId: asset.projectId,
    });
  }

  for (const row of txRows) {
    await client.query(
      `INSERT INTO transactions (id, tenant_id, type, amount, date, description, account_id, category_id, property_id, contact_id, invoice_id, project_id, building_id, vendor_id, bill_id, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, description = EXCLUDED.description, date = EXCLUDED.date, bill_id = EXCLUDED.bill_id, updated_at = NOW(), deleted_at = NULL`,
      [
        row.id,
        tenantId,
        row.type,
        row.amount,
        row.date,
        row.desc,
        SYS_CASH,
        row.categoryId,
        row.propertyId ?? null,
        row.contactId ?? null,
        row.invoiceId ?? null,
        row.projectId ?? null,
        row.buildingId ?? null,
        row.vendorId ?? null,
        row.billId ?? null,
      ]
    );
  }

  const bankTransfers: Array<[string, number, string, string, string, string]> = [
    [
      `${prefix}-tx-xfer-operating`,
      2400000,
      monthStart(1),
      'Transfer to Main Operating Account',
      SYS_CASH,
      ids.accOperating,
    ],
    [
      `${prefix}-tx-xfer-escrow`,
      950000,
      monthStart(2),
      'Transfer to Project Escrow Account',
      SYS_CASH,
      ids.accEscrow,
    ],
  ];
  for (const [id, amount, date, desc, fromId, toId] of bankTransfers) {
    await client.query(
      `INSERT INTO transactions (id, tenant_id, type, amount, date, description, account_id, from_account_id, to_account_id, version, created_at, updated_at)
       VALUES ($1, $2, 'Transfer', $3, $4, $5, $6, $7, $8, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         amount = EXCLUDED.amount, description = EXCLUDED.description, date = EXCLUDED.date,
         from_account_id = EXCLUDED.from_account_id, to_account_id = EXCLUDED.to_account_id,
         updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, amount, date, desc, fromId, fromId, toId]
    );
  }

  const personalCategories: Array<[string, string, 'Income' | 'Expense', number]> = [
    [ids.persCatSalary, 'Director Draw', 'Income', 0],
    [ids.persCatTransfer, 'Family Transfer In', 'Income', 1],
    [ids.persCatGroceries, 'Groceries', 'Expense', 2],
    [ids.persCatFuel, 'Personal Fuel', 'Expense', 3],
  ];
  for (const [id, name, type, sortOrder] of personalCategories) {
    await client.query(
      `INSERT INTO personal_categories (id, tenant_id, name, type, sort_order, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, sort_order = EXCLUDED.sort_order, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, name, type, sortOrder]
    );
  }

  const personalTxRows: Array<[string, string, 'Income' | 'Expense', number, string, string]> = [
    [ids.persTx1, ids.persCatSalary, 'Income', 150000, monthStart(1), 'Monthly director draw'],
    [ids.persTx2, ids.persCatTransfer, 'Income', 45000, monthStart(2), 'Family transfer — savings'],
    [ids.persTx3, ids.persCatGroceries, 'Expense', 18500, monthStart(2), 'Household groceries'],
    [ids.persTx4, ids.persCatFuel, 'Expense', 9200, monthStart(3), 'Personal vehicle fuel'],
  ];
  for (const [id, catId, type, amount, date, desc] of personalTxRows) {
    await client.query(
      `INSERT INTO personal_transactions (id, tenant_id, account_id, personal_category_id, type, amount, transaction_date, description, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, description = EXCLUDED.description, transaction_date = EXCLUDED.transaction_date, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, ids.accOperating, catId, type, amount, date, desc]
    );
  }

  const receivedAssets: Array<[string, string, string, string, string, number, string, string | null, number | null]> = [
    [ids.assetPlot, ids.projHorizon, ids.buyerImran, '5 Marla plot — DHA Phase 5', 'Plot', 2200000, `${y - 1}-11-10`, null, null],
    [ids.assetVehicle, ids.projHorizon, ids.buyerImran, 'Toyota Corolla 2022 — booking adjustment', 'Vehicle', 3200000, `${y}-01-20`, `${y}-04-05`, 3350000],
    [ids.assetGold, ids.projRiverside, ids.buyerImran, 'Gold bars — partial settlement', 'Gold', 850000, `${y}-03-08`, null, null],
    [ids.assetShop, ids.projRiverside, ids.buyerImran, 'Shop unit token — in-kind payment', 'Commercial Unit', 1800000, `${y}-05-12`, null, null],
  ];
  for (const [id, projectId, contactId, desc, assetType, value, received, sold, saleAmt] of receivedAssets) {
    await client.query(
      `INSERT INTO project_received_assets (id, tenant_id, project_id, contact_id, description, asset_type, recorded_value, received_date, sold_date, sale_amount, sale_account_id, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         description = EXCLUDED.description, recorded_value = EXCLUDED.recorded_value,
         sold_date = EXCLUDED.sold_date, sale_amount = EXCLUDED.sale_amount,
         updated_at = NOW(), deleted_at = NULL`,
      [
        id,
        tenantId,
        projectId,
        contactId,
        desc,
        assetType,
        value,
        received,
        sold,
        saleAmt,
        sold ? SYS_CASH : null,
      ]
    );
  }

  await client.query(
    `INSERT INTO payroll_tenant_config (tenant_id, earning_types, deduction_types, default_account_id, default_category_id, default_project_id, updated_at)
     VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       earning_types = EXCLUDED.earning_types,
       deduction_types = EXCLUDED.deduction_types,
       default_account_id = EXCLUDED.default_account_id,
       default_category_id = EXCLUDED.default_category_id,
       default_project_id = EXCLUDED.default_project_id,
       updated_at = NOW()`,
    [
      tenantId,
      JSON.stringify([
        { name: 'House Rent Allowance', amount: 40, is_percentage: true, type: 'Percentage' },
        { name: 'Site Allowance', amount: 15000, is_percentage: false, type: 'Fixed' },
      ]),
      JSON.stringify([
        { name: 'Provident Fund', amount: 12, is_percentage: true, type: 'Percentage' },
        { name: 'Professional Tax', amount: 200, is_percentage: false, type: 'Fixed' },
      ]),
      SYS_CASH,
      SYS_SAL_EXP,
      ids.projHorizon,
    ]
  );

  const payDepartments: Array<[string, string, string]> = [
    [ids.payDeptSite, 'Site Operations', 'SITE'],
    [ids.payDeptAdmin, 'Administration', 'ADM'],
    [ids.payDeptFinance, 'Finance', 'FIN'],
    [ids.payDeptSales, 'Sales & Marketing', 'SLS'],
  ];
  for (const [id, name, code] of payDepartments) {
    await client.query(
      `INSERT INTO payroll_departments (id, tenant_id, name, code, description, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, is_active = TRUE, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, name, code, `${name} — Al Noor Properties`, DEMO_DEFAULT_USER_ID]
    );
  }

  const payGrades: Array<[string, string, number, number]> = [
    [ids.payGrade1, 'G1 — Junior', 35000, 65000],
    [ids.payGrade2, 'G2 — Officer', 65000, 95000],
    [ids.payGrade3, 'G3 — Senior', 95000, 140000],
    [ids.payGrade4, 'G4 — Manager', 140000, 220000],
  ];
  for (const [id, name, minSal, maxSal] of payGrades) {
    await client.query(
      `INSERT INTO payroll_grades (id, tenant_id, name, description, min_salary, max_salary, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, min_salary = EXCLUDED.min_salary, max_salary = EXCLUDED.max_salary, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, name, name, minSal, maxSal, DEMO_DEFAULT_USER_ID]
    );
  }

  type PayEmpSeed = {
    id: string;
    name: string;
    code: string;
    designation: string;
    department: string;
    departmentId: string;
    grade: string;
    basic: number;
    netPay: number;
    projectId?: string;
  };
  const payEmployees: PayEmpSeed[] = [
    {
      id: ids.payEmpAhmad,
      name: 'Ahmad Raza',
      code: 'EMP-001',
      designation: 'Site Supervisor',
      department: 'Site Operations',
      departmentId: ids.payDeptSite,
      grade: 'G3 — Senior',
      basic: 95000,
      netPay: 108500,
      projectId: ids.projHorizon,
    },
    {
      id: ids.payEmpBilal,
      name: 'Bilal Hussain',
      code: 'EMP-002',
      designation: 'Accounts Officer',
      department: 'Finance',
      departmentId: ids.payDeptFinance,
      grade: 'G2 — Officer',
      basic: 78000,
      netPay: 86500,
    },
    {
      id: ids.payEmpCara,
      name: 'Cara Malik',
      code: 'EMP-003',
      designation: 'Sales Executive',
      department: 'Sales & Marketing',
      departmentId: ids.payDeptSales,
      grade: 'G2 — Officer',
      basic: 72000,
      netPay: 79800,
      projectId: ids.projRiverside,
    },
    {
      id: ids.payEmpDanish,
      name: 'Danish Ali',
      code: 'EMP-004',
      designation: 'Office Administrator',
      department: 'Administration',
      departmentId: ids.payDeptAdmin,
      grade: 'G1 — Junior',
      basic: 65000,
      netPay: 71200,
    },
  ];
  for (const emp of payEmployees) {
    const salary = {
      basic: emp.basic,
      allowances: [{ name: 'Site Allowance', amount: 15000, is_percentage: false }],
      deductions: [{ name: 'Provident Fund', amount: 12, is_percentage: true }],
    };
    const projects = emp.projectId
      ? [{ project_id: emp.projectId, allocation_percentage: 100 }]
      : [];
    await client.query(
      `INSERT INTO payroll_employees (id, tenant_id, name, employee_code, designation, department, department_id, grade, status, joining_date, salary, adjustments, projects, buildings, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, $10::jsonb, '[]'::jsonb, $11::jsonb, '[]'::jsonb, $12, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, designation = EXCLUDED.designation, department = EXCLUDED.department,
         department_id = EXCLUDED.department_id, grade = EXCLUDED.grade, salary = EXCLUDED.salary,
         projects = EXCLUDED.projects, updated_at = NOW(), deleted_at = NULL`,
      [
        emp.id,
        tenantId,
        emp.name,
        emp.code,
        emp.designation,
        emp.department,
        emp.departmentId,
        emp.grade,
        `${y - 2}-06-01`,
        JSON.stringify(salary),
        JSON.stringify(projects),
        DEMO_DEFAULT_USER_ID,
      ]
    );
  }

  const runMar = payrollPeriod(3);
  const runApr = payrollPeriod(2);
  const runMay = payrollPeriod(1);
  const runJun = payrollPeriod(0);
  const payRuns: Array<[string, string, number, string, string, string]> = [
    [ids.payRunMar, runMar.month, runMar.year, runMar.start, runMar.end, 'PAID'],
    [ids.payRunApr, runApr.month, runApr.year, runApr.start, runApr.end, 'PAID'],
    [ids.payRunMay, runMay.month, runMay.year, runMay.start, runMay.end, 'PAID'],
    [ids.payRunJun, runJun.month, runJun.year, runJun.start, runJun.end, 'APPROVED'],
  ];
  const totalNet = payEmployees.reduce((sum, e) => sum + e.netPay, 0);
  for (const [runId, month, year, periodStart, periodEnd, status] of payRuns) {
    const isPaid = status === 'PAID';
    await client.query(
      `INSERT INTO payroll_runs (id, tenant_id, month, year, period_start, period_end, status, total_amount, employee_count, created_by, paid_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, total_amount = EXCLUDED.total_amount, employee_count = EXCLUDED.employee_count, updated_at = NOW(), deleted_at = NULL`,
      [
        runId,
        tenantId,
        month,
        year,
        periodStart,
        periodEnd,
        status,
        isPaid ? totalNet : 0,
        payEmployees.length,
        DEMO_DEFAULT_USER_ID,
        isPaid ? `${periodEnd}T12:00:00Z` : null,
      ]
    );
  }

  const paidRunIds = [ids.payRunMar, ids.payRunApr, ids.payRunMay];
  for (const runId of paidRunIds) {
    const runMeta = payRuns.find(([id]) => id === runId);
    const payDate = runMeta?.[4] ?? monthStart(1);
    for (const emp of payEmployees) {
      const payslipId = `${runId}-${emp.id}`;
      await client.query(
        `INSERT INTO payslips (id, tenant_id, payroll_run_id, employee_id, basic_pay, total_allowances, total_deductions, total_adjustments, gross_pay, net_pay, is_paid, paid_amount, paid_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 15000, $6, 0, $7, $8, TRUE, $8, $9, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET net_pay = EXCLUDED.net_pay, is_paid = EXCLUDED.is_paid, paid_amount = EXCLUDED.paid_amount, updated_at = NOW(), deleted_at = NULL`,
        [
          payslipId,
          tenantId,
          runId,
          emp.id,
          emp.basic,
          Math.round(emp.basic * 0.12),
          emp.basic + 15000,
          emp.netPay,
          `${payDate}T14:00:00Z`,
        ]
      );
      await client.query(
        `INSERT INTO transactions (id, tenant_id, type, amount, date, description, account_id, category_id, project_id, payslip_id, version, created_at, updated_at)
         VALUES ($1, $2, 'Expense', $3, $4, $5, $6, $7, $8, $9, 1, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, description = EXCLUDED.description, date = EXCLUDED.date, payslip_id = EXCLUDED.payslip_id, updated_at = NOW(), deleted_at = NULL`,
        [
          `${payslipId}-pay`,
          tenantId,
          emp.netPay,
          payDate,
          `Salary paid — ${emp.name}`,
          SYS_CASH,
          SYS_SAL_EXP,
          emp.projectId ?? null,
          payslipId,
        ]
      );
    }
  }

  for (const emp of payEmployees) {
    const payslipId = `${ids.payRunJun}-${emp.id}`;
    await client.query(
      `INSERT INTO payslips (id, tenant_id, payroll_run_id, employee_id, basic_pay, total_allowances, total_deductions, total_adjustments, gross_pay, net_pay, is_paid, paid_amount, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 15000, $6, 0, $7, $8, FALSE, 0, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET net_pay = EXCLUDED.net_pay, updated_at = NOW(), deleted_at = NULL`,
      [
        payslipId,
        tenantId,
        ids.payRunJun,
        emp.id,
        emp.basic,
        Math.round(emp.basic * 0.12),
        emp.basic + 15000,
        emp.netPay,
      ]
    );
  }

  await syncPayrollLedgerForAllEmployees(client, tenantId);

  await postSeedJournalMirrors(client, tenantId);
}

/** Rebuild tenant from version-controlled template (master source = this module). */
export async function resetDemoTenantFromTemplate(
  client: pg.PoolClient,
  tenantId: string
): Promise<void> {
  await wipeTenantBusinessData(client, tenantId);
  await seedDemoBusinessData(client, tenantId);
}

export async function ensureDemoMasterSeeded(client: pg.PoolClient): Promise<void> {
  await wipeTenantBusinessData(client, DEMO_MASTER_TENANT_ID);
  await seedDemoBusinessData(client, DEMO_MASTER_TENANT_ID);
}
