import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { JournalRepository } from '../modules/accounting/repositories/JournalRepository.js';
import { roundMoney } from '../financial/validation.js';
import { allocateAdvancesFifo, type AdvanceRemains } from './contractorFifo.js';
import { getContactById } from './contactsService.js';
import { getVendorById } from './vendorsService.js';
import { ContactRepository } from '../modules/crm/repositories/ContactRepository.js';
import { ContractorAdvanceRepository } from '../modules/vendors/repositories/ContractorAdvanceRepository.js';
import { ContractorBillRepository } from '../modules/vendors/repositories/ContractorBillRepository.js';

const MONEY_EPS = 0.005;

export type ContractorAdvanceRow = {
  id: string;
  tenant_id: string;
  contractor_contact_id: string;
  advance_date: string;
  original_amount: string;
  remaining_amount: string;
  cash_account_id: string;
  advance_asset_account_id: string;
  advance_journal_entry_id: string | null;
  project_id: string | null;
  description: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type ContractorBillRow = {
  id: string;
  tenant_id: string;
  contractor_contact_id: string;
  bill_number: string | null;
  bill_date: string;
  amount: string;
  status: string;
  description: string | null;
  project_id: string | null;
  construction_expense_account_id: string;
  residual_account_id: string;
  approval_journal_entry_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type ContractorBillAdjustmentRow = {
  id: string;
  tenant_id: string;
  contractor_bill_id: string;
  contractor_advance_id: string;
  amount: string;
  created_at: Date;
};

function parseMoney(v: string | number): number {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) throw new Error('Invalid money value');
  return n;
}

function newId(): string {
  return randomUUID();
}

export function rowAdvanceToApi(row: ContractorAdvanceRow): Record<string, unknown> {
  return {
    id: row.id,
    contractorContactId: row.contractor_contact_id,
    advanceDate: row.advance_date,
    originalAmount: parseMoney(row.original_amount),
    remainingAmount: parseMoney(row.remaining_amount),
    cashAccountId: row.cash_account_id,
    advanceAssetAccountId: row.advance_asset_account_id,
    advanceJournalEntryId: row.advance_journal_entry_id ?? undefined,
    projectId: row.project_id ?? undefined,
    description: row.description ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export function rowBillToApi(row: ContractorBillRow): Record<string, unknown> {
  return {
    id: row.id,
    contractorContactId: row.contractor_contact_id,
    billNumber: row.bill_number ?? undefined,
    billDate: row.bill_date,
    amount: parseMoney(row.amount),
    status: row.status,
    description: row.description ?? undefined,
    projectId: row.project_id ?? undefined,
    constructionExpenseAccountId: row.construction_expense_account_id,
    residualAccountId: row.residual_account_id,
    approvalJournalEntryId: row.approval_journal_entry_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

async function auditContractorAdvance(
  client: pg.PoolClient,
  params: {
    tenantId: string;
    userId: string | null;
    entityId: string;
    action: 'create' | 'update';
    summary: string;
    row: ContractorAdvanceRow;
  }
): Promise<void> {
  await recordDomainMutation(client, {
    tenantId: params.tenantId,
    userId: params.userId,
    module: 'contractors',
    entityType: 'contractor_advance',
    entityId: params.entityId,
    action: params.action,
    summary: params.summary,
    newValue: rowAdvanceToApi(params.row),
  });
}

async function auditContractorBill(
  client: pg.PoolClient,
  params: {
    tenantId: string;
    userId: string | null;
    entityId: string;
    action: 'create' | 'update';
    summary: string;
    row: ContractorBillRow;
    extra?: Record<string, unknown>;
  }
): Promise<void> {
  await recordDomainMutation(client, {
    tenantId: params.tenantId,
    userId: params.userId,
    module: 'contractors',
    entityType: 'contractor_bill',
    entityId: params.entityId,
    action: params.action,
    summary: params.summary,
    newValue: params.extra ? { ...rowBillToApi(params.row), ...params.extra } : rowBillToApi(params.row),
  });
}

export async function assertContactInTenant(client: pg.PoolClient, tenantId: string, contactId: string): Promise<void> {
  const c = await getContactById(client, tenantId, contactId);
  if (!c || c.deleted_at != null) {
    throw new Error('Contact not found or inactive.');
  }
}

/**
 * contractor_* rows reference contacts(id). Vendor Directory uses vendors(id). Clients may send either id.
 * If the party exists only as a vendor, create/reactivate a Vendor-type contact row using the same id (bridge row).
 */
export async function resolveContractorPartyToContactId(
  client: pg.PoolClient,
  tenantId: string,
  partyIdRaw: string
): Promise<string> {
  const partyId = partyIdRaw.trim();
  if (!partyId) throw new Error('Supplier party id is required.');

  const activeContact = await getContactById(client, tenantId, partyId);
  if (activeContact) return activeContact.id;

  const vendor = await getVendorById(client, tenantId, partyId);
  if (!vendor) {
    throw new Error('Contact not found or inactive.');
  }

  const contactRepo = new ContactRepository(tenantId);
  const bridgeFields = {
    name: vendor.name,
    type: 'Vendor',
    description: vendor.description,
    contact_no: vendor.contact_no,
    company_name: vendor.company_name,
    address: vendor.address,
  };
  await contactRepo.upsertVendorBridgeContact(client, partyId, bridgeFields, vendor.user_id);

  const bridged = await getContactById(client, tenantId, partyId);
  if (bridged) return bridged.id;

  const revivedId = await contactRepo.reviveVendorBridgeContact(
    client,
    partyId,
    bridgeFields,
    vendor.user_id
  );
  if (revivedId) return revivedId;

  throw new Error('Contact not found or inactive.');
}

export async function resolvePartyIdFromVendorBill(
  client: pg.PoolClient,
  tenantId: string,
  bill: { contact_id: string | null; vendor_id: string | null }
): Promise<string | null> {
  const tried = new Set<string>();
  for (const raw of [bill.contact_id, bill.vendor_id]) {
    if (!raw?.trim()) continue;
    const id = raw.trim();
    if (tried.has(id)) continue;
    tried.add(id);
    try {
      return await resolveContractorPartyToContactId(client, tenantId, id);
    } catch {
      continue;
    }
  }
  return null;
}

export type CreateContractorAdvanceInput = {
  contractorContactId: string;
  advanceDate: string;
  amount: number;
  cashAccountId: string;
  advanceAssetAccountId: string;
  projectId?: string | null;
  description?: string | null;
  reference?: string | null;
};

export async function createContractorAdvance(
  client: pg.PoolClient,
  tenantId: string,
  input: CreateContractorAdvanceInput,
  createdBy: string | null
): Promise<ContractorAdvanceRow> {
  const amt = roundMoney(input.amount);
  if (amt <= 0) throw new Error('Advance amount must be positive.');
  const contractorContactId = await resolveContractorPartyToContactId(client, tenantId, input.contractorContactId);

  const id = newId();
  const projectId =
    input.projectId != null && String(input.projectId).trim() !== '' ? String(input.projectId).trim() : null;
  await new ContractorAdvanceRepository(tenantId).insertAdvance(client, {
    id,
    contractor_contact_id: contractorContactId,
    advance_date: input.advanceDate,
    amount: amt,
    cash_account_id: input.cashAccountId,
    advance_asset_account_id: input.advanceAssetAccountId,
    project_id: projectId,
    description: input.description ?? null,
    created_by: createdBy,
  });

  const { journalEntryId } = await new JournalRepository(tenantId).insertEntry(client, {
    entryDate: input.advanceDate,
    reference: input.reference?.trim() || `ADV:${id}`,
    description: input.description ?? 'Contractor advance payment',
    sourceModule: 'contractor_advance',
    sourceId: id,
    createdBy,
    projectId,
    lines: [
      {
        accountId: input.advanceAssetAccountId,
        debitAmount: amt,
        creditAmount: 0,
        projectId,
      },
      {
        accountId: input.cashAccountId,
        debitAmount: 0,
        creditAmount: amt,
        projectId,
      },
    ],
  });

  await new ContractorAdvanceRepository(tenantId).setAdvanceJournalEntryId(client, id, journalEntryId);

  const row = await new ContractorAdvanceRepository(tenantId).getById(client, id);
  if (!row) throw new Error('Advance not found after create.');

  await auditContractorAdvance(client, {
    tenantId,
    userId: createdBy,
    entityId: id,
    action: 'create',
    summary: `Contractor advance ${id} recorded`,
    row,
  });
  return row;
}

export type CreateContractorBillInput = {
  contractorContactId: string;
  billNumber?: string | null;
  billDate: string;
  amount: number;
  description?: string | null;
  projectId?: string | null;
  constructionExpenseAccountId: string;
  residualAccountId: string;
};

export async function createContractorBill(
  client: pg.PoolClient,
  tenantId: string,
  input: CreateContractorBillInput,
  createdBy: string | null
): Promise<ContractorBillRow> {
  const amt = roundMoney(input.amount);
  if (amt <= 0) throw new Error('Bill amount must be positive.');
  const contractorContactId = await resolveContractorPartyToContactId(client, tenantId, input.contractorContactId);
  const id = newId();
  const bn =
    input.billNumber != null && String(input.billNumber).trim() !== ''
      ? String(input.billNumber).trim()
      : null;
  const projectId =
    input.projectId != null && String(input.projectId).trim() !== '' ? String(input.projectId).trim() : null;
  const billRepo = new ContractorBillRepository(tenantId);
  try {
    await billRepo.insertBill(client, {
      id,
      contractor_contact_id: contractorContactId,
      bill_number: bn,
      bill_date: input.billDate,
      amount: amt,
      description: input.description ?? null,
      project_id: projectId,
      construction_expense_account_id: input.constructionExpenseAccountId,
      residual_account_id: input.residualAccountId,
      created_by: createdBy,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      throw new Error('Duplicate bill number for this tenant.');
    }
    throw e;
  }
  const row = await new ContractorBillRepository(tenantId).getById(client, id);
  if (!row) throw new Error('Bill not found after create.');

  await auditContractorBill(client, {
    tenantId,
    userId: createdBy,
    entityId: id,
    action: 'create',
    summary: `Contractor bill ${bn ?? id} created`,
    row,
  });
  return row;
}

export type AdjustmentInput = { advanceId: string; amount: number };

export type ApproveContractorBillOpts = {
  entryDate?: string;
  reference?: string | null;
  description?: string | null;
  residualAccountId?: string | null;
};

export async function approveContractorBill(
  client: pg.PoolClient,
  tenantId: string,
  billId: string,
  adjustments: AdjustmentInput[],
  createdBy: string | null,
  opts?: ApproveContractorBillOpts
): Promise<{ bill: ContractorBillRow; journalEntryId: string }> {
  if (!adjustments?.length) {
    throw new Error('At least one adjustment is required.');
  }

  const billRepo = new ContractorBillRepository(tenantId);
  const advanceRepo = new ContractorAdvanceRepository(tenantId);

  const bill = await billRepo.getByIdForUpdate(client, billId);
  if (!bill) throw new Error('Bill not found.');
  if (bill.status !== 'draft') {
    throw new Error('Bill is not in draft status; cannot approve again.');
  }

  const billAmount = roundMoney(parseMoney(bill.amount));
  const contractorId = bill.contractor_contact_id;

  const uniqAdvanceIds = [...new Set(adjustments.map((a) => a.advanceId))];
  uniqAdvanceIds.sort();

  let adjustmentSumNonRounded = 0;
  const byAdvance = new Map<string, number>();
  for (const adj of adjustments) {
    const a = roundMoney(adj.amount);
    if (a <= 0) throw new Error('Each adjustment amount must be positive.');
    adjustmentSumNonRounded += a;
    byAdvance.set(adj.advanceId, (byAdvance.get(adj.advanceId) ?? 0) + a);
  }
  const adjustmentSum = roundMoney(adjustmentSumNonRounded);

  if (adjustmentSum > billAmount + MONEY_EPS) {
    throw new Error('Total adjustments exceed bill amount.');
  }

  const advanceRowsMap = new Map<string, ContractorAdvanceRow>();
  for (const aid of uniqAdvanceIds) {
    const row = await advanceRepo.getByIdForUpdate(client, aid);
    if (!row) throw new Error(`Advance not found: ${aid}`);
    if (row.contractor_contact_id !== contractorId) {
      throw new Error(`Advance ${aid} belongs to another contractor than this bill.`);
    }
    advanceRowsMap.set(aid, row);
  }

  let advanceGlId: string | null = null;
  for (const aid of uniqAdvanceIds) {
    const row = advanceRowsMap.get(aid)!;
    const need = roundMoney(byAdvance.get(aid)!);
    const rem = roundMoney(parseMoney(row.remaining_amount));
    if (need > rem + MONEY_EPS) {
      throw new Error(`Adjustment exceeds remaining amount on advance ${aid}.`);
    }
    if (advanceGlId == null) advanceGlId = row.advance_asset_account_id;
    else if (advanceGlId !== row.advance_asset_account_id) {
      throw new Error(
        'All advances applied to one bill must use the same Advance to Contractor GL account (advance_asset_account_id).'
      );
    }
  }

  const residualAcct =
    opts?.residualAccountId != null && String(opts.residualAccountId).trim() !== ''
      ? String(opts.residualAccountId).trim()
      : bill.residual_account_id;
  const residual = roundMoney(billAmount - adjustmentSum);
  if (residual < -MONEY_EPS) throw new Error('Residual cannot be negative.');

  for (const [advanceIdAgg, totalAdj] of byAdvance.entries()) {
    const adjRowId = newId();
    const rounded = roundMoney(totalAdj);
    await billRepo.insertBillAdjustment(client, {
      id: adjRowId,
      contractor_bill_id: billId,
      contractor_advance_id: advanceIdAgg,
      amount: rounded,
    });
    await advanceRepo.adjustRemaining(client, advanceIdAgg, -rounded);
  }

  const entryDate = opts?.entryDate?.trim() ? opts.entryDate.trim() : bill.bill_date;
  const projectId =
    bill.project_id != null && String(bill.project_id).trim() !== '' ? String(bill.project_id).trim() : null;

  const expenseLine = bill.construction_expense_account_id;
  const advanceAcct = advanceGlId!;
  const lines = [
    { accountId: expenseLine, debitAmount: billAmount, creditAmount: 0, projectId },
    { accountId: advanceAcct, debitAmount: 0, creditAmount: adjustmentSum, projectId },
  ];
  if (residual > MONEY_EPS) {
    lines.push({ accountId: residualAcct, debitAmount: 0, creditAmount: residual, projectId });
  }

  const { journalEntryId } = await new JournalRepository(tenantId).insertEntry(client, {
    entryDate,
    reference: opts?.reference?.trim() ? opts.reference.trim() : `CTR-BILL:${billId}`,
    description: opts?.description ?? bill.description ?? 'Contractor bill approved',
    sourceModule: 'contractor_bill',
    sourceId: billId,
    createdBy,
    projectId,
    lines,
  });

  await billRepo.markApproved(client, billId, journalEntryId);

  const updatedBill = await billRepo.getById(client, billId);
  if (!updatedBill) throw new Error('Bill not found after approval.');

  await auditContractorBill(client, {
    tenantId,
    userId: createdBy,
    entityId: billId,
    action: 'update',
    summary: `Contractor bill ${updatedBill.bill_number ?? billId} approved`,
    row: updatedBill,
    extra: { journalEntryId },
  });

  for (const aid of uniqAdvanceIds) {
    const refreshedAdvance = await advanceRepo.getById(client, aid);
    if (!refreshedAdvance) continue;
    await auditContractorAdvance(client, {
      tenantId,
      userId: createdBy,
      entityId: aid,
      action: 'update',
      summary: `Advance ${aid} applied to bill ${billId}`,
      row: refreshedAdvance,
    });
  }

  return { bill: updatedBill, journalEntryId };
}

/** Single advance row for vendor prepaid (API settlement updates description / remaining_amount). */
export async function getContractorAdvanceById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ContractorAdvanceRow | null> {
  return new ContractorAdvanceRepository(tenantId).getById(client, id);
}

export async function listContractorAdvances(
  client: pg.PoolClient,
  tenantId: string,
  contractorContactId: string
): Promise<ContractorAdvanceRow[]> {
  return new ContractorAdvanceRepository(tenantId).listByContractor(client, contractorContactId);
}

export type LedgerAdjustmentLine = {
  id: string;
  contractorBillId: string;
  billNumber: string | undefined;
  billDate: string;
  billAmount: number;
  advanceId: string;
  adjustmentAmount: number;
  adjustmentCreatedAt: string;
};

export type ContractorLedgerResult = {
  advances: ContractorAdvanceRow[];
  adjustments: LedgerAdjustmentLine[];
  summary: {
    totalOriginalAmount: number;
    totalRemainingAmount: number;
  };
};

export async function getContractorLedger(
  client: pg.PoolClient,
  tenantId: string,
  contractorContactId: string
): Promise<ContractorLedgerResult> {
  const resolvedContactId = await resolveContractorPartyToContactId(client, tenantId, contractorContactId);
  const advances = await listContractorAdvances(client, tenantId, resolvedContactId);

  type AdjQr = ContractorBillAdjustmentRow & {
    bill_number: string | null;
    bill_date: string;
    bill_amount: string;
  };
  const aj = await client.query<AdjQr>(
    `SELECT cba.id, cba.tenant_id, cba.contractor_bill_id, cba.contractor_advance_id,
            cba.amount::text AS amount, cba.created_at,
            cb.bill_number, cb.bill_date AS bill_date, cb.amount::text AS bill_amount
     FROM contractor_bill_adjustments cba
     INNER JOIN contractor_bills cb ON cb.id = cba.contractor_bill_id AND cb.tenant_id = cba.tenant_id
     WHERE cba.tenant_id = $1 AND cb.contractor_contact_id = $2 AND cb.deleted_at IS NULL
     ORDER BY cba.created_at ASC, cba.id ASC`,
    [tenantId, resolvedContactId]
  );

  const adjustments: LedgerAdjustmentLine[] = aj.rows.map((row) => ({
    id: row.id,
    contractorBillId: row.contractor_bill_id,
    billNumber: row.bill_number ?? undefined,
    billDate: typeof row.bill_date === 'string' ? row.bill_date : String(row.bill_date),
    billAmount: parseMoney(row.bill_amount),
    advanceId: row.contractor_advance_id,
    adjustmentAmount: parseMoney(row.amount),
    adjustmentCreatedAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));

  let totalOriginal = 0;
  let totalRemaining = 0;
  for (const a of advances) {
    totalOriginal = roundMoney(totalOriginal + parseMoney(a.original_amount));
    totalRemaining = roundMoney(totalRemaining + parseMoney(a.remaining_amount));
  }

  return {
    advances,
    adjustments,
    summary: {
      totalOriginalAmount: totalOriginal,
      totalRemainingAmount: totalRemaining,
    },
  };
}

/** Load advancesWith remaining for FIFO; returns suggestion only. */
export async function previewFifoAdjustmentsForBill(
  client: pg.PoolClient,
  tenantId: string,
  contractorContactId: string,
  billAmount: number
): Promise<{ advanceId: string; amount: number }[]> {
  let partyKey = contractorContactId.trim();
  try {
    partyKey = await resolveContractorPartyToContactId(client, tenantId, contractorContactId);
  } catch {
    // unknown party — list will be empty
  }
  const rows = await listContractorAdvances(client, tenantId, partyKey);
  const remains: AdvanceRemains[] = rows
    .filter((r) => parseMoney(r.remaining_amount) > MONEY_EPS)
    .map((r) => ({
      id: r.id,
      advanceDate: r.advance_date,
      remainingAmount: parseMoney(r.remaining_amount),
    }));
  return allocateAdvancesFifo(remains, billAmount);
}
