import type pg from 'pg';
import { backfillBillJournalMirrorsForTenant } from '../../accounting/services/billJournalBackfillService.js';
import { backfillInvoiceJournalMirrorsForTenant } from '../../accounting/services/invoiceJournalBackfillService.js';
import { backfillTransactionJournalMirrorsForTenant } from '../../accounting/services/transactionJournalBackfillService.js';
import { bootstrapTenantChart } from '../../organization/services/tenantBootstrap.js';
import { createContractorAdvance } from '../../vendors/services/contractorBillingService.js';
import { settleVendorBillsBatchWithAdvances } from '../../vendors/services/vendorBillAdvanceSettleService.js';
import { postGoodsReceipt } from '../../goods-receipts/services/goodsReceiptService.js';
import {
  postInvestorContribution,
  postProfitAllocationToInvestor,
  postInterProjectEquityTransfer,
  postInvestorWithdrawal,
} from '../../accounting/services/investorJournalPostingService.js';
import { syncPayrollLedgerForAllEmployees } from '../../payroll/services/payrollLedgerService.js';
import {
  PAKLAND_TENANT_ID,
  SELLING_PROJECTS,
  RENTAL_BUILDINGS,
  pkldId,
  monthStart,
  monthDay,
  rentalMonth,
  payrollPeriod,
} from './paklandSeedShared.js';

export { PAKLAND_TENANT_ID };

const SYS_CASH = 'sys-acc-cash';
const SYS_RENT = 'sys-cat-rent-inc';
const SYS_UNIT_SELL = 'sys-cat-unit-sell';
const SYS_PM_COST = 'sys-cat-pm-cost';
const SYS_BLD_MAINT = 'sys-cat-bld-maint';
const SYS_BROK_FEE = 'sys-cat-brok-fee';
const SYS_SAL_EXP = 'sys-cat-sal-exp';
const SYS_REV_ASSET = 'sys-cat-rev-asset-in-kind';
const SYS_SVC_DEDUCT = 'sys-cat-svc-deduct';
const SYS_BLD_UTIL = 'sys-cat-bld-util';
const SYS_PROP_REP_OWN = 'sys-cat-prop-rep-own';
const SYS_PROP_REP_TEN = 'sys-cat-prop-rep-ten';
const SYS_RETAINED = 'sys-acc-retained-earnings';

const BUILDING_COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B'] as const;
const PLAN_STATUSES = ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Approved'] as const;
const INVOICE_STATUSES = ['Paid', 'Partially Paid', 'Unpaid'] as const;

type TxSeed = {
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
  payslipId?: string | null;
};

async function postSeedJournalMirrors(client: pg.PoolClient, tenantId: string): Promise<void> {
  const onProgress = (msg: string) => console.log(`  [journal] ${msg}`);
  console.log('  Backfilling transaction journals…');
  await backfillTransactionJournalMirrorsForTenant(client, tenantId, {
    batchSize: 200,
    onProgress,
  });
  console.log('  Backfilling invoice journals…');
  await backfillInvoiceJournalMirrorsForTenant(client, tenantId);
  console.log('  Backfilling bill journals…');
  await backfillBillJournalMirrorsForTenant(client, tenantId);
}

/** Run after business data commit — payroll ledger + GL mirrors. */
export async function finalizePaklandSeed(
  client: pg.PoolClient,
  tenantId: string,
  options?: { skipPayrollLedger?: boolean }
): Promise<void> {
  if (!options?.skipPayrollLedger) {
    try {
      console.log('Syncing payroll ledger…');
      await syncPayrollLedgerForAllEmployees(client, tenantId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Payroll ledger sync skipped (${msg})`);
    }
  } else {
    console.log('Skipping payroll ledger sync (already built).');
  }
  console.log('Posting journal mirrors…');
  await postSeedJournalMirrors(client, tenantId);
}

async function resolveActorUserId(client: pg.PoolClient, tenantId: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM users
     WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE
       AND (role = 'Admin' OR LOWER(role) = 'admin' OR role = 'SUPER_ADMIN')
     ORDER BY created_at ASC NULLS LAST
     LIMIT 1`,
    [tenantId]
  );
  if (r.rows[0]?.id) return r.rows[0].id;
  const fallback = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE
     ORDER BY created_at ASC NULLS LAST LIMIT 1`,
    [tenantId]
  );
  if (!fallback.rows[0]?.id) throw new Error(`No active user found for tenant ${tenantId}`);
  return fallback.rows[0].id;
}

function invoicePaidAmount(amount: number, status: string): number {
  if (status === 'Paid') return amount;
  if (status === 'Partially Paid') return Math.round(amount * 0.45);
  return 0;
}

function billPaidAmount(amount: number, status: string): number {
  return invoicePaidAmount(amount, status);
}

export async function seedPaklandBusinessData(client: pg.PoolClient, tenantId: string): Promise<void> {
  await bootstrapTenantChart(client, tenantId, { legacyIds: false });

  const actorUserId = await resolveActorUserId(client, tenantId);
  const today = new Date();
  const y = today.getFullYear();

  await client.query(
    `UPDATE tenants SET company_name = $2, updated_at = NOW() WHERE id = $1`,
    [tenantId, 'Pak Land pvt ltd']
  );

  const accOperating = pkldId('acc', 'operating');
  const accEscrow = pkldId('acc', 'escrow');
  const accPetty = pkldId('acc', 'petty');
  const accVendorAdv = pkldId('acc', 'vendor-adv');
  const catMaterials = pkldId('cat', 'materials');
  const catCement = pkldId('cat', 'cement');
  const catElectrical = pkldId('cat', 'electrical');
  const catLabor = pkldId('cat', 'labor');

  const tenantAccounts: Array<[string, string, string, number]> = [
    [accOperating, 'Pakland Operating Bank', 'BANK', 0],
    [accEscrow, 'Pakland Escrow Account', 'BANK', 0],
    [accPetty, 'Pakland Petty Cash', 'CASH', 50000],
    [accVendorAdv, 'Vendor Advances', 'ASSET', 0],
  ];
  for (const [id, name, type, opening] of tenantAccounts) {
    await client.query(
      `INSERT INTO accounts (id, tenant_id, name, type, balance, opening_balance, is_permanent, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5, FALSE, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, type = EXCLUDED.type, balance = EXCLUDED.balance,
         opening_balance = EXCLUDED.opening_balance, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, name, type, opening]
    );
  }

  const tenantCategories: Array<[string, string]> = [
    [catMaterials, 'Materials & Steel'],
    [catCement, 'Cement & Concrete'],
    [catElectrical, 'Electrical Works'],
    [catLabor, 'Construction Labor'],
  ];
  for (const [id, name] of tenantCategories) {
    await client.query(
      `INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, is_hidden, version, created_at, updated_at)
       VALUES ($1, $2, $3, 'Expense', FALSE, FALSE, FALSE, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, name]
    );
  }

  const ownerIds: string[] = [];
  for (let i = 1; i <= 4; i += 1) {
    const id = pkldId('owner', i);
    ownerIds.push(id);
    await client.query(
      `INSERT INTO contacts (id, tenant_id, name, type, version, created_at, updated_at)
       VALUES ($1, $2, $3, 'Owner', 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, `Pakland Owner ${i}`]
    );
  }

  const brokerIds: string[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const id = pkldId('broker', i);
    brokerIds.push(id);
    await client.query(
      `INSERT INTO contacts (id, tenant_id, name, type, version, created_at, updated_at)
       VALUES ($1, $2, $3, 'Broker', 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, `Pakland Broker ${i}`]
    );
  }

  const tenantContactIds: string[] = [];
  for (let i = 1; i <= 12; i += 1) {
    const id = pkldId('tenant', i);
    tenantContactIds.push(id);
    await client.query(
      `INSERT INTO contacts (id, tenant_id, name, type, version, created_at, updated_at)
       VALUES ($1, $2, $3, 'Tenant', 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, `Pakland Tenant ${i}`]
    );
  }

  const leadIds: string[] = [];
  for (let i = 1; i <= 8; i += 1) {
    const id = pkldId('lead', i);
    leadIds.push(id);
    await client.query(
      `INSERT INTO contacts (id, tenant_id, name, type, version, created_at, updated_at)
       VALUES ($1, $2, $3, 'Lead', 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, `Pakland Lead ${i}`]
    );
  }

  for (let i = 1; i <= 5; i += 1) {
    const id = pkldId('friend', i);
    const type = i % 2 === 0 ? 'Lead' : 'Client';
    await client.query(
      `INSERT INTO contacts (id, tenant_id, name, type, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, `Pakland Friend ${i}`, type]
    );
  }

  const buyerIds: string[] = [];
  for (let i = 1; i <= 60; i += 1) {
    const id = pkldId('buyer', i);
    buyerIds.push(id);
    await client.query(
      `INSERT INTO contacts (id, tenant_id, name, type, version, created_at, updated_at)
       VALUES ($1, $2, $3, 'Client', 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, `Pakland Buyer ${i}`]
    );
  }

  const projectIds: string[] = [];
  for (let i = 0; i < SELLING_PROJECTS.length; i += 1) {
    const id = pkldId('proj', i + 1);
    projectIds.push(id);
    await client.query(
      `INSERT INTO projects (id, tenant_id, name, location, project_type, status, description, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
      [
        id,
        tenantId,
        SELLING_PROJECTS[i],
        i % 2 === 0 ? 'Gulberg, Lahore' : 'DHA, Karachi',
        i % 2 === 0 ? 'residential' : 'commercial',
        `${SELLING_PROJECTS[i]} — Pakland presentation portfolio`,
      ]
    );
  }

  const unitByProject: string[][] = [];
  for (let pi = 0; pi < projectIds.length; pi += 1) {
    const units: string[] = [];
    for (let u = 1; u <= 20; u += 1) {
      const unitId = pkldId('proj', pi + 1, 'unit', u);
      units.push(unitId);
      const salePrice = 5_000_000 + ((pi * 20 + u) % 11) * 1_000_000;
      const status = u <= 15 ? 'sold' : 'available';
      await client.query(
        `INSERT INTO units (id, tenant_id, project_id, unit_number, status, sale_price, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, sale_price = EXCLUDED.sale_price, updated_at = NOW(), deleted_at = NULL`,
        [unitId, tenantId, projectIds[pi], `U-${String(u).padStart(2, '0')}`, status, salePrice]
      );
    }
    unitByProject.push(units);
  }

  for (let i = 0; i < 5; i += 1) {
    const planId = pkldId('plan', i + 1);
    const projIdx = i % projectIds.length;
    const unitIdx = i % 15;
    const listPrice = 8_000_000 + i * 500_000;
    const netValue = listPrice - 200_000;
    await client.query(
      `INSERT INTO installment_plans (
         id, tenant_id, project_id, lead_id, unit_id, net_value, status, duration_years, down_payment_percentage,
         frequency, list_price, customer_discount, floor_discount, lump_sum_discount, misc_discount,
         down_payment_amount, installment_amount, total_installments, description, user_id, intro_text, root_id,
         approval_requested_by, approval_requested_to, approval_requested_at, approval_reviewed_by, approval_reviewed_at,
         discounts, customer_discount_category_id, floor_discount_category_id, lump_sum_discount_category_id,
         misc_discount_category_id, selected_amenities, amenities_total, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, 3, 20, 'Monthly', $8, 100000, 50000, 30000, 20000,
         $9, $10, 24, $11, $12, NULL, $1,
         $12, $12, NOW(), $12, NOW(),
         '[]'::jsonb, NULL, NULL, NULL, NULL, '[]'::jsonb, 0, 1, NULL, NOW(), NOW()
       )
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, net_value = EXCLUDED.net_value, updated_at = NOW(), deleted_at = NULL`,
      [
        planId,
        tenantId,
        projectIds[projIdx],
        leadIds[i % leadIds.length],
        unitByProject[projIdx][unitIdx],
        netValue,
        PLAN_STATUSES[i],
        listPrice,
        Math.round(netValue * 0.2),
        Math.round((netValue * 0.8) / 24),
        `Marketing plan ${i + 1} — ${SELLING_PROJECTS[projIdx]}`,
        actorUserId,
      ]
    );
  }

  let buyerCursor = 0;
  const agreementIds: string[] = [];
  for (let pi = 0; pi < projectIds.length; pi += 1) {
    for (let a = 1; a <= 15; a += 1) {
      const agreementId = pkldId('proj', pi + 1, 'pa', a);
      agreementIds.push(agreementId);
      const unitId = unitByProject[pi][a - 1];
      const clientId = buyerIds[buyerCursor % buyerIds.length];
      buyerCursor += 1;
      const sellingPrice = 5_000_000 + ((pi * 15 + a) % 11) * 1_000_000;
      const rebateBroker = a % 3 === 0 ? brokerIds[a % brokerIds.length] : null;
      const issueDate = monthDay(10 - (a % 11), 5 + (a % 20));
      await client.query(
        `INSERT INTO project_agreements (
           id, tenant_id, agreement_number, client_id, project_id, unit_ids, selling_price,
           rebate_amount, rebate_broker_id, issue_date, description, status, version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, 'Active', 1, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET selling_price = EXCLUDED.selling_price, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
        [
          agreementId,
          tenantId,
          `PA-PKLD-${pi + 1}-${String(a).padStart(3, '0')}`,
          clientId,
          projectIds[pi],
          JSON.stringify([unitId]),
          sellingPrice,
          rebateBroker ? 150_000 : null,
          rebateBroker,
          issueDate,
          `Agreement — ${SELLING_PROJECTS[pi]} unit ${a}`,
        ]
      );
      await client.query(
        `INSERT INTO project_agreement_units (agreement_id, unit_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [agreementId, unitId]
      );

      const installmentCount = 3 + (a % 2);
      for (let inst = 1; inst <= installmentCount; inst += 1) {
        const invId = pkldId('proj', pi + 1, 'pa', a, 'inv', inst);
        const invAmount = Math.round(sellingPrice / installmentCount);
        const invStatus = INVOICE_STATUSES[(a + inst) % INVOICE_STATUSES.length];
        const paid = invoicePaidAmount(invAmount, invStatus);
        const invDate = monthDay(10 - ((a + inst) % 11), 3 + (inst % 25));
        await client.query(
          `INSERT INTO invoices (
             id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date,
             invoice_type, description, project_id, unit_id, agreement_id, category_id, version, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, 'Installment', $9, $10, $11, $12, $13, 1, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, updated_at = NOW()`,
          [
            invId,
            tenantId,
            `PKLD-INV-${pi + 1}-${a}-${inst}`,
            clientId,
            invAmount,
            paid,
            invStatus,
            invDate,
            `Installment ${inst}/${installmentCount} — ${SELLING_PROJECTS[pi]}`,
            projectIds[pi],
            unitId,
            agreementId,
            SYS_UNIT_SELL,
          ]
        );
      }
    }
  }

  const assetVehicleId = pkldId('asset', 'vehicle');
  const receivedAssets: Array<{
    id: string;
    projectId: string;
    contactId: string;
    desc: string;
    assetType: string;
    value: number;
    received: string;
    sold: string | null;
    saleAmt: number | null;
  }> = [
    {
      id: pkldId('asset', 'plot'),
      projectId: projectIds[0],
      contactId: ownerIds[0],
      desc: '5 Marla plot — owner contribution',
      assetType: 'Plot',
      value: 2_500_000,
      received: monthDay(8, 12),
      sold: null,
      saleAmt: null,
    },
    {
      id: pkldId('asset', 'machinery'),
      projectId: projectIds[1],
      contactId: ownerIds[1],
      desc: 'Construction machinery — owner contribution',
      assetType: 'Machinery',
      value: 3_200_000,
      received: monthDay(7, 18),
      sold: null,
      saleAmt: null,
    },
    {
      id: assetVehicleId,
      projectId: projectIds[0],
      contactId: buyerIds[0],
      desc: 'Toyota Corolla 2022 — in-kind booking',
      assetType: 'Vehicle',
      value: 3_100_000,
      received: monthDay(9, 5),
      sold: monthDay(5, 10),
      saleAmt: 3_350_000,
    },
  ];
  for (const asset of receivedAssets) {
    await client.query(
      `INSERT INTO project_received_assets (
         id, tenant_id, project_id, contact_id, description, asset_type, recorded_value,
         received_date, sold_date, sale_amount, sale_account_id, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10, $11, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         description = EXCLUDED.description, recorded_value = EXCLUDED.recorded_value,
         sold_date = EXCLUDED.sold_date, sale_amount = EXCLUDED.sale_amount,
         updated_at = NOW(), deleted_at = NULL`,
      [
        asset.id,
        tenantId,
        asset.projectId,
        asset.contactId,
        asset.desc,
        asset.assetType,
        asset.value,
        asset.received,
        asset.sold,
        asset.saleAmt,
        asset.sold ? SYS_CASH : null,
      ]
    );
  }

  const buildingIds: string[] = [];
  const propertyByBuilding: string[][] = [];
  for (let bi = 0; bi < RENTAL_BUILDINGS.length; bi += 1) {
    const bldId = pkldId('bld', bi + 1);
    buildingIds.push(bldId);
    await client.query(
      `INSERT INTO buildings (id, tenant_id, name, color, description, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, updated_at = NOW(), deleted_at = NULL`,
      [bldId, tenantId, RENTAL_BUILDINGS[bi], BUILDING_COLORS[bi], `${RENTAL_BUILDINGS[bi]} — Pakland rental`]
    );

    const props: string[] = [];
    for (let p = 1; p <= 20; p += 1) {
      const propId = pkldId('bld', bi + 1, 'prop', p);
      props.push(propId);
      const ownerId = ownerIds[(bi + p) % ownerIds.length];
      const sc = 3000 + ((p - 1) % 6) * 1000;
      await client.query(
        `INSERT INTO properties (id, tenant_id, name, owner_id, building_id, monthly_service_charge, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, owner_id = EXCLUDED.owner_id, building_id = EXCLUDED.building_id,
           monthly_service_charge = EXCLUDED.monthly_service_charge, updated_at = NOW(), deleted_at = NULL`,
        [propId, tenantId, `Unit ${p} — ${RENTAL_BUILDINGS[bi]}`, ownerId, bldId, sc]
      );
    }
    propertyByBuilding.push(props);
  }

  const rentalAgreementIds: string[] = [];
  let globalAgrIdx = 0;
  for (let bi = 0; bi < buildingIds.length; bi += 1) {
    for (let a = 1; a <= 15; a += 1) {
      globalAgrIdx += 1;
      const agrId = pkldId('bld', bi + 1, 'ra', a);
      rentalAgreementIds.push(agrId);
      const propId = propertyByBuilding[bi][a - 1];
      const tenantId_contact = tenantContactIds[(bi + a) % tenantContactIds.length];
      const ownerId = ownerIds[(bi + a) % ownerIds.length];
      const brokerId = a % 2 === 0 ? brokerIds[a % brokerIds.length] : null;
      const brokerFee = 25_000 + ((a - 1) % 6) * 10_000;
      const monthlyRent = 55_000 + ((bi * 15 + a) % 8) * 5_000;
      await client.query(
        `INSERT INTO rental_agreements (
           id, tenant_id, agreement_number, contact_id, property_id, start_date, end_date,
           monthly_rent, rent_due_date, status, owner_id, security_deposit, broker_id, broker_fee,
           version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 5, 'active', $9, 75000, $10, $11, 1, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET monthly_rent = EXCLUDED.monthly_rent, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
        [
          agrId,
          tenantId,
          `RA-PKLD-${bi + 1}-${String(a).padStart(3, '0')}`,
          tenantId_contact,
          propId,
          `${y - 1}-01-01`,
          `${y + 1}-12-31`,
          monthlyRent,
          ownerId,
          brokerId,
          brokerFee,
        ]
      );

      const monthCount = globalAgrIdx <= 12 ? 6 : 3;
      for (let m = 0; m < monthCount; m += 1) {
        const invId = pkldId('bld', bi + 1, 'ra', a, 'inv', m);
        const invStatus = INVOICE_STATUSES[(a + m) % INVOICE_STATUSES.length];
        const invAmount = monthlyRent;
        const paid = invoicePaidAmount(invAmount, invStatus);
        const issueDate = monthStart(m);
        await client.query(
          `INSERT INTO invoices (
             id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date,
             invoice_type, property_id, agreement_id, rental_month, building_id, version, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, 'Rental', $9, $10, $11, $12, 1, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, updated_at = NOW()`,
          [
            invId,
            tenantId,
            `PKLD-RENT-${bi + 1}-${a}-${m}`,
            tenantId_contact,
            invAmount,
            paid,
            invStatus,
            issueDate,
            propId,
            agrId,
            rentalMonth(m),
            buildingIds[bi],
          ]
        );
      }
    }
  }

  const vendorIds: string[] = [];
  const vendorNames = [
    'Pak Steel Traders',
    'National Cement Co',
    'City Electric Works',
    'Gulf Plumbing HVAC',
    'Horizon Contractors',
    'Lahore Building Supplies',
    'Karachi Hardware',
    'Prime Logistics',
    'Elite Finishing',
    'Pakland PM Services',
  ];
  for (let i = 1; i <= 10; i += 1) {
    const id = pkldId('vendor', i);
    vendorIds.push(id);
    await client.query(
      `INSERT INTO vendors (id, tenant_id, name, contact_no, is_active, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, contact_no = EXCLUDED.contact_no, is_active = TRUE, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, vendorNames[i - 1], `0300-${String(1000000 + i * 11111).slice(0, 7)}`]
    );
  }
  const pmVendorId = vendorIds[9];

  const advanceRecords: { vendorId: string; advanceId: string; amount: number }[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const vendorId = vendorIds[i - 1];
    const amount = i * 100_000;
    const adv = await createContractorAdvance(
      client,
      tenantId,
      {
        contractorContactId: vendorId,
        advanceDate: monthDay(i, 10),
        amount,
        cashAccountId: SYS_CASH,
        advanceAssetAccountId: accVendorAdv,
        projectId: projectIds[i % projectIds.length],
        description: `Contractor advance — ${vendorNames[i - 1]}`,
        reference: `PKLD-ADV-${i}`,
      },
      actorUserId
    );
    advanceRecords.push({ vendorId, advanceId: adv.id, amount });
  }

  const procurementBillIds: string[] = [];
  for (let i = 1; i <= 12; i += 1) {
    const billId = pkldId('bill', 'proc', i);
    procurementBillIds.push(billId);
    const vendorId = vendorIds[(i - 1) % 5];
    const amount = 80_000 + i * 15_000;
    const status = INVOICE_STATUSES[i % INVOICE_STATUSES.length];
    const paid = billPaidAmount(amount, status);
    const catId = [catMaterials, catCement, catElectrical, catLabor][(i - 1) % 4];
    await client.query(
      `INSERT INTO bills (
         id, tenant_id, bill_number, vendor_id, amount, paid_amount, status, issue_date, due_date,
         description, project_id, category_id, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
      [
        billId,
        tenantId,
        `PKLD-BILL-PROC-${String(i).padStart(3, '0')}`,
        vendorId,
        amount,
        paid,
        status,
        monthDay(8 - (i % 9), 5 + (i % 20)),
        `Procurement bill ${i} — ${vendorNames[(i - 1) % 5]}`,
        projectIds[i % projectIds.length],
        catId,
      ]
    );
  }

  for (let i = 0; i < 3; i += 1) {
    const adv = advanceRecords[i];
    const billId = procurementBillIds[i];
    const billAmt = 80_000 + (i + 1) * 15_000;
    const adjAmt = Math.min(adv.amount * 0.4, billAmt * 0.5);
    const cashAmt = Math.max(0, billAmt - adjAmt);
    try {
      await settleVendorBillsBatchWithAdvances(client, tenantId, actorUserId, {
        supplierContactId: adv.vendorId,
        paymentAccountId: SYS_CASH,
        entryDate: monthDay(4 - i, 15),
        bills: [
          {
            billId,
            expenseAccountId: catMaterials,
            cashAmount: cashAmt,
            adjustments: [{ advanceId: adv.advanceId, amount: adjAmt }],
          },
        ],
        reference: `PKLD-SETTLE-${i + 1}`,
        description: `Advance settlement — vendor ${i + 1}`,
      });
    } catch {
      /* settlement may fail if bill already paid — seed continues */
    }
  }

  const poBillIds: string[] = [];
  for (let pi = 0; pi < projectIds.length; pi += 1) {
    for (let c = 1; c <= 2; c += 1) {
      const conId = pkldId('proj', pi + 1, 'con', c);
      const vendorId = vendorIds[(pi + c) % vendorIds.length];
      const total = 600_000 + pi * 100_000 + c * 80_000;
      await client.query(
        `INSERT INTO contracts (
           id, tenant_id, contract_number, name, project_id, vendor_id, total_amount, status, start_date, version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Active', $8, 1, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, total_amount = EXCLUDED.total_amount, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
        [
          conId,
          tenantId,
          `PKLD-CON-${pi + 1}-${c}`,
          `Construction contract ${c} — ${SELLING_PROJECTS[pi]}`,
          projectIds[pi],
          vendorId,
          total,
          monthStart(6),
        ]
      );
    }

    for (let p = 1; p <= 2; p += 1) {
      const poId = pkldId('proj', pi + 1, 'po', p);
      const vendorId = vendorIds[(pi + p) % 8];
      const poTotal = 250_000 + pi * 50_000 + p * 40_000;
      const issueDate = monthDay(7 - p, 8);
      await client.query(
        `INSERT INTO purchase_orders (
           id, tenant_id, po_number, vendor_id, quotation_id, comparison_session_id,
           project_id, building_id, department_id, total_amount, billed_amount, tax_amount,
           status, items, payment_terms, delivery_period, warranty_period, description,
           issue_date, required_date, target_delivery_date, currency, created_by, user_id,
           version, deleted_at, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, NULL, NULL, $5, NULL, NULL, $6, 0, 0, 'Approved', '[]'::jsonb,
           'Net 30', '30 days', '12 months', $7, $8::date, $8::date, $8::date, 'PKR', $9, $9,
           1, NULL, NOW(), NOW()
         )
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, total_amount = EXCLUDED.total_amount, updated_at = NOW(), deleted_at = NULL`,
        [
          poId,
          tenantId,
          `PKLD-PO-${pi + 1}-${p}`,
          vendorId,
          projectIds[pi],
          poTotal,
          `PO ${p} — ${SELLING_PROJECTS[pi]}`,
          issueDate,
          actorUserId,
        ]
      );

      const poLineId = pkldId('proj', pi + 1, 'po', p, 'line', 1);
      const qty = 10 + p;
      const unitRate = Math.round(poTotal / qty);
      await client.query(
        `INSERT INTO purchase_order_lines (
           id, tenant_id, purchase_order_id, item_id, item_name, description, category_id,
           quantity, unit_rate, tax_percent, tax_amount, line_total, sort_order
         ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, 0, 0, $9, 0)
         ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, line_total = EXCLUDED.line_total`,
        [
          poLineId,
          tenantId,
          poId,
          `Material line ${p}`,
          `PO line — ${SELLING_PROJECTS[pi]}`,
          catMaterials,
          qty,
          unitRate,
          poTotal,
        ]
      );

      const grnId = pkldId('proj', pi + 1, 'grn', p);
      const grnLineId = pkldId('proj', pi + 1, 'grn', p, 'line', 1);
      await client.query(
        `INSERT INTO goods_receipts (
           id, tenant_id, grn_number, vendor_id, project_id, purchase_order_id,
           received_date, status, notes, created_by, user_id, version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, 'Draft', $8, $9, $9, 1, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, received_date = EXCLUDED.received_date, updated_at = NOW()`,
        [
          grnId,
          tenantId,
          `PKLD-GRN-${pi + 1}-${p}`,
          vendorId,
          projectIds[pi],
          poId,
          monthDay(6 - p, 12),
          `GRN draft — ${SELLING_PROJECTS[pi]}`,
          actorUserId,
        ]
      );
      await client.query(
        `INSERT INTO goods_receipt_lines (
           id, tenant_id, goods_receipt_id, purchase_order_line_id, item_id, item_name,
           description, ordered_qty, received_qty, unit_rate, line_total, sort_order
         ) VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $7, $8, $9, 0)
         ON CONFLICT (id) DO UPDATE SET received_qty = EXCLUDED.received_qty, line_total = EXCLUDED.line_total`,
        [
          grnLineId,
          tenantId,
          grnId,
          poLineId,
          `Material line ${p}`,
          `GRN line — ${SELLING_PROJECTS[pi]}`,
          qty,
          unitRate,
          poTotal,
        ]
      );

      try {
        await postGoodsReceipt(client, tenantId, grnId, 1, actorUserId);
      } catch {
        /* GRN post may fail on re-seed — continue */
      }

      const billId = pkldId('proj', pi + 1, 'po-bill', p);
      poBillIds.push(billId);
      const billStatus = INVOICE_STATUSES[(pi + p) % INVOICE_STATUSES.length];
      const billPaid = billPaidAmount(poTotal, billStatus);
      await client.query(
        `INSERT INTO bills (
           id, tenant_id, bill_number, vendor_id, amount, paid_amount, status, issue_date, due_date,
           description, project_id, category_id, purchase_order_id, goods_receipt_id, version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, $12, $13, 1, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
        [
          billId,
          tenantId,
          `PKLD-PO-BILL-${pi + 1}-${p}`,
          vendorId,
          poTotal,
          billPaid,
          billStatus,
          monthDay(5 - p, 18),
          `PO bill — ${SELLING_PROJECTS[pi]}`,
          projectIds[pi],
          catMaterials,
          poId,
          grnId,
        ]
      );
    }
  }

  const investorAccountIds: string[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const id = pkldId('inv-acc', i);
    investorAccountIds.push(id);
    await client.query(
      `INSERT INTO accounts (id, tenant_id, name, type, balance, opening_balance, is_permanent, version, created_at, updated_at)
       VALUES ($1, $2, $3, 'EQUITY', 0, 0, FALSE, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, `Investor Equity — Partner ${i}`]
    );
  }

  for (let i = 0; i < investorAccountIds.length; i += 1) {
    await postInvestorContribution(client, tenantId, {
      entryDate: monthDay(9 - i, 8),
      amount: 500_000 + i * 250_000,
      cashAccountId: SYS_CASH,
      investorEquityAccountId: investorAccountIds[i],
      projectId: projectIds[i % projectIds.length],
      description: `Investor contribution — Partner ${i + 1}`,
      reference: `PKLD-INV-C-${i + 1}`,
      createdBy: actorUserId,
    });
  }

  for (let i = 0; i < 2; i += 1) {
    await postProfitAllocationToInvestor(client, tenantId, {
      entryDate: monthDay(3 - i, 20),
      amount: 120_000 + i * 50_000,
      retainedEarningsAccountId: SYS_RETAINED,
      investorEquityAccountId: investorAccountIds[i],
      projectId: projectIds[i],
      description: `Profit allocation — ${SELLING_PROJECTS[i]}`,
      reference: `PKLD-INV-P-${i + 1}`,
      createdBy: actorUserId,
    });
  }

  await postInterProjectEquityTransfer(client, tenantId, {
    entryDate: monthDay(2, 15),
    amount: 200_000,
    investorEquityAccountId: investorAccountIds[0],
    sourceProjectId: projectIds[0],
    cashAccountId: SYS_CASH,
    destProjectId: projectIds[1],
    description: 'Inter-project equity transfer — Pakland Tower to Trade Center',
    createdBy: actorUserId,
  });

  await postInvestorWithdrawal(client, tenantId, {
    entryDate: monthDay(1, 10),
    amount: 75_000,
    cashAccountId: SYS_CASH,
    investorEquityAccountId: investorAccountIds[4],
    projectId: projectIds[3],
    description: 'Investor withdrawal — Partner 5',
    reference: 'PKLD-INV-W-1',
    createdBy: actorUserId,
    skipBalanceCheck: true,
  });

  for (let pi = 0; pi < projectIds.length; pi += 1) {
    const pmConfig = JSON.stringify({ vendorId: pmVendorId, rate: 3, frequency: 'Monthly' });
    await client.query(
      `UPDATE projects SET pm_config = $3::jsonb, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [projectIds[pi], tenantId, pmConfig]
    );

    for (let m = 0; m < 4; m += 1) {
      const period = payrollPeriod(m);
      const allocId = pkldId('proj', pi + 1, 'pm', m);
      const expenseTotal = 180_000 + pi * 25_000 + m * 10_000;
      const feeAmount = Math.round(expenseTotal * 0.03);
      await client.query(
        `INSERT INTO pm_cycle_allocations (
           id, tenant_id, project_id, cycle_id, cycle_label, frequency, start_date, end_date, allocation_date,
           amount, paid_amount, status, bill_id, description, expense_total, fee_rate, excluded_category_ids,
           user_id, version, deleted_at, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, 'Monthly', $6::date, $7::date, $7::date, $8, $9, $10, NULL, $11, $12, 3, '[]',
           $13, 1, NULL, NOW(), NOW()
         )
         ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, expense_total = EXCLUDED.expense_total, updated_at = NOW(), deleted_at = NULL`,
        [
          allocId,
          tenantId,
          projectIds[pi],
          `${period.year}-${period.month}`,
          `${period.month} ${period.year}`,
          period.start,
          period.end,
          feeAmount,
          m < 2 ? feeAmount : Math.round(feeAmount * 0.5),
          m < 3 ? 'Paid' : 'Pending',
          `PM fee — ${SELLING_PROJECTS[pi]} ${period.month}`,
          expenseTotal,
          actorUserId,
        ]
      );
    }
  }

  const txRows: TxSeed[] = [];
  const pushTx = (row: TxSeed) => txRows.push(row);

  for (let pi = 0; pi < projectIds.length; pi += 1) {
    for (let a = 1; a <= 15; a += 1) {
      const clientId = buyerIds[((pi * 15 + a) - 1) % buyerIds.length];
      const installmentCount = 3 + (a % 2);
      for (let inst = 1; inst <= installmentCount; inst += 1) {
        const invId = pkldId('proj', pi + 1, 'pa', a, 'inv', inst);
        const invStatus = INVOICE_STATUSES[(a + inst) % INVOICE_STATUSES.length];
        if (invStatus === 'Unpaid') continue;
        const sellingPrice = 5_000_000 + ((pi * 15 + a) % 11) * 1_000_000;
        const invAmount = Math.round(sellingPrice / installmentCount);
        const paid = invoicePaidAmount(invAmount, invStatus);
        const offset = 10 - ((a + inst) % 11);
        pushTx({
          id: pkldId('tx', 'proj', pi + 1, a, inst),
          type: 'Income',
          amount: paid,
          date: monthDay(offset, 5 + ((a + inst) % 20)),
          desc: `Installment payment — ${SELLING_PROJECTS[pi]} unit ${a}`,
          categoryId: SYS_UNIT_SELL,
          contactId: clientId,
          invoiceId: invId,
          projectId: projectIds[pi],
        });
      }
    }
  }

  pushTx({
    id: pkldId('tx', 'asset-vehicle-sale'),
    type: 'Income',
    amount: 3_350_000,
    date: monthDay(5, 10),
    desc: 'Sale of received vehicle — Pakland Tower 1',
    categoryId: SYS_REV_ASSET,
    contactId: buyerIds[0],
    projectId: projectIds[0],
  });

  for (const asset of receivedAssets.filter((a) => !a.sold)) {
    pushTx({
      id: pkldId('tx', 'asset', asset.id),
      type: 'Income',
      amount: asset.value,
      date: asset.received,
      desc: `In-kind asset recorded — ${asset.desc}`,
      categoryId: SYS_REV_ASSET,
      contactId: asset.contactId,
      projectId: asset.projectId,
    });
  }

  globalAgrIdx = 0;
  for (let bi = 0; bi < buildingIds.length; bi += 1) {
    for (let a = 1; a <= 15; a += 1) {
      globalAgrIdx += 1;
      const propId = propertyByBuilding[bi][a - 1];
      const tenantId_contact = tenantContactIds[(bi + a) % tenantContactIds.length];
      const monthlyRent = 55_000 + ((bi * 15 + a) % 8) * 5_000;
      const monthCount = globalAgrIdx <= 12 ? 6 : 3;
      for (let m = 0; m < monthCount; m += 1) {
        const invId = pkldId('bld', bi + 1, 'ra', a, 'inv', m);
        const invStatus = INVOICE_STATUSES[(a + m) % INVOICE_STATUSES.length];
        if (invStatus === 'Unpaid') continue;
        const paid = invoicePaidAmount(monthlyRent, invStatus);
        pushTx({
          id: pkldId('tx', 'rent', bi + 1, a, m),
          type: 'Income',
          amount: paid,
          date: monthDay(m, 5 + ((a + m) % 18)),
          desc: `Rent received — ${RENTAL_BUILDINGS[bi]} unit ${a}`,
          categoryId: SYS_RENT,
          propertyId: propId,
          contactId: tenantId_contact,
          invoiceId: invId,
          buildingId: buildingIds[bi],
        });
      }

      if (a % 2 === 0) {
        const brokerFee = 25_000 + ((a - 1) % 6) * 10_000;
        pushTx({
          id: pkldId('tx', 'broker', bi + 1, a),
          type: 'Expense',
          amount: brokerFee,
          date: monthDay(a % 10, 12),
          desc: `Broker commission — ${RENTAL_BUILDINGS[bi]}`,
          categoryId: SYS_BROK_FEE,
          propertyId: propId,
          contactId: brokerIds[a % brokerIds.length],
          buildingId: buildingIds[bi],
        });
      }

      for (let m = 0; m < monthCount; m += 1) {
        const sc = 3000 + ((a - 1) % 6) * 1000;
        pushTx({
          id: pkldId('tx', 'svc', bi + 1, a, m),
          type: 'Expense',
          amount: sc,
          date: monthDay(m, 8),
          desc: `Service charge deduction — ${RENTAL_BUILDINGS[bi]} unit ${a}`,
          categoryId: SYS_SVC_DEDUCT,
          propertyId: propId,
          buildingId: buildingIds[bi],
        });
      }
    }
  }

  const rentalBillBearers: Array<{
    bearer: string;
    category: string;
    buildingIdx: number;
    useProperty: boolean;
  }> = [
    { bearer: 'owner', category: SYS_PROP_REP_OWN, buildingIdx: 0, useProperty: true },
    { bearer: 'building', category: SYS_BLD_MAINT, buildingIdx: 0, useProperty: false },
    { bearer: 'tenant', category: SYS_PROP_REP_TEN, buildingIdx: 0, useProperty: true },
    { bearer: 'owner', category: SYS_BLD_UTIL, buildingIdx: 1, useProperty: false },
    { bearer: 'building', category: SYS_BLD_UTIL, buildingIdx: 1, useProperty: false },
    { bearer: 'tenant', category: SYS_BLD_MAINT, buildingIdx: 1, useProperty: true },
    { bearer: 'owner', category: SYS_BLD_MAINT, buildingIdx: 2, useProperty: true },
    { bearer: 'building', category: SYS_PROP_REP_OWN, buildingIdx: 2, useProperty: false },
    { bearer: 'tenant', category: SYS_PROP_REP_TEN, buildingIdx: 2, useProperty: true },
    { bearer: 'owner', category: SYS_BLD_UTIL, buildingIdx: 3, useProperty: false },
    { bearer: 'building', category: SYS_BLD_MAINT, buildingIdx: 3, useProperty: false },
    { bearer: 'tenant', category: SYS_BLD_UTIL, buildingIdx: 3, useProperty: true },
  ];

  for (let i = 0; i < rentalBillBearers.length; i += 1) {
    const spec = rentalBillBearers[i];
    const billId = pkldId('bill', 'rental', i + 1);
    const bldId = buildingIds[spec.buildingIdx];
    const propId = spec.useProperty ? propertyByBuilding[spec.buildingIdx][i % 15] : null;
    const amount = 12_000 + i * 3_500;
    const status = INVOICE_STATUSES[i % INVOICE_STATUSES.length];
    const paid = billPaidAmount(amount, status);
    const vendorId = vendorIds[i % vendorIds.length];
    await client.query(
      `INSERT INTO bills (
         id, tenant_id, bill_number, vendor_id, amount, paid_amount, status, issue_date, due_date,
         description, building_id, property_id, category_id, expense_bearer_type, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, $12, $13, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status, updated_at = NOW(), deleted_at = NULL`,
      [
        billId,
        tenantId,
        `PKLD-RENT-BILL-${String(i + 1).padStart(3, '0')}`,
        vendorId,
        amount,
        paid,
        status,
        monthDay(7 - (i % 8), 10 + (i % 15)),
        `Rental bill (${spec.bearer}) — ${RENTAL_BUILDINGS[spec.buildingIdx]}`,
        bldId,
        propId,
        spec.category,
        spec.bearer,
      ]
    );
    if (paid > 0) {
      pushTx({
        id: pkldId('tx', 'rent-bill', i + 1),
        type: 'Expense',
        amount: paid,
        date: monthDay(6 - (i % 7), 14),
        desc: `Rental bill payment — ${spec.bearer}`,
        categoryId: spec.category,
        buildingId: bldId,
        propertyId: propId,
        vendorId,
        billId,
      });
    }
  }

  for (let i = 0; i < procurementBillIds.length; i += 1) {
    const billId = procurementBillIds[i];
    const amount = 80_000 + (i + 1) * 15_000;
    const status = INVOICE_STATUSES[i % INVOICE_STATUSES.length];
    const paid = billPaidAmount(amount, status);
    if (paid <= 0) continue;
    pushTx({
      id: pkldId('tx', 'proc-bill', i + 1),
      type: 'Expense',
      amount: paid,
      date: monthDay(8 - (i % 9), 5 + (i % 20)),
      desc: `Procurement bill payment ${i + 1}`,
      categoryId: [catMaterials, catCement, catElectrical, catLabor][i % 4],
      projectId: projectIds[i % projectIds.length],
      vendorId: vendorIds[i % 5],
      billId,
    });
  }

  for (let i = 0; i < poBillIds.length; i += 1) {
    const billId = poBillIds[i];
    const pi = Math.floor(i / 2);
    const p = (i % 2) + 1;
    const poTotal = 250_000 + pi * 50_000 + p * 40_000;
    const status = INVOICE_STATUSES[(pi + p) % INVOICE_STATUSES.length];
    const paid = billPaidAmount(poTotal, status);
    if (paid <= 0) continue;
    pushTx({
      id: pkldId('tx', 'po-bill', i + 1),
      type: 'Expense',
      amount: paid,
      date: monthDay(5 - (i % 6), 18),
      desc: `PO bill payment — ${SELLING_PROJECTS[pi]}`,
      categoryId: catMaterials,
      projectId: projectIds[pi],
      vendorId: vendorIds[(pi + p) % 8],
      billId,
    });
  }

  for (const row of txRows) {
    await client.query(
      `INSERT INTO transactions (
         id, tenant_id, type, amount, date, description, account_id, category_id,
         property_id, contact_id, invoice_id, project_id, building_id, vendor_id, bill_id, payslip_id,
         version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         amount = EXCLUDED.amount, description = EXCLUDED.description, date = EXCLUDED.date,
         bill_id = EXCLUDED.bill_id, invoice_id = EXCLUDED.invoice_id, updated_at = NOW(), deleted_at = NULL`,
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
        row.payslipId ?? null,
      ]
    );
  }

  const persCategories: Array<[string, string, 'Income' | 'Expense', number]> = [
    [pkldId('pers-cat', 1), 'Director Draw', 'Income', 0],
    [pkldId('pers-cat', 2), 'Family Transfer In', 'Income', 1],
    [pkldId('pers-cat', 3), 'Groceries', 'Expense', 2],
    [pkldId('pers-cat', 4), 'Personal Fuel', 'Expense', 3],
  ];
  for (const [id, name, type, sortOrder] of persCategories) {
    await client.query(
      `INSERT INTO personal_categories (id, tenant_id, name, type, sort_order, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, sort_order = EXCLUDED.sort_order, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, name, type, sortOrder]
    );
  }

  const persTxSpecs: Array<[string, string, 'Income' | 'Expense', number, number, string]> = [
    [pkldId('pers-tx', 1), pkldId('pers-cat', 1), 'Income', 150_000, 1, 'Monthly director draw'],
    [pkldId('pers-tx', 2), pkldId('pers-cat', 2), 'Income', 45_000, 2, 'Family transfer — savings'],
    [pkldId('pers-tx', 3), pkldId('pers-cat', 3), 'Expense', 18_500, 2, 'Household groceries'],
    [pkldId('pers-tx', 4), pkldId('pers-cat', 4), 'Expense', 9_200, 3, 'Personal vehicle fuel'],
    [pkldId('pers-tx', 5), pkldId('pers-cat', 1), 'Income', 120_000, 4, 'Bonus draw'],
    [pkldId('pers-tx', 6), pkldId('pers-cat', 3), 'Expense', 22_000, 5, 'Weekly groceries'],
    [pkldId('pers-tx', 7), pkldId('pers-cat', 4), 'Expense', 11_500, 6, 'Fuel — motorway trip'],
    [pkldId('pers-tx', 8), pkldId('pers-cat', 2), 'Income', 30_000, 7, 'Family support received'],
  ];
  for (const [id, catId, type, amount, monthOff, desc] of persTxSpecs) {
    await client.query(
      `INSERT INTO personal_transactions (
         id, tenant_id, account_id, personal_category_id, type, amount, transaction_date, description, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, description = EXCLUDED.description, transaction_date = EXCLUDED.transaction_date, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, accOperating, catId, type, amount, monthDay(monthOff, 12), desc]
    );
  }

  const taskSpecs: Array<[string, string, string, number, string, number, string]> = [
    [pkldId('pers-task', 1), 'Review Q1 sales targets', 'Prepare dashboard briefing', 1, 'in_progress', 40, 'high'],
    [pkldId('pers-task', 2), 'Site visit — Pakland Tower 1', 'Inspect finishing work', 2, 'pending', 0, 'medium'],
    [pkldId('pers-task', 3), 'Broker payout approvals', 'Review commission statements', 3, 'pending', 0, 'high'],
    [pkldId('pers-task', 4), 'Investor meeting prep', 'Compile project P&L pack', 4, 'in_progress', 25, 'medium'],
    [pkldId('pers-task', 5), 'Rental arrears follow-up', 'Contact tenants with unpaid rent', 5, 'pending', 0, 'high'],
    [pkldId('pers-task', 6), 'Payroll review', 'Approve current month payroll run', 6, 'completed', 100, 'low'],
  ];
  for (const [id, title, desc, monthOff, status, progress, priority] of taskSpecs) {
    await client.query(
      `INSERT INTO personal_tasks (id, user_id, title, description, created_date, target_date, status, progress, priority)
       VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, description = EXCLUDED.description, target_date = EXCLUDED.target_date,
         status = EXCLUDED.status, progress = EXCLUDED.progress, priority = EXCLUDED.priority, updated_at = NOW()`,
      [
        id,
        actorUserId,
        title,
        desc,
        monthDay(monthOff, 1),
        monthDay(monthOff + 1, 15),
        status,
        progress,
        priority,
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
      projectIds[0],
    ]
  );

  const payDeptIds: string[] = [];
  const deptSpecs = [
    ['Site Operations', 'SITE'],
    ['Administration', 'ADM'],
    ['Finance', 'FIN'],
    ['Sales & Marketing', 'SLS'],
  ] as const;
  for (let i = 0; i < deptSpecs.length; i += 1) {
    const id = pkldId('pay-dept', i + 1);
    payDeptIds.push(id);
    await client.query(
      `INSERT INTO payroll_departments (id, tenant_id, name, code, description, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, is_active = TRUE, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, deptSpecs[i][0], deptSpecs[i][1], `${deptSpecs[i][0]} — Pakland`, actorUserId]
    );
  }

  const payGradeIds: string[] = [];
  const gradeSpecs: Array<[string, number, number]> = [
    ['G1 — Junior', 35_000, 65_000],
    ['G2 — Officer', 65_000, 95_000],
    ['G3 — Senior', 95_000, 140_000],
    ['G4 — Manager', 140_000, 220_000],
  ];
  for (let i = 0; i < gradeSpecs.length; i += 1) {
    const id = pkldId('pay-grade', i + 1);
    payGradeIds.push(id);
    await client.query(
      `INSERT INTO payroll_grades (id, tenant_id, name, description, min_salary, max_salary, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, min_salary = EXCLUDED.min_salary, max_salary = EXCLUDED.max_salary, updated_at = NOW(), deleted_at = NULL`,
      [id, tenantId, gradeSpecs[i][0], gradeSpecs[i][0], gradeSpecs[i][1], gradeSpecs[i][2], actorUserId]
    );
  }

  type PayEmp = {
    id: string;
    name: string;
    code: string;
    designation: string;
    department: string;
    departmentId: string;
    grade: string;
    basic: number;
    netPay: number;
    projects?: { project_id: string; allocation_percentage: number }[];
    buildings?: { building_id: string; allocation_percentage: number }[];
  };

  const payEmployees: PayEmp[] = [];
  for (let i = 1; i <= 20; i += 1) {
    const deptIdx = i % payDeptIds.length;
    const gradeIdx = i % payGradeIds.length;
    const basic = 55_000 + i * 4_500;
    const netPay = Math.round(basic * 1.12 + 15_000);
    const emp: PayEmp = {
      id: pkldId('pay-emp', i),
      name: `Pakland Employee ${i}`,
      code: `PKLD-EMP-${String(i).padStart(3, '0')}`,
      designation: i <= 5 ? 'Site Supervisor' : i <= 10 ? 'Accounts Officer' : i <= 15 ? 'Sales Executive' : 'Administrator',
      department: deptSpecs[deptIdx][0],
      departmentId: payDeptIds[deptIdx],
      grade: gradeSpecs[gradeIdx][0],
      basic,
      netPay,
    };
    if (i <= 8) {
      emp.projects = [{ project_id: projectIds[i % projectIds.length], allocation_percentage: 100 }];
    } else if (i <= 12) {
      emp.buildings = [{ building_id: buildingIds[i % buildingIds.length], allocation_percentage: 100 }];
    } else if (i <= 16) {
      emp.projects = [
        { project_id: projectIds[0], allocation_percentage: 50 },
        { project_id: projectIds[1], allocation_percentage: 50 },
      ];
    } else {
      emp.buildings = [
        { building_id: buildingIds[0], allocation_percentage: 50 },
        { building_id: buildingIds[1], allocation_percentage: 50 },
      ];
    }
    payEmployees.push(emp);
  }

  for (const emp of payEmployees) {
    const salary = {
      basic: emp.basic,
      allowances: [{ name: 'Site Allowance', amount: 15000, is_percentage: false }],
      deductions: [{ name: 'Provident Fund', amount: 12, is_percentage: true }],
    };
    await client.query(
      `INSERT INTO payroll_employees (
         id, tenant_id, name, employee_code, designation, department, department_id, grade, status,
         joining_date, salary, adjustments, projects, buildings, created_by, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, $10::jsonb, '[]'::jsonb, $11::jsonb, $12::jsonb, $13, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, designation = EXCLUDED.designation, department = EXCLUDED.department,
         department_id = EXCLUDED.department_id, grade = EXCLUDED.grade, salary = EXCLUDED.salary,
         projects = EXCLUDED.projects, buildings = EXCLUDED.buildings, updated_at = NOW(), deleted_at = NULL`,
      [
        emp.id,
        tenantId,
        emp.name,
        emp.code,
        emp.designation,
        emp.department,
        emp.departmentId,
        emp.grade,
        `${y - 2}-03-01`,
        JSON.stringify(salary),
        JSON.stringify(emp.projects ?? []),
        JSON.stringify(emp.buildings ?? []),
        actorUserId,
      ]
    );
  }

  const payRunIds = [pkldId('pay-run', 3), pkldId('pay-run', 2), pkldId('pay-run', 1), pkldId('pay-run', 0)];
  const payRunPeriods = [payrollPeriod(3), payrollPeriod(2), payrollPeriod(1), payrollPeriod(0)];
  const payRunStatuses = ['PAID', 'PAID', 'PAID', 'APPROVED'] as const;
  const totalNet = payEmployees.reduce((s, e) => s + e.netPay, 0);

  for (let ri = 0; ri < payRunIds.length; ri += 1) {
    const runId = payRunIds[ri];
    const period = payRunPeriods[ri];
    const status = payRunStatuses[ri];
    const isPaid = status === 'PAID';
    await client.query(
      `INSERT INTO payroll_runs (
         id, tenant_id, month, year, period_start, period_end, status, total_amount, employee_count, created_by, paid_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, total_amount = EXCLUDED.total_amount, employee_count = EXCLUDED.employee_count, updated_at = NOW(), deleted_at = NULL`,
      [
        runId,
        tenantId,
        period.month,
        period.year,
        period.start,
        period.end,
        status,
        isPaid ? totalNet : 0,
        payEmployees.length,
        actorUserId,
        isPaid ? `${period.end}T12:00:00Z` : null,
      ]
    );

    for (const emp of payEmployees) {
      const payslipId = `${runId}-${emp.id}`;
      if (isPaid) {
        await client.query(
          `INSERT INTO payslips (
             id, tenant_id, payroll_run_id, employee_id, basic_pay, total_allowances, total_deductions,
             total_adjustments, gross_pay, net_pay, is_paid, paid_amount, paid_at, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, 15000, $6, 0, $7, $8, TRUE, $8, $9, NOW(), NOW())
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
            `${period.end}T14:00:00Z`,
          ]
        );
        await client.query(
          `INSERT INTO transactions (
             id, tenant_id, type, amount, date, description, account_id, category_id, project_id, payslip_id, version, created_at, updated_at
           ) VALUES ($1, $2, 'Expense', $3, $4, $5, $6, $7, $8, $9, 1, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, description = EXCLUDED.description, date = EXCLUDED.date, payslip_id = EXCLUDED.payslip_id, updated_at = NOW(), deleted_at = NULL`,
          [
            `${payslipId}-pay`,
            tenantId,
            emp.netPay,
            period.end,
            `Salary paid — ${emp.name}`,
            SYS_CASH,
            SYS_SAL_EXP,
            emp.projects?.[0]?.project_id ?? null,
            payslipId,
          ]
        );
      } else {
        await client.query(
          `INSERT INTO payslips (
             id, tenant_id, payroll_run_id, employee_id, basic_pay, total_allowances, total_deductions,
             total_adjustments, gross_pay, net_pay, is_paid, paid_amount, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, 15000, $6, 0, $7, $8, FALSE, 0, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET net_pay = EXCLUDED.net_pay, updated_at = NOW(), deleted_at = NULL`,
          [
            payslipId,
            tenantId,
            runId,
            emp.id,
            emp.basic,
            Math.round(emp.basic * 0.12),
            emp.basic + 15000,
            emp.netPay,
          ]
        );
      }
    }
  }

  console.log('Pakland business data inserted (commit pending).');
}
