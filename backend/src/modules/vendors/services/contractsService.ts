import type pg from 'pg';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDdOptional } from '../../../utils/dateOnly.js';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import {
  ContractRepository,
  type ContractWriteFields,
} from '../repositories/ContractRepository.js';
import {
  contractRowToRetentionFields,
  pickRetentionFromBody,
  retentionFieldsToApi,
  retentionWriteParams,
} from './contractRetentionService.js';

export type ContractRow = {
  id: string;
  tenant_id: string;
  contract_number: string;
  name: string;
  project_id: string;
  vendor_id: string;
  total_amount: string;
  area: string | null;
  rate: string | null;
  start_date: Date | null;
  end_date: Date | null;
  status: string;
  category_ids: string | null;
  expense_category_items: string | null;
  terms_and_conditions: string | null;
  payment_terms: string | null;
  description: string | null;
  document_path: string | null;
  document_id: string | null;
  retention_type: string;
  retention_percentage: string | null;
  retention_amount: string | null;
  retention_release_method: string | null;
  retention_release_date: Date | null;
  retention_notes: string | null;
  retention_balance: string;
  retention_released: string;
  retention_release_by: string | null;
  approval_status: string;
  submitted_at: Date | null;
  submitted_by: string | null;
  approved_at: Date | null;
  approved_by: string | null;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function optDate(v: unknown): string | null {
  return parseApiDateToYyyyMmDdOptional(v);
}

function parseJsonArray(v: unknown): string {
  if (v == null) return '[]';
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v);
      return JSON.stringify(Array.isArray(p) ? p : []);
    } catch {
      return '[]';
    }
  }
  return '[]';
}

function parseExpenseItems(v: unknown): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'string' && v.trim()) return v;
  return null;
}

export function rowToContractApi(row: ContractRow): Record<string, unknown> {
  const sd = row.start_date ?? null;
  const ed = row.end_date ?? null;
  const base: Record<string, unknown> = {
    id: row.id,
    contractNumber: row.contract_number,
    name: row.name,
    projectId: row.project_id,
    vendorId: row.vendor_id,
    totalAmount: Number(row.total_amount) || 0,
    area: row.area != null && row.area !== '' ? Number(row.area) : undefined,
    rate: row.rate != null && row.rate !== '' ? Number(row.rate) : undefined,
    startDate: sd ? formatPgDateToYyyyMmDd(sd) : undefined,
    endDate: ed ? formatPgDateToYyyyMmDd(ed) : undefined,
    status: row.status,
    approvalStatus: row.approval_status ?? 'Approved',
    categoryIds: (() => {
      if (!row.category_ids) return [];
      try {
        const p = JSON.parse(row.category_ids);
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    })(),
    expenseCategoryItems: (() => {
      if (!row.expense_category_items) return undefined;
      try {
        return JSON.parse(row.expense_category_items);
      } catch {
        return undefined;
      }
    })(),
    termsAndConditions: row.terms_and_conditions ?? undefined,
    paymentTerms: row.payment_terms ?? undefined,
    description: row.description ?? undefined,
    documentPath: row.document_path ?? undefined,
    documentId: row.document_id ?? undefined,
    userId: row.user_id ?? undefined,
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    ...retentionFieldsToApi(contractRowToRetentionFields(row)),
  };
  if (row.deleted_at) {
    base.deletedAt = row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  return base;
}

function pickBody(body: Record<string, unknown>) {
  const totalRaw = body.totalAmount ?? body.total_amount;
  const total = Number(totalRaw);
  return {
    contract_number: String(body.contractNumber ?? body.contract_number ?? '').trim(),
    name: String(body.name ?? '').trim(),
    project_id: String(body.projectId ?? body.project_id ?? '').trim(),
    vendor_id: String(body.vendorId ?? body.vendor_id ?? '').trim(),
    total_amount: Number.isFinite(total) ? total : 0,
    area:
      body.area === undefined || body.area === null || body.area === ''
        ? undefined
        : Number(body.area),
    rate:
      body.rate === undefined || body.rate === null || body.rate === ''
        ? undefined
        : Number(body.rate),
    start_date: optDate(body.startDate ?? body.start_date),
    end_date: optDate(body.endDate ?? body.end_date),
    status: String(body.status ?? 'Active').trim() || 'Active',
    category_ids: parseJsonArray(body.categoryIds ?? body.category_ids),
    expense_category_items: parseExpenseItems(body.expenseCategoryItems ?? body.expense_category_items),
    terms_and_conditions:
      body.termsAndConditions === undefined && body.terms_and_conditions === undefined
        ? undefined
        : body.termsAndConditions === null || body.terms_and_conditions === null
          ? null
          : String(body.termsAndConditions ?? body.terms_and_conditions),
    payment_terms:
      body.paymentTerms === undefined && body.payment_terms === undefined
        ? undefined
        : body.paymentTerms === null || body.payment_terms === null
          ? null
          : String(body.paymentTerms ?? body.payment_terms),
    description:
      body.description === undefined ? undefined : body.description === null ? null : String(body.description),
    document_path:
      body.documentPath === undefined && body.document_path === undefined
        ? undefined
        : body.documentPath === null || body.document_path === null
          ? null
          : String(body.documentPath ?? body.document_path),
    document_id:
      body.documentId === undefined && body.document_id === undefined
        ? undefined
        : body.documentId === null || body.document_id === null
          ? null
          : String(body.documentId ?? body.document_id),
    user_id: (body.userId ?? body.user_id) as string | null | undefined,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

function contractWriteFields(
  p: ReturnType<typeof pickBody>,
  body: Record<string, unknown>
): ContractWriteFields {
  const retention = pickRetentionFromBody(body);
  const retentionDb = retentionWriteParams(p.total_amount, retention);
  return {
    contract_number: p.contract_number!,
    name: p.name!,
    project_id: p.project_id!,
    vendor_id: p.vendor_id!,
    total_amount: p.total_amount,
    area: p.area != null && Number.isFinite(p.area) ? p.area : null,
    rate: p.rate != null && Number.isFinite(p.rate) ? p.rate : null,
    start_date: p.start_date,
    end_date: p.end_date,
    status: p.status,
    category_ids: p.category_ids,
    expense_category_items: p.expense_category_items,
    terms_and_conditions: p.terms_and_conditions ?? null,
    payment_terms: p.payment_terms ?? null,
    description: p.description ?? null,
    document_path: p.document_path ?? null,
    document_id: p.document_id ?? null,
    retention_type: retentionDb.retention_type,
    retention_percentage: retentionDb.retention_percentage,
    retention_amount: retentionDb.retention_amount,
    retention_release_method: retentionDb.retention_release_method,
    retention_release_date: retentionDb.retention_release_date,
    retention_notes: retentionDb.retention_notes,
    retention_balance: retentionDb.retention_balance,
    retention_released: retentionDb.retention_released,
    retention_release_by: retention.retentionReleaseBy ?? null,
  };
}

export async function listContracts(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { status?: string; projectId?: string; vendorId?: string }
): Promise<ContractRow[]> {
  return new ContractRepository(tenantId).listActive(client, filters);
}

export async function listContractsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<ContractRow[]> {
  return new ContractRepository(tenantId).listChangedSince(client, since);
}

export async function getContractById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ContractRow | null> {
  return new ContractRepository(tenantId).getById(client, id);
}

export async function getContractByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ContractRow | null> {
  return new ContractRepository(tenantId).getByIdIncludingDeleted(client, id);
}

export async function upsertContract(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{ row: ContractRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.contract_number) throw new Error('contractNumber is required.');
  if (!p.name) throw new Error('name is required.');
  if (!p.project_id) throw new Error('projectId is required.');
  if (!p.vendor_id) throw new Error('vendorId is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `cnt_${randomUUID().replace(/-/g, '')}`;

  const existing = await getContractByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const row = await insertContract(client, tenantId, { ...body, id }, actorUserId);
    return { row, conflict: false, wasInsert: true };
  }

  const expectedVersion = p.version;
  if (expectedVersion !== undefined) {
    if (existing.deleted_at) {
      if (existing.version !== expectedVersion) {
        return { row: existing, conflict: true, wasInsert: false };
      }
    } else {
      const lww = await checkEntityLwwConflict(client, {
        tenantId,
        table: 'contracts',
        entityId: id,
        clientVersion: expectedVersion,
      });
      if (lww.conflict) return { row: existing, conflict: true, wasInsert: false };
    }
  }

  const oldApi = rowToContractApi(existing);

  const retentionBody = { ...body };
  if (
    retentionBody.retentionReleased === undefined &&
    retentionBody.retention_released === undefined &&
    existing.retention_released != null
  ) {
    retentionBody.retentionReleased = Number(existing.retention_released) || 0;
  }

  const row = await new ContractRepository(tenantId).updateUpsert(client, id, contractWriteFields(p, retentionBody));
  if (!row) throw new Error('Upsert failed.');
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'contracts',
    entityType: 'contract',
    entityId: row.id,
    action: 'update',
    summary: `Contract ${row.contract_number} updated`,
    newValue: rowToContractApi(row),
    oldValue: oldApi,
    version: row.version,
  });
  return { row, conflict: false, wasInsert: false };
}

async function insertContract(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<ContractRow> {
  const p = pickBody(body);
  if (!p.contract_number) throw new Error('contractNumber is required.');
  if (!p.name) throw new Error('name is required.');
  if (!p.project_id) throw new Error('projectId is required.');
  if (!p.vendor_id) throw new Error('vendorId is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `cnt_${randomUUID().replace(/-/g, '')}`;

  const uid =
    p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId && String(actorUserId).trim()
      ? String(actorUserId).trim()
      : null;

  const row = await new ContractRepository(tenantId).insertContract(
    client,
    id,
    contractWriteFields(p, body),
    uid
  );
  await maybeInitContractWorkflowDraft(client, tenantId, row.id, actorUserId);
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'contracts',
    entityType: 'contract',
    entityId: row.id,
    action: 'create',
    summary: `Contract ${row.contract_number} created`,
    newValue: rowToContractApi(row),
    version: row.version,
  });
  return row;
}

export async function softDeleteContract(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  const ex = await getContractByIdIncludingDeleted(client, tenantId, id);
  const oldApi = ex ? rowToContractApi(ex) : undefined;

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'contracts',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const ok = await new ContractRepository(tenantId).markDeleted(client, id, expectedVersion);
    if (!ok) {
      const exists = await getContractById(client, tenantId, id);
      if (!exists) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    await recordDomainMutation(client, {
      tenantId,
      userId: ex?.user_id ?? null,
      module: 'contracts',
      entityType: 'contract',
      entityId: id,
      action: 'delete',
      summary: `Contract ${ex?.contract_number ?? id} deleted`,
      oldValue: oldApi,
    });
    return { ok: true, conflict: false };
  }
  const ok = await new ContractRepository(tenantId).markDeleted(client, id);
  if (ok) {
    await recordDomainMutation(client, {
      tenantId,
      userId: ex?.user_id ?? null,
      module: 'contracts',
      entityType: 'contract',
      entityId: id,
      action: 'delete',
      summary: `Contract ${ex?.contract_number ?? id} deleted`,
      oldValue: oldApi,
    });
  }
  return { ok, conflict: false };
}

async function maybeInitContractWorkflowDraft(
  client: pg.PoolClient,
  tenantId: string,
  contractId: string,
  actorUserId: string | null
): Promise<void> {
  const { isApprovalWorkflowEnabled } = await import('../../workflow/services/workflowSettingsService.js');
  if (!(await isApprovalWorkflowEnabled(client, tenantId))) return;
  const { setApprovalLifecycleStatus } = await import('../../workflow/services/approvalLifecycleService.js');
  await client.query(
    `UPDATE contracts SET status = 'Pending', updated_at = NOW(), version = version + 1
     WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [tenantId, contractId]
  );
  await setApprovalLifecycleStatus(client, tenantId, 'contracts', contractId, 'Draft', actorUserId);
}

export async function submitContractForApproval(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion: number | undefined,
  userId: string | null,
  requesterRole?: string | null
) {
  const row = await getContractById(client, tenantId, id);
  if (!row) throw new Error('Contract not found.');
  if (String(row.approval_status ?? 'Approved') !== 'Draft') {
    throw new Error('Only draft contracts can be submitted for approval.');
  }
  if (expectedVersion != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'contracts',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { conflict: true as const, serverVersion: row.version };
  }
  const { submitDomainEntityForApproval } = await import(
    '../../workflow/services/workflowDomainSubmitService.js'
  );
  const result = await submitDomainEntityForApproval(
    client,
    tenantId,
    'contract',
    id,
    userId,
    requesterRole ?? null
  );
  const updated = await getContractById(client, tenantId, id);
  if (!updated) throw new Error('Contract not found after submit.');
  return { conflict: false as const, row: updated, workflowMode: result.mode, approvalRequest: result.request };
}

export async function approveContract(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion: number | undefined,
  userId: string | null
) {
  const row = await getContractById(client, tenantId, id);
  if (!row) throw new Error('Contract not found.');
  if (expectedVersion != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'contracts',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { conflict: true as const, serverVersion: row.version };
  }
  const { approveDomainEntityWithWorkflowGate } = await import(
    '../../workflow/services/workflowDomainSubmitService.js'
  );
  const { setApprovalLifecycleStatus } = await import('../../workflow/services/approvalLifecycleService.js');
  const result = await approveDomainEntityWithWorkflowGate(
    client,
    tenantId,
    'contract',
    id,
    userId,
    async () => {
      const current = await getContractById(client, tenantId, id);
      if (!current) throw new Error('Contract not found.');
      const contractStatus =
        current.status === 'Pending' || current.status === 'Draft' ? 'Active' : current.status;
      await setApprovalLifecycleStatus(client, tenantId, 'contracts', id, 'Approved', userId, {
        contractStatus,
      });
      const updated = await getContractById(client, tenantId, id);
      if (!updated) throw new Error('Contract not found after approve.');
      return { snapshot: rowToContractApi(updated) };
    }
  );
  const updated = await getContractById(client, tenantId, id);
  if (!updated) throw new Error('Contract not found after approve.');
  return { conflict: false as const, row: updated, ...result };
}
