import type pg from 'pg';
import { bootstrapTenantChart } from '../tenantBootstrap.js';
import { startTrialSubscription } from '../billing/subscriptionService.js';
import {
  DEMO_MASTER_TENANT_ID,
  DEMO_PUBLIC_TENANT_ID,
} from '../../constants/demoEnvironment.js';

/** Tables wiped before re-seed (children before parents). */
const WIPE_TABLES = [
  'journal_lines',
  'journal_reversals',
  'journal_entries',
  'transaction_log',
  'transactions',
  'invoices',
  'bills',
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
  prop201: string;
  prop202: string;
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
  inv001: string;
  inv002: string;
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
    prop201: `${p}-prop-201`,
    prop202: `${p}-prop-202`,
    projHorizon: `${p}-proj-horizon`,
    projRiverside: `${p}-proj-riverside`,
    unitH1: `${p}-unit-h1`,
    unitH2: `${p}-unit-h2`,
    unitR1: `${p}-unit-r1`,
    vendorSteel: `${p}-vendor-steel`,
    vendorCement: `${p}-vendor-cement`,
    vendorElectric: `${p}-vendor-electric`,
    agr101: `${p}-agr-101`,
    agr102: `${p}-agr-102`,
    inv001: `${p}-inv-001`,
    inv002: `${p}-inv-002`,
  };
}

export async function wipeTenantBusinessData(
  client: pg.PoolClient,
  tenantId: string
): Promise<void> {
  for (const table of WIPE_TABLES) {
    try {
      await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
    } catch {
      /* table may not exist on older schemas */
    }
  }
}

export async function seedDemoBusinessData(
  client: pg.PoolClient,
  tenantId: string
): Promise<void> {
  await bootstrapTenantChart(client, tenantId, { legacyIds: false });

  try {
    await startTrialSubscription(client, tenantId);
  } catch {
    /* trial plan optional in dev */
  }

  const ids = idsForTenant(tenantId);
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');

  const contacts: Array<[string, string, string]> = [
    [ids.ownerAli, 'Ali Khan', 'Owner'],
    [ids.ownerSara, 'Sara Malik', 'Owner'],
    [ids.tenantAhmed, 'Ahmed Raza', 'Tenant'],
    [ids.tenantFatima, 'Fatima Noor', 'Tenant'],
    [ids.tenantHassan, 'Hassan Qureshi', 'Tenant'],
  ];

  for (const [id, name, type] of contacts) {
    await client.query(
      `INSERT INTO contacts (id, tenant_id, name, type, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 1, NOW(), NOW())
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
      `INSERT INTO buildings (id, tenant_id, name, color, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, name, color]
    );
  }

  const properties: Array<[string, string, string, string, number]> = [
    [ids.prop101, 'Unit 101 — Skyline', ids.ownerAli, ids.bldSkyline, 4500],
    [ids.prop102, 'Unit 102 — Skyline', ids.ownerAli, ids.bldSkyline, 4200],
    [ids.prop201, 'Unit 201 — Harbor', ids.ownerSara, ids.bldHarbor, 5500],
    [ids.prop202, 'Unit 202 — Harbor', ids.ownerSara, ids.bldHarbor, 5200],
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

  const issueDate = `${y}-${m}-01`;
  const dueDate = `${y}-${m}-10`;

  await client.query(
    `INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type, property_id, agreement_id, rental_month, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 75000, 75000, 'paid', $5, $6, 'rental', $7, $8, $9, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, updated_at = NOW()`,
    [ids.inv001, tenantId, 'INV-RENT-001', ids.tenantAhmed, issueDate, dueDate, ids.prop101, ids.agr101, `${y}-${m}`]
  );

  await client.query(
    `INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type, property_id, agreement_id, rental_month, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 95000, 45000, 'partial', $5, $6, 'rental', $7, $8, $9, 1, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, updated_at = NOW()`,
    [ids.inv002, tenantId, 'INV-RENT-002', ids.tenantFatima, issueDate, dueDate, ids.prop201, ids.agr102, `${y}-${m}`]
  );

  const txRows: Array<[string, string, number, string, string | null, string | null, string | null, string | null]> = [
    [`${ids.inv001}-pay`, 'Income', 75000, issueDate, 'Rent received — Unit 101', ids.prop101, ids.tenantAhmed, ids.inv001],
    [`${ids.inv002}-pay`, 'Income', 45000, issueDate, 'Partial rent — Unit 201', ids.prop201, ids.tenantFatima, ids.inv002],
    [`${tenantId}-tx-exp-1`, 'Expense', 185000, issueDate, 'Steel procurement — Horizon project', null, null, null],
    [`${tenantId}-tx-exp-2`, 'Expense', 92000, issueDate, 'Cement delivery — Horizon project', null, null, null],
    [`${tenantId}-tx-exp-3`, 'Expense', 34000, issueDate, 'Electrical fittings — Riverside', null, null, null],
    [`${tenantId}-tx-inc-1`, 'Income', 2500000, `${y}-${m}-15`, 'Unit A-101 booking installment', null, null, null],
  ];

  for (const [id, type, amount, date, desc, propertyId, contactId, invoiceId] of txRows) {
    await client.query(
      `INSERT INTO transactions (id, tenant_id, type, amount, date, description, account_id, category_id, property_id, contact_id, invoice_id, project_id, vendor_id, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, description = EXCLUDED.description, updated_at = NOW(), deleted_at = NULL`,
      [
        id,
        tenantId,
        type,
        amount,
        date,
        desc,
        SYS_CASH,
        type === 'Income' ? SYS_RENT : null,
        propertyId,
        contactId,
        invoiceId,
        id.includes('exp') || id.includes('inc-1') ? ids.projHorizon : null,
        id === `${tenantId}-tx-exp-1` ? ids.vendorSteel : id === `${tenantId}-tx-exp-2` ? ids.vendorCement : id === `${tenantId}-tx-exp-3` ? ids.vendorElectric : null,
      ]
    );
  }
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
