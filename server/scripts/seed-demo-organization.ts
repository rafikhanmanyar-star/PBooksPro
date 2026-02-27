#!/usr/bin/env node
/**
 * Seed Demo Organization
 *
 * Generates ~20 records per area for tenant "Demo@pbookspro.com"
 * (tenant_1772214936191_179a9196) for demo purposes.
 *
 * Usage:
 *   Staging/local: npm run seed-demo   (uses server/.env)
 *   Production:    npm run seed-demo:production   (uses server/.env.production, requires SEED_DEMO_PRODUCTION=1)
 *
 * Requires: DATABASE_URL in server/.env or server/.env.production
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env: production script loads .env.production first, then .env
const isProductionSeed = process.env.SEED_DEMO_PRODUCTION === '1' || process.env.npm_lifecycle_event === 'seed-demo:production';
if (isProductionSeed) {
  dotenv.config({ path: resolve(__dirname, '../.env.production') });
}
dotenv.config({ path: resolve(__dirname, '../.env') });

const DEMO_TENANT_ID = 'tenant_1772214936191_179a9196';

// Detect if DATABASE_URL looks like production (Render production, not staging)
function isProductionDatabaseUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('render.com') && !url.includes('staging') && !url.includes('localhost');
}

// Pakistani names
const FIRST_NAMES = [
  'Muhammad', 'Ali', 'Hassan', 'Ahmed', 'Usman', 'Bilal', 'Hamza', 'Omar', 'Zain', 'Ibrahim',
  'Fatima', 'Ayesha', 'Sana', 'Maryam', 'Zainab', 'Hira', 'Amina', 'Sara', 'Aisha', 'Khadija',
  'Rashid', 'Khalid', 'Imran', 'Asad', 'Faisal', 'Tariq', 'Nadeem', 'Waqas', 'Saad', 'Farhan'
];
const LAST_NAMES = [
  'Khan', 'Ahmed', 'Ali', 'Hussain', 'Malik', 'Sheikh', 'Chaudhry', 'Butt', 'Raza', 'Iqbal',
  'Mirza', 'Abbas', 'Hashmi', 'Qureshi', 'Shah', 'Baig', 'Ansari', 'Siddiqui', 'Rashid', 'Akhtar'
];
const COMPANY_NAMES = [
  'Lahore Builders Pvt Ltd', 'Karachi Construction Co', 'Islamabad Materials', 'Faisalabad Steel Works',
  'Rawalpindi Traders', 'Peshawar Cement Co', 'Multan Hardware', 'Quetta Supplies', 'Sialkot Tools',
  'Gujranwala Electricals', 'Premium Builders', 'Elite Contractors', 'Star Construction'
];

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function addDays(str: string, days: number): string {
  const d = new Date(str);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function addMonths(str: string, months: number): string {
  const d = new Date(str);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set. Set it in server/.env or server/.env.production');
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (isProductionDatabaseUrl(dbUrl)) {
    const allowed = process.env.SEED_DEMO_PRODUCTION === '1' || process.env.npm_lifecycle_event === 'seed-demo:production';
    if (!allowed) {
      console.error('Refusing to seed production database without explicit confirmation.');
      console.error('Set SEED_DEMO_PRODUCTION=1 and run again, or use: npm run seed-demo:production');
      process.exit(1);
    }
    console.log('Running against PRODUCTION database.');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('render.com') ? { rejectUnauthorized: false } : false,
  });

  const tenantId = DEMO_TENANT_ID;

  try {
    const r = await pool.query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
    if (r.rows.length === 0) {
      console.error(`Tenant ${tenantId} not found. Create the organization "Demo@pbookspro.com" first.`);
      process.exit(1);
    }
    const userRow = await pool.query('SELECT id FROM users WHERE tenant_id = $1 AND is_active = true LIMIT 1', [tenantId]);
    const demoUserId = userRow.rows[0]?.id ?? null;
    console.log('Seeding demo organization:', tenantId);

    const ids = {
      accounts: [] as string[],
      categories: [] as string[],
      contacts: [] as string[],
      vendors: [] as string[],
      projects: [] as string[],
      buildings: [] as string[],
      properties: [] as string[],
      units: [] as string[],
      rentalAgreements: [] as string[],
      projectAgreements: [] as string[],
      invoices: [] as string[],
      bills: [] as string[],
      contracts: [] as string[],
    };

    // 1) Accounts (tenant-scoped) — use deterministic ids so re-run doesn't duplicate
    const accountRows = [
      { id: `demo_acc_${tenantId.replace(/-/g, '_')}_cash`, name: 'Cash', type: 'Bank' },
      { id: `demo_acc_${tenantId.replace(/-/g, '_')}_bank`, name: 'Main Bank', type: 'Bank' },
      { id: `demo_acc_${tenantId.replace(/-/g, '_')}_ar`, name: 'Accounts Receivable', type: 'Asset' },
      { id: `demo_acc_${tenantId.replace(/-/g, '_')}_ap`, name: 'Accounts Payable', type: 'Liability' },
      { id: `demo_acc_${tenantId.replace(/-/g, '_')}_equity`, name: 'Owner Equity', type: 'Equity' },
    ];
    for (const a of accountRows) {
      ids.accounts.push(a.id);
      await pool.query(
        `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 0, true, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [a.id, tenantId, a.name, a.type]
      );
    }
    console.log('Accounts:', accountRows.length);

    // 2) Categories (tenant-scoped) — deterministic ids for re-run safety
    const catRows = [
      { id: `demo_cat_${tenantId.replace(/-/g, '_')}_rent`, name: 'Rental Income', type: 'Income' },
      { id: `demo_cat_${tenantId.replace(/-/g, '_')}_svc`, name: 'Service Charge Income', type: 'Income' },
      { id: `demo_cat_${tenantId.replace(/-/g, '_')}_sell`, name: 'Unit Selling Income', type: 'Income' },
      { id: `demo_cat_${tenantId.replace(/-/g, '_')}_maint`, name: 'Building Maintenance', type: 'Expense' },
      { id: `demo_cat_${tenantId.replace(/-/g, '_')}_sal`, name: 'Project Staff Salary', type: 'Expense' },
      { id: `demo_cat_${tenantId.replace(/-/g, '_')}_mat`, name: 'Construction Materials', type: 'Expense' },
      { id: `demo_cat_${tenantId.replace(/-/g, '_')}_broker`, name: 'Broker Fee', type: 'Expense' },
    ];
    for (const c of catRows) {
      ids.categories.push(c.id);
      await pool.query(
        `INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, false, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [c.id, tenantId, c.name, c.type]
      );
    }
    console.log('Categories:', catRows.length);

    // 3) Contacts (~25, Pakistani names)
    const contactTypes = ['Owner', 'Tenant', 'Tenant', 'Tenant', 'Broker', 'Client', 'Lead', 'Staff', 'Vendor'];
    for (let i = 0; i < 25; i++) {
      const cid = id('con');
      ids.contacts.push(cid);
      const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      const type = contactTypes[i % contactTypes.length];
      await pool.query(
        `INSERT INTO contacts (id, tenant_id, name, type, contact_no, address, company_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          cid,
          tenantId,
          name,
          type,
          `+92-300-${1000000 + Math.floor(Math.random() * 8999999)}`,
          `${Math.floor(Math.random() * 99) + 1} Block ${pick(['A', 'B', 'C'])} ${pick(['Lahore', 'Karachi', 'Islamabad'])}`,
          type === 'Vendor' || type === 'Broker' ? pick(COMPANY_NAMES) : null,
        ]
      );
    }
    console.log('Contacts: 25');

    // 4) Vendors (~15)
    for (let i = 0; i < 15; i++) {
      const vid = id('ven');
      ids.vendors.push(vid);
      const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      await pool.query(
        `INSERT INTO vendors (id, tenant_id, name, contact_no, company_name, address, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          vid,
          tenantId,
          name,
          `+92-321-${1000000 + Math.floor(Math.random() * 8999999)}`,
          pick(COMPANY_NAMES),
          `${Math.floor(Math.random() * 50) + 1} Industrial Area`,
        ]
      );
    }
    console.log('Vendors: 15');

    // 5) Projects & Buildings
    const projectNames = ['Luxury Residency Phase 1', 'Green Valley Apartments', 'Elite Heights', 'Royal Plaza'];
    for (let i = 0; i < 4; i++) {
      const pid = id('proj');
      ids.projects.push(pid);
      await pool.query(
        `INSERT INTO projects (id, tenant_id, name, description, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'Active', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [pid, tenantId, projectNames[i], `Demo project ${i + 1}`]
      );
    }
    const buildingNames = ['Tower A', 'Tower B', 'Block C'];
    for (let i = 0; i < 3; i++) {
      const bid = id('bld');
      ids.buildings.push(bid);
      await pool.query(
        `INSERT INTO buildings (id, tenant_id, name, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [bid, tenantId, buildingNames[i]]
      );
    }
    console.log('Projects: 4, Buildings: 3');

    // 6) Properties (need owners = contacts, building)
    const owners = ids.contacts.slice(0, 12);
    for (let i = 0; i < 20; i++) {
      const pid = id('prop');
      ids.properties.push(pid);
      const buildingId = ids.buildings[i % ids.buildings.length];
      await pool.query(
        `INSERT INTO properties (id, tenant_id, name, owner_id, building_id, monthly_service_charge, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          pid,
          tenantId,
          `Unit ${i + 101}`,
          owners[i % owners.length],
          buildingId,
          Math.round((5000 + Math.random() * 15000) / 100) * 100,
        ]
      );
    }
    console.log('Properties: 20');

    // 7) Units (project-scoped, some with contact = buyer)
    for (let i = 0; i < 22; i++) {
      const uid = id('unit');
      ids.units.push(uid);
      const projectId = ids.projects[i % ids.projects.length];
      const contactId = i < 8 ? ids.contacts[5 + (i % 5)] : null;
      await pool.query(
        `INSERT INTO units (id, tenant_id, name, project_id, contact_id, sale_price, type, area, floor, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          uid,
          tenantId,
          `Unit-${i + 1}`,
          projectId,
          contactId,
          Math.round((2000000 + Math.random() * 8000000) / 1000) * 1000,
          pick(['Apartment', 'Penthouse', 'Studio']),
          800 + Math.floor(Math.random() * 1200),
          `${(i % 10) + 1}`,
        ]
      );
    }
    console.log('Units: 22');

    // 8) Rental agreements (~20): some Active, some Expired, some Terminated → mix rented/vacant
    const tenants = ids.contacts.filter((_, i) => (i % contactTypes.length) === 1 || (i % contactTypes.length) === 2);
    const statuses: Array<'Active' | 'Expired' | 'Terminated'> = ['Active', 'Active', 'Active', 'Expired', 'Terminated'];
    for (let i = 0; i < 20; i++) {
      const rid = id('ra');
      ids.rentalAgreements.push(rid);
      const start = daysAgo(180 + i * 30);
      const end = addMonths(start, 12);
      const status = pick(statuses);
      await pool.query(
        `INSERT INTO rental_agreements (id, org_id, agreement_number, contact_id, property_id, start_date, end_date, monthly_rent, rent_due_date, status, security_deposit, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 5, $9, $10, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          rid,
          tenantId,
          `RA-${String(1000 + i).padStart(4, '0')}`,
          tenants[i % tenants.length],
          ids.properties[i],
          start,
          end,
          Math.round((25000 + Math.random() * 75000) / 1000) * 1000,
          status,
          Math.round((50000 + Math.random() * 100000) / 1000) * 1000,
        ]
      );
    }
    console.log('Rental agreements: 20 (mix Active/Expired/Terminated)');

    // 9) Project agreements (~20)
    for (let i = 0; i < 20; i++) {
      const paid = id('pa');
      ids.projectAgreements.push(paid);
      const listPrice = 5000000 + Math.random() * 5000000;
      const sellingPrice = listPrice * (0.9 + Math.random() * 0.08);
      await pool.query(
        `INSERT INTO project_agreements (id, tenant_id, agreement_number, client_id, project_id, list_price, selling_price, issue_date, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          paid,
          tenantId,
          `PA-${String(2000 + i).padStart(4, '0')}`,
          ids.contacts[6 + (i % 10)],
          ids.projects[i % ids.projects.length],
          Math.round(listPrice),
          Math.round(sellingPrice),
          daysAgo(90 + i * 10),
          pick(['Active', 'Active', 'Completed', 'Cancelled']),
        ]
      );
    }
    console.log('Project agreements: 20');

    // 10) Invoices (~20): Paid, Partially Paid, Unpaid
    const invStatuses: Array<'Paid' | 'Partially Paid' | 'Unpaid'> = ['Paid', 'Paid', 'Partially Paid', 'Unpaid'];
    for (let i = 0; i < 20; i++) {
      const iid = id('inv');
      ids.invoices.push(iid);
      const status = pick(invStatuses);
      const amount = Math.round((15000 + Math.random() * 60000) / 100) * 100;
      const paidAmount =
        status === 'Paid' ? amount : status === 'Partially Paid' ? Math.round(amount * (0.3 + Math.random() * 0.5)) : 0;
      const isRental = i < 12;
      const contactId = isRental ? tenants[i % tenants.length] : ids.contacts[6 + (i % 8)];
      await pool.query(
        `INSERT INTO invoices (id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date, invoice_type, property_id, building_id, category_id, agreement_id, rental_month, project_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          iid,
          tenantId,
          `INV-${String(5000 + i).padStart(5, '0')}`,
          contactId,
          amount,
          paidAmount,
          status,
          daysAgo(30 + i * 5),
          addDays(daysAgo(30 + i * 5), 15),
          isRental ? 'Rental' : 'Installment',
          isRental ? ids.properties[i % ids.properties.length] : null,
          isRental ? ids.buildings[Math.floor(i / 7)] : null,
          ids.categories[isRental ? 0 : 2],
          isRental && i < ids.rentalAgreements.length ? ids.rentalAgreements[i] : null,
          isRental ? daysAgo(30 + i * 5).slice(0, 7) : null,
          !isRental ? ids.projects[i % ids.projects.length] : null,
        ]
      );
    }
    console.log('Invoices: 20 (Paid / Partially Paid / Unpaid)');

    // 11) Bills (~20): Paid, Partially Paid, Unpaid
    for (let i = 0; i < 20; i++) {
      const bid = id('bill');
      ids.bills.push(bid);
      const status = pick(invStatuses);
      const amount = Math.round((10000 + Math.random() * 90000) / 100) * 100;
      const paidAmount =
        status === 'Paid' ? amount : status === 'Partially Paid' ? Math.round(amount * (0.2 + Math.random() * 0.5)) : 0;
      await pool.query(
        `INSERT INTO bills (id, tenant_id, bill_number, vendor_id, amount, paid_amount, status, issue_date, due_date, category_id, project_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          bid,
          tenantId,
          `BILL-${String(3000 + i).padStart(5, '0')}`,
          ids.vendors[i % ids.vendors.length],
          amount,
          paidAmount,
          status,
          daysAgo(25 + i * 4),
          addDays(daysAgo(25 + i * 4), 30),
          ids.categories[3 + (i % 4)],
          ids.projects[i % ids.projects.length],
        ]
      );
    }
    console.log('Bills: 20 (Paid / Partially Paid / Unpaid)');

    // 12) Contracts (~15)
    for (let i = 0; i < 15; i++) {
      const cid = id('contract');
      ids.contracts.push(cid);
      const amount = Math.round((200000 + Math.random() * 800000) / 1000) * 1000;
      await pool.query(
        `INSERT INTO contracts (id, tenant_id, contract_number, name, project_id, vendor_id, total_amount, start_date, end_date, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          cid,
          tenantId,
          `CON-${String(100 + i).padStart(4, '0')}`,
          `Contract ${i + 1} - ${pick(COMPANY_NAMES)}`,
          ids.projects[i % ids.projects.length],
          ids.vendors[i % ids.vendors.length],
          amount,
          daysAgo(120 + i * 10),
          addDays(daysAgo(120 + i * 10), 180),
          pick(['Active', 'Active', 'Completed', 'Terminated']),
        ]
      );
    }
    console.log('Contracts: 15');

    const cashAccount = ids.accounts[0];
    const bankAccount = ids.accounts[1];
    const arCategory = ids.categories[0];
    const expCategory = ids.categories[3];

    // 13) Transactions: ~20 Income, ~20 Expense, ~15 Transfer, ~20 Loan
    for (let i = 0; i < 20; i++) {
      const txId = id('tx');
      const amt = Math.round((5000 + Math.random() * 45000) / 100) * 100;
      await pool.query(
        `INSERT INTO transactions (id, tenant_id, type, amount, date, description, account_id, category_id, contact_id, project_id, created_at, updated_at)
         VALUES ($1, $2, 'Income', $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        [
          txId,
          tenantId,
          amt,
          daysAgo(i * 3),
          `Rental/installment income ${i + 1}`,
          bankAccount,
          arCategory,
          ids.contacts[(i % 10) + 5],
          i % 2 === 0 ? ids.projects[i % ids.projects.length] : null,
        ]
      );
    }
    for (let i = 0; i < 20; i++) {
      const txId = id('tx');
      const amt = Math.round((3000 + Math.random() * 27000) / 100) * 100;
      await pool.query(
        `INSERT INTO transactions (id, tenant_id, type, amount, date, description, account_id, category_id, vendor_id, project_id, created_at, updated_at)
         VALUES ($1, $2, 'Expense', $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        [
          txId,
          tenantId,
          amt,
          daysAgo(i * 4),
          `Expense ${i + 1}`,
          cashAccount,
          expCategory,
          ids.vendors[i % ids.vendors.length],
          ids.projects[i % ids.projects.length],
        ]
      );
    }
    for (let i = 0; i < 15; i++) {
      const txId = id('tx');
      const amt = Math.round((10000 + Math.random() * 40000) / 100) * 100;
      await pool.query(
        `INSERT INTO transactions (id, tenant_id, type, amount, date, description, account_id, from_account_id, to_account_id, created_at, updated_at)
         VALUES ($1, $2, 'Transfer', $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [txId, tenantId, amt, daysAgo(i * 5), `Transfer ${i + 1}`, bankAccount, bankAccount, cashAccount]
      );
    }
    const loanSubtypes = ['Give Loan', 'Receive Loan', 'Repay Loan', 'Collect Loan'];
    for (let i = 0; i < 20; i++) {
      const txId = id('tx');
      const amt = Math.round((15000 + Math.random() * 85000) / 1000) * 1000;
      const subtype = pick(loanSubtypes);
      await pool.query(
        `INSERT INTO transactions (id, tenant_id, type, subtype, amount, date, description, account_id, contact_id, created_at, updated_at)
         VALUES ($1, $2, 'Loan', $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [
          txId,
          tenantId,
          subtype,
          amt,
          daysAgo(i * 6),
          `Loan ${subtype} ${i + 1}`,
          bankAccount,
          ids.contacts[i % ids.contacts.length],
        ]
      );
    }
    console.log('Transactions: 20 Income, 20 Expense, 15 Transfer, 20 Loan');

    // 14) PM cycle allocations (if table exists) — unique (tenant_id, project_id, cycle_id)
    try {
      for (let i = 0; i < 18; i++) {
        const cycleId = `cycle-${i + 1}`;
        const projectId = ids.projects[i % ids.projects.length];
        const amount = Math.round((50000 + Math.random() * 150000) / 1000) * 1000;
        const paidAmount = i % 3 === 0 ? amount : i % 3 === 1 ? Math.round(amount * 0.5) : 0;
        const status = paidAmount >= amount ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid';
        await pool.query(
          `INSERT INTO pm_cycle_allocations (id, tenant_id, project_id, cycle_id, cycle_label, frequency, start_date, end_date, allocation_date, amount, paid_amount, status, fee_rate, expense_total, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'Monthly', $6, $7, $8, $9, $10, $11, 2.5, $12, NOW(), NOW())
           ON CONFLICT (tenant_id, project_id, cycle_id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, updated_at = NOW()`,
          [
            id('pmc'),
            tenantId,
            projectId,
            cycleId,
            `Cycle ${i + 1}`,
            daysAgo(60 + i * 30),
            addDays(daysAgo(60 + i * 30), 30),
            daysAgo(60 + i * 30),
            amount,
            paidAmount,
            status,
            amount * 0.6,
          ]
        );
      }
      console.log('PM cycle allocations: 18');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('does not exist')) console.warn('PM cycle allocations skip:', msg);
    }

    // 15) Tasks (if table exists) — created_by_id must be user id or null if column nullable
    try {
      const taskStatuses = ['Not Started', 'In Progress', 'Review', 'Completed'];
      for (let i = 0; i < 20; i++) {
        const tid = id('task');
        await pool.query(
          `INSERT INTO tasks (id, tenant_id, title, description, type, category, status, start_date, hard_deadline, kpi_goal, kpi_target_value, kpi_current_value, kpi_progress_percentage, created_by_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'Personal', 'General', $5, $6, $7, $8, 100, $9, $10, $11, NOW(), NOW())`,
          [
            tid,
            tenantId,
            `Demo task ${i + 1}`,
            `Description for task ${i + 1}`,
            pick(taskStatuses),
            daysAgo(20 - i),
            addDays(daysAgo(20 - i), 14),
            `Target ${i + 1}`,
            Math.floor(Math.random() * 100),
            Math.min(100, Math.floor(Math.random() * 120)),
            demoUserId,
          ]
        );
      }
      console.log('Tasks: 20');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('does not exist')) console.warn('Tasks skip:', msg);
    }

    // 16) Quotations (~15)
    for (let i = 0; i < 15; i++) {
      const qid = id('quot');
      const total = Math.round((50000 + Math.random() * 200000) / 1000) * 1000;
      await pool.query(
        `INSERT INTO quotations (id, tenant_id, vendor_id, name, date, items, total_amount, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          qid,
          tenantId,
          ids.vendors[i % ids.vendors.length],
          `Quotation ${i + 1}`,
          daysAgo(45 + i),
          JSON.stringify([{ description: 'Item 1', quantity: 1, rate: total, amount: total }]),
          total,
        ]
      );
    }
    console.log('Quotations: 15');

    // 17) Link some transactions to invoices (payment entries for paid/partial invoices)
    for (let i = 0; i < Math.min(10, ids.invoices.length); i++) {
      const inv = ids.invoices[i];
      const row = await pool.query(
        'SELECT amount, paid_amount, contact_id FROM invoices WHERE id = $1 AND tenant_id = $2',
        [inv, tenantId]
      );
      if (row.rows[0]?.paid_amount > 0) {
        const txId = id('tx');
        await pool.query(
          `INSERT INTO transactions (id, tenant_id, type, amount, date, description, account_id, category_id, contact_id, invoice_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
          [
            txId,
            tenantId,
            'Income',
            parseFloat(row.rows[0].paid_amount),
            daysAgo(10 + i),
            'Payment for invoice',
            bankAccount,
            arCategory,
            row.rows[0].contact_id,
            inv,
          ]
        );
      }
    }

    console.log('\nDone. Demo organization seeded successfully.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
