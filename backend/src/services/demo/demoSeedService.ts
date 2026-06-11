import type pg from 'pg';
import { withSavepoint } from '../../db/pool.js';
import { bootstrapTenantChart } from '../tenantBootstrap.js';
import { startTrialSubscription } from '../billing/subscriptionService.js';
import {
  DEMO_MASTER_TENANT_ID,
  DEMO_PUBLIC_TENANT_ID,
} from '../../constants/demoEnvironment.js';
import { backfillBillJournalMirrorsForTenant } from '../billJournalBackfillService.js';
import { backfillInvoiceJournalMirrorsForTenant } from '../invoiceJournalBackfillService.js';
import { backfillTransactionJournalMirrorsForTenant } from '../transactionJournalBackfillService.js';
import { logger } from '../../utils/logger.js';

/** Tables wiped before re-seed (children before parents). */
const WIPE_TABLES = [
  'journal_lines',
  'journal_reversals',
  'journal_entries',
  'transaction_log',
  'transactions',
  'invoices',
  'project_agreement_units',
  'project_agreements',
  'bills',
  'budgets',
  'contracts',
  'rental_agreements',
  'properties',
  'units',
  'projects',
  'buildings',
  'vendors',
  'contacts',
] as const;

const SYS_CASH = 'sys-acc-cash';
const SYS_RENT = 'sys-cat-rent-inc';
const SYS_UNIT_SELL = 'sys-cat-unit-sell';
const SYS_PM_COST = 'sys-cat-pm-cost';
const SYS_BLD_MAINT = 'sys-cat-bld-maint';
const SYS_BROK_FEE = 'sys-cat-brok-fee';

export type DemoSeedIds = {
  ownerAli: string;
  ownerSara: string;
  tenantAhmed: string;
  tenantFatima: string;
  tenantHassan: string;
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
  agr101: string;
  agr102: string;
  agr103: string;
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
  catMaterials: string;
  catCement: string;
  catElectrical: string;
  catLabor: string;
  budMaterials: string;
  budCement: string;
  budElectrical: string;
  budLabor: string;
};

function idsForTenant(tenantId: string): DemoSeedIds {
  const p = tenantId === DEMO_MASTER_TENANT_ID ? 'dm' : 'demo';
  return {
    ownerAli: `${p}-owner-ali`,
    ownerSara: `${p}-owner-sara`,
    tenantAhmed: `${p}-tenant-ahmed`,
    tenantFatima: `${p}-tenant-fatima`,
    tenantHassan: `${p}-tenant-hassan`,
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
    agr101: `${p}-agr-101`,
    agr102: `${p}-agr-201`,
    agr103: `${p}-agr-102`,
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
    catMaterials: `${p}-cat-materials`,
    catCement: `${p}-cat-cement`,
    catElectrical: `${p}-cat-electrical`,
    catLabor: `${p}-cat-labor`,
    budMaterials: `${p}-bud-materials`,
    budCement: `${p}-bud-cement`,
    budElectrical: `${p}-bud-electrical`,
    budLabor: `${p}-bud-labor`,
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

const JOURNAL_IMMUTABILITY_TRIGGERS = [
  'journal_lines_immutable_del',
  'journal_lines_immutable_upd',
  'journal_entries_immutable_del',
  'journal_entries_immutable_upd',
] as const;

async function setJournalImmutabilityTriggers(
  client: pg.PoolClient,
  enabled: boolean
): Promise<void> {
  const verb = enabled ? 'ENABLE' : 'DISABLE';
  for (const trigger of JOURNAL_IMMUTABILITY_TRIGGERS) {
    const table = trigger.startsWith('journal_lines') ? 'journal_lines' : 'journal_entries';
    await client.query(`ALTER TABLE ${table} ${verb} TRIGGER ${trigger}`);
  }
}

async function deleteTenantJournalRows(client: pg.PoolClient, tenantId: string): Promise<void> {
  await client.query(`DELETE FROM journal_reversals WHERE tenant_id = $1`, [tenantId]);
  await client.query(
    `DELETE FROM journal_lines
     WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE tenant_id = $1)`,
    [tenantId]
  );
  await client.query(`DELETE FROM journal_entries WHERE tenant_id = $1`, [tenantId]);
}

/** Managed Postgres (Render) cannot set session_replication_role — disable immutability triggers instead. */
async function purgeTenantJournal(client: pg.PoolClient, tenantId: string): Promise<void> {
  const purgeWithReplicaRole = () =>
    withSavepoint(client, 'demo_journal_purge_replica', async (c) => {
      await c.query(`SET session_replication_role = replica`);
      try {
        await deleteTenantJournalRows(c, tenantId);
      } finally {
        await c.query(`SET session_replication_role = DEFAULT`);
      }
    });

  const purgeWithTriggersDisabled = () =>
    withSavepoint(client, 'demo_journal_purge_triggers', async (c) => {
      await setJournalImmutabilityTriggers(c, false);
      try {
        await deleteTenantJournalRows(c, tenantId);
      } finally {
        await setJournalImmutabilityTriggers(c, true);
      }
    });

  try {
    await purgeWithReplicaRole();
  } catch (replicaErr) {
    try {
      await purgeWithTriggersDisabled();
    } catch (triggerErr) {
      logger.warn('Demo journal purge skipped (stale GL rows may remain until next successful reset)', {
        tenantId,
        replicaErr: replicaErr instanceof Error ? replicaErr.message : String(replicaErr),
        triggerErr: triggerErr instanceof Error ? triggerErr.message : String(triggerErr),
      });
    }
  }
}

export async function wipeTenantBusinessData(
  client: pg.PoolClient,
  tenantId: string
): Promise<void> {
  await purgeTenantJournal(client, tenantId);

  const tablesAfterJournal = WIPE_TABLES.filter(
    (t) => t !== 'journal_lines' && t !== 'journal_reversals' && t !== 'journal_entries'
  );

  for (const table of tablesAfterJournal) {
    try {
      await withSavepoint(client, `wipe_${table}`, async (c) => {
        await c.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
      });
    } catch {
      /* table may not exist on older schemas */
    }
  }

  const idPrefix = tenantId === DEMO_MASTER_TENANT_ID ? 'dm' : 'demo';
  try {
    await withSavepoint(client, 'wipe_demo_accounts', async (c) => {
      await c.query(`DELETE FROM accounts WHERE tenant_id = $1 AND id LIKE $2`, [
        tenantId,
        `${idPrefix}-acc-%`,
      ]);
    });
  } catch {
    /* optional */
  }

  try {
    await withSavepoint(client, 'wipe_demo_categories', async (c) => {
      await c.query(`DELETE FROM categories WHERE tenant_id = $1 AND is_permanent = FALSE`, [
        tenantId,
      ]);
    });
  } catch {
    /* optional */
  }
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

  if (tenantId !== DEMO_PUBLIC_TENANT_ID) {
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
  const prefix = tenantId === DEMO_MASTER_TENANT_ID ? 'dm' : 'demo';

  await client.query(
    `UPDATE tenants SET company_name = $2, name = $2, updated_at = NOW() WHERE id = $1`,
    [tenantId, 'Al Noor Properties']
  );

  const contacts: Array<[string, string, string]> = [
    [ids.ownerAli, 'Ali Khan', 'Owner'],
    [ids.ownerSara, 'Sara Malik', 'Owner'],
    [ids.tenantAhmed, 'Ahmed Raza', 'Tenant'],
    [ids.tenantFatima, 'Fatima Noor', 'Tenant'],
    [ids.tenantHassan, 'Hassan Qureshi', 'Tenant'],
    [ids.buyerImran, 'Imran Shah', 'Client'],
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
    [ids.accOperating, 'Main Operating Account', 'BANK', 2450000],
    [ids.accEscrow, 'Project Escrow Account', 'BANK', 850000],
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
