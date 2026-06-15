import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import { QuotationRepository } from '../../vendors/repositories/QuotationRepository.js';
import {
  getQuotationById,
  rowToQuotationApi,
  type QuotationRow,
} from '../../vendors/services/quotationsService.js';
import { VendorPriceHistoryRepository } from '../../vendors/repositories/VendorPriceHistoryRepository.js';
import { QuotationComparisonSessionRepository } from '../repositories/QuotationComparisonSessionRepository.js';
import { sessionToApi } from './quotationComparisonService.js';
import { formatPgDateToYyyyMmDd } from '../../../utils/dateOnly.js';
import {
  createPurchaseOrderFromQuotation,
  getPurchaseOrderById as getPoById,
  rowToPurchaseOrderApi,
} from '../../purchase-orders/services/purchaseOrderService.js';

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

function quotationItemsToPoItems(items: unknown[]) {
  return items
    .filter((raw) => raw && typeof raw === 'object')
    .map((raw, idx) => {
      const item = raw as Record<string, unknown>;
      const qty = Number(item.quantity ?? 0);
      const unitRate = Number(item.pricePerQuantity ?? item.price_per_quantity ?? item.unitRate ?? 0);
      const subtotal = qty * unitRate;
      return {
        id: String(item.id ?? `po_item_${idx}`),
        itemId: item.itemId ?? item.item_id ? String(item.itemId ?? item.item_id) : undefined,
        itemName: item.itemName ?? item.item_name ? String(item.itemName ?? item.item_name) : undefined,
        description: String(item.itemName ?? item.item_name ?? item.description ?? 'Item'),
        quantity: qty,
        unitRate,
        taxPercent: 0,
        taxAmount: 0,
        lineTotal: subtotal,
        categoryId: item.categoryId ?? item.category_id ? String(item.categoryId ?? item.category_id) : undefined,
      };
    });
}

export { rowToPurchaseOrderApi };

async function syncApprovedPriceHistory(
  client: pg.PoolClient,
  tenantId: string,
  row: QuotationRow
): Promise<void> {
  const items = parseItems(row.items);
  const historyRepo = new VendorPriceHistoryRepository(tenantId);
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const rate = Number(item.pricePerQuantity ?? item.price_per_quantity ?? 0);
    const categoryId = item.categoryId ?? item.category_id ? String(item.categoryId ?? item.category_id) : null;
    if (rate <= 0 || !categoryId) continue;
    await historyRepo.insertEntries(client, [
      {
        vendor_id: row.vendor_id,
        category_id: categoryId,
        item_id: item.itemId ?? item.item_id ? String(item.itemId ?? item.item_id) : null,
        item_name: item.itemName ?? item.item_name ? String(item.itemName ?? item.item_name) : null,
        quotation_id: row.id,
        quoted_rate: rate,
        quotation_date: formatPgDateToYyyyMmDd(row.date) ?? new Date().toISOString().slice(0, 10),
        project_id: row.project_id,
        building_id: row.building_id,
        is_approved_rate: true,
      },
    ]);
  }
}

export async function markPreferredQuotation(
  client: pg.PoolClient,
  tenantId: string,
  sessionId: string,
  quotationId: string,
  expectedVersion: number | undefined,
  userId: string | null
) {
  const sessionRepo = new QuotationComparisonSessionRepository(tenantId);
  const session = await sessionRepo.getById(client, sessionId);
  if (!session) throw new Error('Comparison session not found.');

  if (expectedVersion != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'quotation_comparison_sessions',
      entityId: sessionId,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { conflict: true as const, serverVersion: session.version };
  }

  const members = await sessionRepo.listSessionQuotations(client, sessionId);
  if (!members.some((m) => m.quotation_id === quotationId)) {
    throw new Error('Quotation is not part of this comparison session.');
  }

  const updated = await sessionRepo.setPreferred(client, sessionId, quotationId);
  if (!updated) throw new Error('Failed to mark preferred quotation.');

  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'procurement',
    entityType: 'quotation_comparison_session',
    entityId: sessionId,
    action: 'update',
    auditAction: 'preferred_selected',
    summary: `Preferred quotation ${quotationId} selected in comparison ${sessionId}`,
    oldValue: sessionToApi(session),
    newValue: sessionToApi(updated),
    version: updated.version,
  });

  return { conflict: false as const, session: sessionToApi(updated) };
}

export async function approveQuotation(
  client: pg.PoolClient,
  tenantId: string,
  quotationId: string,
  input: {
    sessionId?: string;
    expectedVersion?: number;
    userId: string | null;
  }
) {
  const quoteRepo = new QuotationRepository(tenantId);
  const row = await quoteRepo.getById(client, quotationId);
  if (!row) throw new Error('Quotation not found.');

  if (input.expectedVersion != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'quotations',
      entityId: quotationId,
      clientVersion: input.expectedVersion,
    });
    if (lww.conflict) return { conflict: true as const, serverVersion: row.version };
  }

  const status = row.status ?? 'Draft';
  if (status !== 'Active' && status !== 'Approved') {
    throw new Error('Only Active quotations can be approved.');
  }

  const updated = await client.query<QuotationRow>(
    `UPDATE quotations SET
       status = 'Approved',
       is_approved_rate = TRUE,
       is_active = TRUE,
       version = version + 1,
       updated_at = NOW(),
       user_id = COALESCE($3, user_id)
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, vendor_id, name, quotation_number, date, expiry_date,
       enable_price_validation, validation_scope, is_active, contact_person, contact_phone,
       contact_email, currency, project_id, building_id, package_name, quotation_type, status,
       is_approved_rate, payment_terms, delivery_period, warranty_period,
       retention_percent::text, advance_percent::text, remarks, items, total_amount::text,
       document_id, user_id, version, deleted_at, created_at, updated_at`,
    [quotationId, tenantId, input.userId]
  );
  const approvedRow = updated.rows[0];
  if (!approvedRow) throw new Error('Quotation not found.');

  await syncApprovedPriceHistory(client, tenantId, approvedRow);

  let sessionApi;
  if (input.sessionId) {
    const sessionRepo = new QuotationComparisonSessionRepository(tenantId);
    const session = await sessionRepo.setApproved(client, input.sessionId, quotationId, input.userId);
    if (session) sessionApi = sessionToApi(session);
  }

  const apiRow = rowToQuotationApi(approvedRow);
  await recordDomainMutation(client, {
    tenantId,
    userId: input.userId,
    module: 'procurement',
    entityType: 'quotation',
    entityId: quotationId,
    action: 'update',
    auditAction: 'approved',
    summary: `Quotation ${approvedRow.name} approved`,
    oldValue: rowToQuotationApi(row),
    newValue: apiRow,
    version: approvedRow.version,
  });

  return { conflict: false as const, quotation: apiRow, session: sessionApi };
}

export async function convertApprovedQuotationToPurchaseOrder(
  client: pg.PoolClient,
  tenantId: string,
  quotationId: string,
  input: {
    sessionId?: string;
    expectedVersion?: number;
    userId: string | null;
    targetDeliveryDate?: string;
    description?: string;
  }
) {
  const quoteRepo = new QuotationRepository(tenantId);
  const row = await quoteRepo.getById(client, quotationId);
  if (!row) throw new Error('Quotation not found.');

  const status = row.status ?? 'Draft';
  if (status !== 'Approved') {
    throw new Error('Only Approved quotations can be converted to a purchase order.');
  }

  const existingPo = await client.query(
    `SELECT id FROM purchase_orders
     WHERE tenant_id = $1 AND quotation_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, quotationId]
  );
  if (existingPo.rows[0]) {
    throw new Error('A purchase order already exists for this quotation.');
  }

  const items = parseItems(row.items);
  const poItems = quotationItemsToPoItems(items);
  const totalAmount = Number(row.total_amount) || poItems.reduce((s, i) => s + i.lineTotal, 0);

  const poRow = await createPurchaseOrderFromQuotation(client, tenantId, {
    vendorId: row.vendor_id,
    quotationId,
    comparisonSessionId: input.sessionId ?? null,
    projectId: row.project_id,
    buildingId: row.building_id,
    items: poItems,
    totalAmount,
    paymentTerms: row.payment_terms,
    deliveryPeriod: row.delivery_period,
    warrantyPeriod: row.warranty_period,
    description: input.description ?? row.remarks,
    targetDeliveryDate: input.targetDeliveryDate ?? null,
    currency: row.currency ?? 'PKR',
    userId: input.userId,
  });
  const poId = poRow.id;
  const poNumber = poRow.po_number;

  let sessionApi;
  if (input.sessionId) {
    const sessionRepo = new QuotationComparisonSessionRepository(tenantId);
    const session = await sessionRepo.setConverted(client, input.sessionId, poId);
    if (session) sessionApi = sessionToApi(session);
  }

  const apiPo = rowToPurchaseOrderApi(poRow);

  return { purchaseOrder: apiPo, session: sessionApi, quotation: rowToQuotationApi(row) };
}

export async function getComparisonSession(
  client: pg.PoolClient,
  tenantId: string,
  sessionId: string
) {
  const sessionRepo = new QuotationComparisonSessionRepository(tenantId);
  const session = await sessionRepo.getById(client, sessionId);
  if (!session) return null;
  const members = await sessionRepo.listSessionQuotations(client, sessionId);
  return {
    session: sessionToApi(session),
    quotationIds: members.map((m) => m.quotation_id),
    recommendations: members.map((m) => ({
      quotationId: m.quotation_id,
      recommendationScore: m.recommendation_score != null ? Number(m.recommendation_score) : undefined,
      recommendationRank: m.recommendation_rank ?? undefined,
      isRecommended: m.is_recommended,
    })),
  };
}

export async function getPurchaseOrderById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
) {
  return getPoById(client, tenantId, id);
}

export async function getQuotationForWorkflow(
  client: pg.PoolClient,
  tenantId: string,
  id: string
) {
  const row = await getQuotationById(client, tenantId, id);
  return row ? rowToQuotationApi(row) : null;
}
