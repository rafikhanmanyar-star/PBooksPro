import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from '../../../utils/dateOnly.js';
import { roundMoney } from '../../../financial/validation.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import type { ChangeLogAction } from '../../organization/services/changeLogService.js';
import { SYS_EXPENSE_SUMMARY } from '../../../constants/fiscalAccounts.js';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../../constants/globalSystemChart.js';
import { createCategory } from '../../accounting/services/categoriesService.js';
import { syncPeVJournalMirror, reversePeVJournalMirror } from '../../accounting/services/pevJournalPostingService.js';
import {
  ProjectExpenseVoucherRepository,
  type PeVStatus,
  type ProjectExpenseVoucherRow,
} from '../repositories/ProjectExpenseVoucherRepository.js';

export type { PeVStatus, ProjectExpenseVoucherRow };

async function auditPeV(
  client: pg.PoolClient,
  opts: {
    tenantId: string;
    userId?: string | null;
    entityId: string;
    auditAction: string;
    summary: string;
    newValue?: unknown;
    version?: number;
  }
): Promise<void> {
  const action: ChangeLogAction =
    opts.auditAction === 'delete' ? 'delete' : opts.auditAction === 'create' ? 'create' : 'update';
  await recordDomainMutation(client, {
    tenantId: opts.tenantId,
    userId: opts.userId,
    module: 'project_expense_voucher',
    entityType: 'project_expense_voucher',
    entityId: opts.entityId,
    action,
    auditAction: opts.auditAction,
    summary: opts.summary,
    newValue: opts.newValue,
    version: opts.version,
  });
}

function newId(): string {
  return randomUUID();
}

export function rowToPeVApi(row: ProjectExpenseVoucherRow): Record<string, unknown> {
  return {
    id: row.id,
    voucherNumber: row.voucher_number,
    voucherDate: formatPgDateToYyyyMmDd(row.voucher_date),
    projectId: row.project_id,
    expenseCategoryId: row.expense_category_id,
    vendorId: row.vendor_id ?? undefined,
    paymentSourceAccountId: row.payment_source_account_id,
    amount: Number(row.amount),
    description: row.description ?? undefined,
    documentId: row.document_id ?? undefined,
    status: row.status,
    journalEntryId: row.journal_entry_id ?? undefined,
    submittedAt: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at ?? undefined,
    submittedBy: row.submitted_by ?? undefined,
    approvedAt: row.approved_at instanceof Date ? row.approved_at.toISOString() : row.approved_at ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    rejectedAt: row.rejected_at instanceof Date ? row.rejected_at.toISOString() : row.rejected_at ?? undefined,
    rejectedBy: row.rejected_by ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    postedAt: row.posted_at instanceof Date ? row.posted_at.toISOString() : row.posted_at ?? undefined,
    postedBy: row.posted_by ?? undefined,
    createdBy: row.created_by ?? undefined,
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    ...(row.deleted_at
      ? { deletedAt: row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at }
      : {}),
  };
}

function parseDate(label: string, v: unknown): string {
  if (v == null || v === '') throw new Error(`${label} is required.`);
  try {
    return parseApiDateToYyyyMmDd(v);
  } catch {
    throw new Error(`Invalid ${label}.`);
  }
}

function pickVoucherBody(body: Record<string, unknown>, forUpdate = false) {
  const projectId = String(body.projectId ?? body.project_id ?? '').trim();
  if (!projectId) throw new Error('Project is required.');

  const expenseCategoryId = String(body.expenseCategoryId ?? body.expense_category_id ?? '').trim();
  if (!expenseCategoryId) throw new Error('Expense category is required.');

  const paymentSourceAccountId = String(
    body.paymentSourceAccountId ?? body.payment_source_account_id ?? ''
  ).trim();
  if (!paymentSourceAccountId) throw new Error('Payment source account is required.');

  const amount = roundMoney(Number(body.amount ?? 0));
  if (amount <= 0) throw new Error('Amount must be positive.');

  const vendorRaw = body.vendorId ?? body.vendor_id;
  const vendorId =
    vendorRaw != null && String(vendorRaw).trim() !== '' ? String(vendorRaw).trim() : null;

  const description =
    body.description != null && String(body.description).trim() !== ''
      ? String(body.description).trim()
      : null;

  const documentRaw = body.documentId ?? body.document_id;
  const documentId =
    documentRaw != null && String(documentRaw).trim() !== '' ? String(documentRaw).trim() : null;

  const dateRaw = body.voucherDate ?? body.voucher_date;
  const voucherDate =
    dateRaw != null && String(dateRaw).trim() !== ''
      ? parseDate('voucherDate', dateRaw)
      : formatPgDateToYyyyMmDd(new Date());

  const voucherNumber =
    body.voucherNumber != null || body.voucher_number != null
      ? String(body.voucherNumber ?? body.voucher_number).trim()
      : '';

  if (!forUpdate && !voucherNumber) {
    // auto-generated later
  }

  return {
    project_id: projectId,
    expense_category_id: expenseCategoryId,
    vendor_id: vendorId,
    payment_source_account_id: paymentSourceAccountId,
    amount,
    description,
    document_id: documentId,
    voucher_date: voucherDate,
    voucher_number: voucherNumber,
  };
}

async function generateVoucherNumber(
  client: pg.PoolClient,
  tenantId: string,
  voucherDate: string
): Promise<string> {
  const year = voucherDate.slice(0, 4);
  const prefix = `PEV-${year}-`;
  const r = await client.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM project_expense_vouchers
     WHERE tenant_id = $1 AND voucher_number LIKE $2 AND deleted_at IS NULL`,
    [tenantId, `${prefix}%`]
  );
  const seq = Number(r.rows[0]?.cnt ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function assertProjectExists(
  client: pg.PoolClient,
  tenantId: string,
  projectId: string
): Promise<void> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM projects WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [tenantId, projectId]
  );
  if (!r.rows[0]) throw new Error('Project not found.');
}

async function assertExpenseCategory(
  client: pg.PoolClient,
  tenantId: string,
  categoryId: string
): Promise<void> {
  const r = await client.query<{ id: string; type: string; is_hidden: boolean }>(
    `SELECT id, type, is_hidden FROM categories
     WHERE id = $1 AND deleted_at IS NULL
       AND (tenant_id = $2 OR tenant_id = $3)`,
    [categoryId, tenantId, GLOBAL_SYSTEM_TENANT_ID]
  );
  const cat = r.rows[0];
  if (!cat) throw new Error('Expense category not found.');
  if (String(cat.type).trim() !== 'Expense') {
    throw new Error('Selected category must be an expense category.');
  }
  if (cat.is_hidden) throw new Error('Expense category is not available.');
}

async function findExpenseCategoryByName(
  client: pg.PoolClient,
  tenantId: string,
  name: string
): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM categories
     WHERE deleted_at IS NULL AND type = 'Expense' AND lower(name) = lower($1)
       AND (tenant_id = $2 OR tenant_id = $3)
     ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END, name
     LIMIT 1`,
    [name.trim(), tenantId, GLOBAL_SYSTEM_TENANT_ID]
  );
  return r.rows[0]?.id ?? null;
}

/** Resolve Settings category id from body; optionally create expense category on the fly. */
export async function resolveExpenseCategoryId(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>
): Promise<string> {
  const id = String(body.expenseCategoryId ?? body.expense_category_id ?? '').trim();
  if (id) {
    await assertExpenseCategory(client, tenantId, id);
    return id;
  }
  const name = String(body.categoryName ?? body.category_name ?? '').trim();
  if (!name) throw new Error('Expense category is required.');
  const existing = await findExpenseCategoryByName(client, tenantId, name);
  if (existing) return existing;
  const created = await createCategory(client, tenantId, { name, type: 'Expense' });
  return created.id;
}

export async function listProjectExpenseVouchers(
  client: pg.PoolClient,
  tenantId: string,
  filters?: {
    status?: string;
    projectId?: string;
    expenseCategoryId?: string;
    vendorId?: string;
    fromDate?: string;
    toDate?: string;
  }
): Promise<ProjectExpenseVoucherRow[]> {
  return new ProjectExpenseVoucherRepository(tenantId).list(client, filters);
}

export async function getProjectExpenseVoucherById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ProjectExpenseVoucherRow | null> {
  return new ProjectExpenseVoucherRepository(tenantId).getById(client, id);
}

async function postJournalForVoucherRow(
  client: pg.PoolClient,
  tenantId: string,
  row: ProjectExpenseVoucherRow,
  actorUserId: string | null
): Promise<string> {
  await assertExpenseCategory(client, tenantId, row.expense_category_id);
  const postedRow: ProjectExpenseVoucherRow = {
    ...row,
    status: 'posted',
    posted_by: actorUserId,
    posted_at: new Date(),
  };
  const { journalEntryId } = await syncPeVJournalMirror(
    client,
    tenantId,
    postedRow,
    SYS_EXPENSE_SUMMARY,
    actorUserId
  );
  if (!journalEntryId) throw new Error('Failed to post journal entry.');
  return journalEntryId;
}

export async function createProjectExpenseVoucher(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  createdBy: string | null
): Promise<{ row: ProjectExpenseVoucherRow; journalEntryId: string }> {
  const expenseCategoryId = await resolveExpenseCategoryId(client, tenantId, body);
  const picked = pickVoucherBody({ ...body, expenseCategoryId });
  await assertProjectExists(client, tenantId, picked.project_id);
  await assertExpenseCategory(client, tenantId, picked.expense_category_id);

  const id = String(body.id ?? '').trim() || newId();
  const voucherNumber =
    picked.voucher_number || (await generateVoucherNumber(client, tenantId, picked.voucher_date));

  const repo = new ProjectExpenseVoucherRepository(tenantId);
  await repo.insertPosted(client, id, { ...picked, voucher_number: voucherNumber }, createdBy);

  let row = await getProjectExpenseVoucherById(client, tenantId, id);
  if (!row) throw new Error('Failed to create voucher.');

  const journalEntryId = await postJournalForVoucherRow(client, tenantId, row, createdBy);

  await repo.setJournalEntryId(client, id, journalEntryId);

  row = (await getProjectExpenseVoucherById(client, tenantId, id))!;
  if (!row) throw new Error('Failed to load voucher after posting.');

  await auditPeV(client, {
    tenantId,
    userId: createdBy,
    entityId: id,
    auditAction: 'create',
    summary: `PEV ${voucherNumber} recorded`,
    newValue: { voucherNumber, amount: picked.amount, projectId: picked.project_id, journalEntryId },
    version: row.version,
  });

  return { row, journalEntryId };
}

export async function updateProjectExpenseVoucher(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{ row: ProjectExpenseVoucherRow | null; conflict?: boolean }> {
  const repo = new ProjectExpenseVoucherRepository(tenantId);
  const row = await repo.getByIdForUpdate(client, id);
  if (!row) return { row: null };

  const expectedVersion =
    body.version != null && Number.isFinite(Number(body.version)) ? Number(body.version) : undefined;
  const { conflict } = await checkEntityLwwConflict(client, {
    tenantId,
    table: 'project_expense_vouchers',
    entityId: id,
    clientVersion: expectedVersion,
  });
  if (conflict) return { row, conflict: true };

  const expenseCategoryId = await resolveExpenseCategoryId(client, tenantId, body);
  const picked = pickVoucherBody({ ...body, expenseCategoryId }, true);
  await assertProjectExists(client, tenantId, picked.project_id);
  await assertExpenseCategory(client, tenantId, picked.expense_category_id);

  await repo.updatePosted(client, id, picked, actorUserId);

  let updated = await getProjectExpenseVoucherById(client, tenantId, id);
  if (!updated) return { row: null };

  const journalEntryId = await postJournalForVoucherRow(client, tenantId, updated, actorUserId);
  await repo.setJournalEntryId(client, id, journalEntryId);
  updated = await getProjectExpenseVoucherById(client, tenantId, id);

  if (updated) {
    await auditPeV(client, {
      tenantId,
      userId: actorUserId,
      entityId: id,
      auditAction: 'update',
      summary: `PEV ${updated.voucher_number} updated`,
      newValue: { journalEntryId },
      version: updated.version,
    });
  }
  return { row: updated };
}

export async function submitProjectExpenseVoucher(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  actorUserId: string | null
): Promise<ProjectExpenseVoucherRow> {
  const row = await getProjectExpenseVoucherForUpdate(client, tenantId, id);
  if (row.status !== 'draft') throw new Error('Only draft vouchers can be submitted.');

  await new ProjectExpenseVoucherRepository(tenantId).markSubmitted(client, id, actorUserId);

  const updated = await getProjectExpenseVoucherById(client, tenantId, id);
  if (!updated) throw new Error('Voucher not found after submit.');

  await auditPeV(client, {
    tenantId,
    userId: actorUserId,
    entityId: id,
    auditAction: 'submit',
    summary: `PEV ${updated.voucher_number} submitted`,
    version: updated.version,
  });
  return updated;
}

export async function approveProjectExpenseVoucher(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  actorUserId: string | null
): Promise<ProjectExpenseVoucherRow> {
  const row = await getProjectExpenseVoucherForUpdate(client, tenantId, id);
  if (row.status !== 'submitted') throw new Error('Only submitted vouchers can be approved.');

  await new ProjectExpenseVoucherRepository(tenantId).markApproved(client, id, actorUserId);

  const updated = await getProjectExpenseVoucherById(client, tenantId, id);
  if (!updated) throw new Error('Voucher not found after approval.');

  await auditPeV(client, {
    tenantId,
    userId: actorUserId,
    entityId: id,
    auditAction: 'approve',
    summary: `PEV ${updated.voucher_number} approved`,
    version: updated.version,
  });
  return updated;
}

export async function rejectProjectExpenseVoucher(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  actorUserId: string | null,
  reason?: string | null
): Promise<ProjectExpenseVoucherRow> {
  const row = await getProjectExpenseVoucherForUpdate(client, tenantId, id);
  if (row.status !== 'submitted') throw new Error('Only submitted vouchers can be rejected.');

  await new ProjectExpenseVoucherRepository(tenantId).markRejected(
    client,
    id,
    actorUserId,
    reason?.trim() || null
  );

  const updated = await getProjectExpenseVoucherById(client, tenantId, id);
  if (!updated) throw new Error('Voucher not found after rejection.');

  await auditPeV(client, {
    tenantId,
    userId: actorUserId,
    entityId: id,
    auditAction: 'reject',
    summary: `PEV ${updated.voucher_number} rejected`,
    newValue: { reason: reason ?? null },
    version: updated.version,
  });
  return updated;
}

export async function postProjectExpenseVoucher(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  actorUserId: string | null
): Promise<{ row: ProjectExpenseVoucherRow; journalEntryId: string }> {
  const row = await getProjectExpenseVoucherForUpdate(client, tenantId, id);
  if (row.status !== 'approved') throw new Error('Only approved vouchers can be posted.');

  await assertExpenseCategory(client, tenantId, row.expense_category_id);

  const postedRow: ProjectExpenseVoucherRow = {
    ...row,
    status: 'posted',
    posted_by: actorUserId,
    posted_at: new Date(),
  };

  const { journalEntryId } = await syncPeVJournalMirror(
    client,
    tenantId,
    postedRow,
    SYS_EXPENSE_SUMMARY,
    actorUserId
  );
  if (!journalEntryId) throw new Error('Failed to post journal entry.');

  await new ProjectExpenseVoucherRepository(tenantId).markPosted(client, id, actorUserId, journalEntryId);

  const updated = await getProjectExpenseVoucherById(client, tenantId, id);
  if (!updated) throw new Error('Voucher not found after posting.');

  await auditPeV(client, {
    tenantId,
    userId: actorUserId,
    entityId: id,
    auditAction: 'post',
    summary: `PEV ${updated.voucher_number} posted to GL`,
    newValue: { journalEntryId },
    version: updated.version,
  });

  return { row: updated, journalEntryId };
}

export async function softDeleteProjectExpenseVoucher(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  actorUserId: string | null,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict?: boolean }> {
  const row = await getProjectExpenseVoucherForUpdate(client, tenantId, id);

  const { conflict } = await checkEntityLwwConflict(client, {
    tenantId,
    table: 'project_expense_vouchers',
    entityId: id,
    clientVersion: expectedVersion,
  });
  if (conflict) return { ok: false, conflict: true };
  if (row.status === 'posted' || row.journal_entry_id) {
    await reversePeVJournalMirror(client, tenantId, id, actorUserId);
  }

  await new ProjectExpenseVoucherRepository(tenantId).markDeleted(client, id);

  await auditPeV(client, {
    tenantId,
    userId: actorUserId,
    entityId: id,
    auditAction: 'delete',
    summary: `PEV ${row.voucher_number} deleted`,
    version: row.version,
  });

  return { ok: true };
}

async function getProjectExpenseVoucherForUpdate(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ProjectExpenseVoucherRow> {
  const row = await new ProjectExpenseVoucherRepository(tenantId).getByIdForUpdate(client, id);
  if (!row) throw new Error('Voucher not found.');
  return row;
}

export async function unpostProjectExpenseVoucher(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  actorUserId: string | null
): Promise<ProjectExpenseVoucherRow> {
  const row = await getProjectExpenseVoucherForUpdate(client, tenantId, id);
  if (row.status !== 'posted') throw new Error('Only posted vouchers can be unposted.');

  await reversePeVJournalMirror(client, tenantId, id, actorUserId);

  await new ProjectExpenseVoucherRepository(tenantId).markUnposted(client, id);

  const updated = await getProjectExpenseVoucherById(client, tenantId, id);
  if (!updated) throw new Error('Voucher not found after unpost.');

  await auditPeV(client, {
    tenantId,
    userId: actorUserId,
    entityId: id,
    auditAction: 'unpost',
    summary: `PEV ${updated.voucher_number} unposted`,
    version: updated.version,
  });
  return updated;
}
