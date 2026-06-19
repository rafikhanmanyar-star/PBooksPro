import type pg from 'pg';
import { randomUUID } from 'crypto';
import {
  formatPgDateToYyyyMmDd,
  parseApiDateToYyyyMmDd,
  parseApiDateToYyyyMmDdOptional,
} from '../../../utils/dateOnly.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import {
  PurchaseOrderLineRepository,
  PurchaseOrderRepository,
  type PurchaseOrderLineWrite,
  type PurchaseOrderRow,
  type PurchaseOrderWriteFields,
} from '../repositories/PurchaseOrderRepository.js';
import type { PurchaseOrderLifecycleStatus } from '../../../procurement/purchaseOrderBillingCore.js';

const VALID_STATUSES: PurchaseOrderLifecycleStatus[] = [
  'Draft',
  'Submitted',
  'Approved',
  'Partially Billed',
  'Fully Billed',
  'Cancelled',
];

function parseItems(v: unknown): unknown[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function lineToApi(item: Record<string, unknown>, idx: number) {
  const qty = Number(item.quantity ?? 0);
  const unitRate = Number(item.unitRate ?? item.unit_rate ?? item.unitPrice ?? 0);
  const taxPercent = Number(item.taxPercent ?? item.tax_percent ?? 0);
  const subtotal = qty * unitRate;
  const taxAmount = Number(item.taxAmount ?? item.tax_amount ?? (subtotal * taxPercent) / 100);
  const lineTotal = Number(item.lineTotal ?? item.line_total ?? item.total ?? subtotal + taxAmount);
  return {
    id: String(item.id ?? `po_line_${idx}`),
    itemId: item.itemId ?? item.item_id ? String(item.itemId ?? item.item_id) : undefined,
    itemName: item.itemName ?? item.item_name ? String(item.itemName ?? item.item_name) : undefined,
    description: item.description != null ? String(item.description) : undefined,
    categoryId: item.categoryId ?? item.category_id ? String(item.categoryId ?? item.category_id) : undefined,
    quantity: qty,
    unitRate,
    taxPercent,
    taxAmount,
    lineTotal,
  };
}

export function rowToPurchaseOrderApi(row: PurchaseOrderRow): Record<string, unknown> {
  const items = parseItems(row.items).map((raw, idx) =>
    raw && typeof raw === 'object' ? lineToApi(raw as Record<string, unknown>, idx) : lineToApi({}, idx)
  );
  return {
    id: row.id,
    poNumber: row.po_number,
    vendorId: row.vendor_id,
    quotationId: row.quotation_id ?? undefined,
    comparisonSessionId: row.comparison_session_id ?? undefined,
    projectId: row.project_id ?? undefined,
    buildingId: row.building_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    totalAmount: Number(row.total_amount),
    billedAmount: Number(row.billed_amount),
    receivedAmount: Number(row.received_amount ?? 0),
    taxAmount: Number(row.tax_amount),
    status: row.status,
    items,
    paymentTerms: row.payment_terms ?? undefined,
    deliveryPeriod: row.delivery_period ?? undefined,
    warrantyPeriod: row.warranty_period ?? undefined,
    description: row.description ?? undefined,
    issueDate: formatPgDateToYyyyMmDd(row.issue_date) ?? '',
    requiredDate: formatPgDateToYyyyMmDd(row.required_date) ?? undefined,
    targetDeliveryDate: formatPgDateToYyyyMmDd(row.target_delivery_date) ?? undefined,
    currency: row.currency ?? 'PKR',
    createdBy: row.created_by ?? undefined,
    userId: row.user_id ?? undefined,
    submittedAt: row.submitted_at?.toISOString(),
    submittedBy: row.submitted_by ?? undefined,
    approvedAt: row.approved_at?.toISOString(),
    approvedBy: row.approved_by ?? undefined,
    cancelledAt: row.cancelled_at?.toISOString(),
    cancelledBy: row.cancelled_by ?? undefined,
    cancelReason: row.cancel_reason ?? undefined,
    closedAt: row.closed_at?.toISOString(),
    version: row.version,
    tenantId: row.tenant_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function itemsToLineWrites(items: unknown[], poId: string): PurchaseOrderLineWrite[] {
  return items
    .filter((raw) => raw && typeof raw === 'object')
    .map((raw, idx) => {
      const item = lineToApi(raw as Record<string, unknown>, idx);
      return {
        id: item.id,
        item_id: item.itemId ?? null,
        item_name: item.itemName ?? null,
        description: item.description ?? null,
        category_id: item.categoryId ?? null,
        quantity: item.quantity,
        unit_rate: item.unitRate,
        tax_percent: item.taxPercent,
        tax_amount: item.taxAmount,
        line_total: item.lineTotal,
        sort_order: idx,
      };
    });
}

function computeTotals(items: unknown[]) {
  const parsed = items.map((raw, idx) =>
    raw && typeof raw === 'object' ? lineToApi(raw as Record<string, unknown>, idx) : lineToApi({}, idx)
  );
  const taxAmount = parsed.reduce((s, l) => s + l.taxAmount, 0);
  const totalAmount = parsed.reduce((s, l) => s + l.lineTotal, 0);
  return { taxAmount, totalAmount, normalized: parsed };
}

function pickBody(body: Record<string, unknown>) {
  const vendorId = String(body.vendorId ?? body.vendor_id ?? '').trim();
  if (!vendorId) throw new Error('vendorId is required.');

  const issueRaw = body.issueDate ?? body.issue_date ?? new Date().toISOString().slice(0, 10);
  const issueDate = parseApiDateToYyyyMmDd(issueRaw);

  const items = parseItems(body.items);
  const { taxAmount, totalAmount, normalized } = computeTotals(items);
  const totalRaw = body.totalAmount ?? body.total_amount;
  const totalFallback = Number(totalRaw);
  const finalTotal = totalAmount > 0 ? totalAmount : Number.isFinite(totalFallback) ? totalFallback : 0;

  const statusRaw = String(body.status ?? 'Draft');
  const status = VALID_STATUSES.includes(statusRaw as PurchaseOrderLifecycleStatus)
    ? statusRaw
    : 'Draft';

  return {
    vendor_id: vendorId,
    po_number:
      body.poNumber === undefined && body.po_number === undefined
        ? undefined
        : String(body.poNumber ?? body.po_number ?? '').trim() || undefined,
    quotation_id: body.quotationId ?? body.quotation_id ? String(body.quotationId ?? body.quotation_id) : null,
    comparison_session_id:
      body.comparisonSessionId ?? body.comparison_session_id
        ? String(body.comparisonSessionId ?? body.comparison_session_id)
        : null,
    project_id: body.projectId ?? body.project_id ? String(body.projectId ?? body.project_id) : null,
    building_id: body.buildingId ?? body.building_id ? String(body.buildingId ?? body.building_id) : null,
    department_id:
      body.departmentId ?? body.department_id ? String(body.departmentId ?? body.department_id) : null,
    total_amount: finalTotal,
    tax_amount: taxAmount,
    status,
    items: normalized,
    payment_terms: body.paymentTerms ?? body.payment_terms ? String(body.paymentTerms ?? body.payment_terms) : null,
    delivery_period:
      body.deliveryPeriod ?? body.delivery_period ? String(body.deliveryPeriod ?? body.delivery_period) : null,
    warranty_period:
      body.warrantyPeriod ?? body.warranty_period ? String(body.warrantyPeriod ?? body.warranty_period) : null,
    description: body.description != null ? String(body.description) : null,
    issue_date: issueDate,
    required_date: parseApiDateToYyyyMmDdOptional(body.requiredDate ?? body.required_date),
    target_delivery_date: parseApiDateToYyyyMmDdOptional(
      body.targetDeliveryDate ?? body.target_delivery_date
    ),
    currency: String(body.currency ?? 'PKR').trim() || 'PKR',
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

function writeFields(p: ReturnType<typeof pickBody>, poNumber: string): PurchaseOrderWriteFields {
  return {
    po_number: poNumber,
    vendor_id: p.vendor_id,
    quotation_id: p.quotation_id,
    comparison_session_id: p.comparison_session_id,
    project_id: p.project_id,
    building_id: p.building_id,
    department_id: p.department_id,
    total_amount: p.total_amount,
    tax_amount: p.tax_amount,
    status: p.status,
    items_json: JSON.stringify(p.items),
    payment_terms: p.payment_terms,
    delivery_period: p.delivery_period,
    warranty_period: p.warranty_period,
    description: p.description,
    issue_date: p.issue_date,
    required_date: p.required_date,
    target_delivery_date: p.target_delivery_date,
    currency: p.currency,
  };
}

async function syncLines(client: pg.PoolClient, tenantId: string, poId: string, items: unknown[]) {
  const lineRepo = new PurchaseOrderLineRepository(tenantId);
  await lineRepo.replaceForPo(client, poId, itemsToLineWrites(items, poId));
}

export async function listPurchaseOrders(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { status?: string; vendorId?: string; projectId?: string }
) {
  return new PurchaseOrderRepository(tenantId).list(client, filters);
}

export type PurchaseOrderListPageQuery = {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  status?: string;
  vendorId?: string;
  projectId?: string;
};

export async function listPurchaseOrdersPage(
  client: pg.PoolClient,
  tenantId: string,
  query: PurchaseOrderListPageQuery
): Promise<{ rows: PurchaseOrderRow[]; total: number }> {
  return new PurchaseOrderRepository(tenantId).listPage(client, {
    limit: query.limit,
    offset: query.offset,
    filters: {
      status: query.status,
      vendorId: query.vendorId,
      projectId: query.projectId,
    },
    search: query.search,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  });
}

export async function getPurchaseOrderById(client: pg.PoolClient, tenantId: string, id: string) {
  const row = await new PurchaseOrderRepository(tenantId).getById(client, id);
  return row ? rowToPurchaseOrderApi(row) : null;
}

export async function upsertPurchaseOrder(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{ row: PurchaseOrderRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  const repo = new PurchaseOrderRepository(tenantId);
  const id =
    typeof body.id === 'string' && body.id.trim()
      ? body.id.trim()
      : `po_${randomUUID().replace(/-/g, '')}`;

  const existing = await repo.getById(client, id);
  if (existing && existing.status !== 'Draft') {
    throw new Error('Only Draft purchase orders can be edited.');
  }

  if (p.version != null && existing) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'purchase_orders',
      entityId: id,
      clientVersion: p.version,
    });
    if (lww.conflict) return { row: existing, conflict: true, wasInsert: false };
  }

  const poNumber = p.po_number ?? (existing ? existing.po_number : await repo.getNextPoNumber(client));
  const fields = writeFields(p, poNumber);

  let row: PurchaseOrderRow;
  let wasInsert = false;
  if (existing) {
    const updated = await repo.updateActive(client, id, fields, actorUserId);
    if (!updated) throw new Error('Purchase order not found.');
    row = updated;
  } else {
    row = await repo.insertPurchaseOrder(client, id, fields, actorUserId);
    wasInsert = true;
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId,
      module: 'purchase_orders',
      entityType: 'purchase_order',
      entityId: row.id,
      action: 'create',
      summary: `Purchase order ${row.po_number} created`,
      newValue: rowToPurchaseOrderApi(row),
      version: row.version,
    });
  }

  await syncLines(client, tenantId, row.id, p.items);

  if (!wasInsert) {
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId,
      module: 'purchase_orders',
      entityType: 'purchase_order',
      entityId: row.id,
      action: 'update',
      summary: `Purchase order ${row.po_number} updated`,
      newValue: rowToPurchaseOrderApi(row),
      version: row.version,
    });
  }

  return { row, conflict: false, wasInsert };
}

export async function submitPurchaseOrder(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion: number | undefined,
  userId: string | null,
  requesterRole?: string | null
) {
  const repo = new PurchaseOrderRepository(tenantId);
  const row = await repo.getByIdForUpdate(client, id);
  if (!row) throw new Error('Purchase order not found.');
  if (row.status !== 'Draft') throw new Error('Only Draft purchase orders can be submitted.');

  if (expectedVersion != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'purchase_orders',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { conflict: true as const, serverVersion: row.version };
  }

  const { submitEntityForApproval } = await import('../../workflow/services/workflowEngineService.js');
  const result = await submitEntityForApproval(client, tenantId, {
    entityType: 'purchase_order',
    entityId: id,
    requesterId: userId,
    requesterRole: requesterRole ?? null,
  });

  const updated = await repo.getById(client, id);
  if (!updated) throw new Error('Purchase order not found after submit.');

  return {
    conflict: false as const,
    row: updated,
    workflowMode: result.mode,
    approvalRequest: result.request,
  };
}

export async function approvePurchaseOrder(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion: number | undefined,
  userId: string | null
) {
  const { isApprovalWorkflowEnabled } = await import('../../workflow/services/workflowSettingsService.js');
  const { ApprovalRequestRepository } = await import('../../workflow/repositories/ApprovalRequestRepository.js');
  const { performApprovalAction } = await import('../../workflow/services/workflowEngineService.js');

  const workflowEnabled = await isApprovalWorkflowEnabled(client, tenantId);
  if (workflowEnabled) {
    const reqRepo = new ApprovalRequestRepository(tenantId);
    const pending = await reqRepo.findActiveForEntity(client, 'purchase_order', id);
    if (!pending) {
      throw new Error('No pending approval request. Use the approval queue to approve this purchase order.');
    }
    const result = await performApprovalAction(client, tenantId, {
      requestId: pending.id,
      action: 'approve',
      actorId: userId,
    });
    const repo = new PurchaseOrderRepository(tenantId);
    const row = await repo.getById(client, id);
    if (!row) throw new Error('Purchase order not found.');
    return { conflict: false as const, row, approvalRequest: result };
  }

  const repo = new PurchaseOrderRepository(tenantId);
  const row = await repo.getByIdForUpdate(client, id);
  if (!row) throw new Error('Purchase order not found.');
  if (row.status !== 'Submitted') throw new Error('Only Submitted purchase orders can be approved.');

  if (expectedVersion != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'purchase_orders',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { conflict: true as const, serverVersion: row.version };
  }

  const updated = await repo.setStatus(client, id, {
    status: 'Approved',
    approved_at: new Date(),
    approved_by: userId,
  });
  if (!updated) throw new Error('Failed to approve purchase order.');

  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'purchase_orders',
    entityType: 'purchase_order',
    entityId: id,
    action: 'update',
    auditAction: 'approved',
    summary: `Purchase order ${row.po_number} approved`,
    oldValue: rowToPurchaseOrderApi(row),
    newValue: rowToPurchaseOrderApi(updated),
    version: updated.version,
  });

  return { conflict: false as const, row: updated };
}

export async function cancelPurchaseOrder(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  reason: string | null,
  expectedVersion: number | undefined,
  userId: string | null
) {
  const repo = new PurchaseOrderRepository(tenantId);
  const row = await repo.getByIdForUpdate(client, id);
  if (!row) throw new Error('Purchase order not found.');
  if (row.status === 'Cancelled') throw new Error('Purchase order is already cancelled.');
  if (row.status === 'Fully Billed' || row.status === 'Partially Billed') {
    throw new Error('Cannot cancel a purchase order that has been billed.');
  }

  if (expectedVersion != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'purchase_orders',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { conflict: true as const, serverVersion: row.version };
  }

  const updated = await repo.setStatus(client, id, {
    status: 'Cancelled',
    cancelled_at: new Date(),
    cancelled_by: userId,
    cancel_reason: reason,
  });
  if (!updated) throw new Error('Failed to cancel purchase order.');

  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'purchase_orders',
    entityType: 'purchase_order',
    entityId: id,
    action: 'update',
    auditAction: 'cancelled',
    summary: `Purchase order ${row.po_number} cancelled`,
    oldValue: rowToPurchaseOrderApi(row),
    newValue: rowToPurchaseOrderApi(updated),
    version: updated.version,
  });

  return { conflict: false as const, row: updated };
}

export async function softDeletePurchaseOrder(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean; serverVersion?: number }> {
  const repo = new PurchaseOrderRepository(tenantId);
  const row = await repo.getById(client, id);
  if (!row) return { ok: false, conflict: false };
  if (row.status !== 'Draft') throw new Error('Only Draft purchase orders can be deleted.');

  if (expectedVersion != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'purchase_orders',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true, serverVersion: row.version };
  }

  const ok = await repo.markDeleted(client, id);
  if (ok) {
    await recordDomainMutation(client, {
      tenantId,
      userId: null,
      module: 'purchase_orders',
      entityType: 'purchase_order',
      entityId: id,
      action: 'delete',
      summary: `Purchase order ${row.po_number} deleted`,
      oldValue: rowToPurchaseOrderApi(row),
    });
  }
  return { ok, conflict: false };
}

/** Create PO from quotation (procurement conversion path). */
export async function createPurchaseOrderFromQuotation(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    vendorId: string;
    quotationId: string;
    comparisonSessionId?: string | null;
    projectId?: string | null;
    buildingId?: string | null;
    items: unknown[];
    totalAmount: number;
    paymentTerms?: string | null;
    deliveryPeriod?: string | null;
    warrantyPeriod?: string | null;
    description?: string | null;
    targetDeliveryDate?: string | null;
    currency?: string;
    userId: string | null;
  }
) {
  const repo = new PurchaseOrderRepository(tenantId);
  const id = `po_${randomUUID().replace(/-/g, '')}`;
  const poNumber = await repo.getNextPoNumber(client);
  const { taxAmount, totalAmount, normalized } = computeTotals(input.items);
  const fields: PurchaseOrderWriteFields = {
    po_number: poNumber,
    vendor_id: input.vendorId,
    quotation_id: input.quotationId,
    comparison_session_id: input.comparisonSessionId ?? null,
    project_id: input.projectId ?? null,
    building_id: input.buildingId ?? null,
    department_id: null,
    total_amount: totalAmount > 0 ? totalAmount : input.totalAmount,
    tax_amount: taxAmount,
    status: 'Draft',
    items_json: JSON.stringify(normalized),
    payment_terms: input.paymentTerms ?? null,
    delivery_period: input.deliveryPeriod ?? null,
    warranty_period: input.warrantyPeriod ?? null,
    description: input.description ?? null,
    issue_date: new Date().toISOString().slice(0, 10),
    required_date: null,
    target_delivery_date: input.targetDeliveryDate ?? null,
    currency: input.currency ?? 'PKR',
  };
  const row = await repo.insertPurchaseOrder(client, id, fields, input.userId);
  await syncLines(client, tenantId, row.id, normalized);
  await recordDomainMutation(client, {
    tenantId,
    userId: input.userId,
    module: 'purchase_orders',
    entityType: 'purchase_order',
    entityId: row.id,
    action: 'create',
    auditAction: 'converted_from_quotation',
    summary: `Purchase order ${row.po_number} created from quotation ${input.quotationId}`,
    newValue: rowToPurchaseOrderApi(row),
    version: row.version,
  });
  return row;
}
