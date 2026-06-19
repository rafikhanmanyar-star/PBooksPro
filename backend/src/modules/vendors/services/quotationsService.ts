import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from '../../../utils/dateOnly.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import {
  QuotationRepository,
  type QuotationWriteFields,
} from '../repositories/QuotationRepository.js';
import {
  QuotationItemRepository,
  type QuotationItemWrite,
} from '../repositories/QuotationItemRepository.js';
import {
  VendorPriceHistoryRepository,
  type VendorPriceHistoryWrite,
} from '../repositories/VendorPriceHistoryRepository.js';

export type QuotationRow = {
  id: string;
  tenant_id: string;
  vendor_id: string;
  name: string;
  quotation_number: string | null;
  date: Date;
  expiry_date: Date | null;
  enable_price_validation: boolean;
  validation_scope: string;
  is_active: boolean;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  currency: string | null;
  project_id: string | null;
  building_id: string | null;
  package_name: string | null;
  quotation_type: string | null;
  status: string | null;
  is_approved_rate: boolean;
  payment_terms: string | null;
  delivery_period: string | null;
  warranty_period: string | null;
  retention_percent: string | null;
  advance_percent: string | null;
  remarks: string | null;
  items: unknown;
  total_amount: string;
  document_id: string | null;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

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

function computeTotalFromItems(items: unknown[], fallback: number): number {
  if (!items.length) return fallback;
  let sum = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const qty = Number(item.quantity ?? 0);
    const price = Number(item.pricePerQuantity ?? item.price_per_quantity ?? 0);
    if (Number.isFinite(qty) && Number.isFinite(price)) sum += qty * price;
  }
  return sum > 0 ? sum : fallback;
}

function computeVariancePercent(quotedRate: number, previousRate?: number | null): number | undefined {
  if (previousRate == null || previousRate <= 0) return undefined;
  return Math.round(((quotedRate - previousRate) / previousRate) * 10000) / 100;
}

function itemToApi(item: Record<string, unknown>, idx: number): Record<string, unknown> {
  const qty = Number(item.quantity ?? 0);
  const rate = Number(item.pricePerQuantity ?? item.price_per_quantity ?? item.unitRate ?? item.unit_rate ?? 0);
  const previousRate = item.previousRate ?? item.previous_rate;
  const prevNum = previousRate != null ? Number(previousRate) : undefined;
  const variance =
    item.variancePercent ?? item.variance_percent ?? computeVariancePercent(rate, prevNum);
  return {
    id: String(item.id ?? idx),
    categoryId: String(item.categoryId ?? item.category_id ?? ''),
    itemId: item.itemId ?? item.item_id ? String(item.itemId ?? item.item_id) : undefined,
    itemName: item.itemName ?? item.item_name ? String(item.itemName ?? item.item_name) : undefined,
    brand: item.brand != null ? String(item.brand) : undefined,
    specification: item.specification != null ? String(item.specification) : undefined,
    quantity: qty,
    pricePerQuantity: rate,
    unit: item.unit != null ? String(item.unit) : undefined,
    marketRate: item.marketRate ?? item.market_rate ? Number(item.marketRate ?? item.market_rate) : undefined,
    previousRate: prevNum,
    variancePercent: variance != null ? Number(variance) : undefined,
    approvalThresholdPercent:
      item.approvalThresholdPercent ?? item.approval_threshold_percent
        ? Number(item.approvalThresholdPercent ?? item.approval_threshold_percent)
        : 5,
    totalAmount: qty * rate,
  };
}

export function rowToQuotationApi(row: QuotationRow): Record<string, unknown> {
  const rawItems = parseItems(row.items);
  const items = rawItems.map((item, idx) =>
    item && typeof item === 'object' ? itemToApi(item as Record<string, unknown>, idx) : { id: String(idx), categoryId: '', quantity: 0, pricePerQuantity: 0 }
  );
  const totalAmount = Number(row.total_amount) || computeTotalFromItems(items, 0);
  const status = row.status ?? (row.is_active ? 'Active' : 'Draft');
  const base: Record<string, unknown> = {
    id: row.id,
    vendorId: row.vendor_id,
    name: row.name,
    quotationNumber: row.quotation_number ?? undefined,
    date: formatPgDateToYyyyMmDd(row.date) ?? '',
    expiryDate: formatPgDateToYyyyMmDd(row.expiry_date) ?? undefined,
    enablePriceValidation: row.enable_price_validation !== false,
    validationScope: row.validation_scope ?? 'CATEGORY',
    isActive: row.is_active !== false,
    contactPerson: row.contact_person ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    contactEmail: row.contact_email ?? undefined,
    currency: row.currency ?? 'PKR',
    projectId: row.project_id ?? undefined,
    buildingId: row.building_id ?? undefined,
    packageName: row.package_name ?? undefined,
    quotationType: row.quotation_type ?? undefined,
    status,
    isApprovedRate: row.is_approved_rate === true,
    paymentTerms: row.payment_terms ?? undefined,
    deliveryPeriod: row.delivery_period ?? undefined,
    warrantyPeriod: row.warranty_period ?? undefined,
    retentionPercent: row.retention_percent != null ? Number(row.retention_percent) : 0,
    advancePercent: row.advance_percent != null ? Number(row.advance_percent) : 0,
    remarks: row.remarks ?? undefined,
    items,
    totalAmount,
    documentId: row.document_id ?? undefined,
    userId: row.user_id ?? undefined,
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
  if (row.deleted_at) {
    base.deletedAt = row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  return base;
}

function pickBody(body: Record<string, unknown>) {
  const dateRaw = body.date;
  if (dateRaw == null || dateRaw === '') throw new Error('date is required.');
  let dateStr: string;
  try {
    dateStr = parseApiDateToYyyyMmDd(dateRaw);
  } catch {
    throw new Error('Invalid date.');
  }

  const items = parseItems(body.items);
  const totalRaw = body.totalAmount ?? body.total_amount;
  const totalFallback = Number(totalRaw);
  const total_amount = computeTotalFromItems(
    items,
    Number.isFinite(totalFallback) ? totalFallback : 0
  );

  const validationScopeRaw = String(body.validationScope ?? body.validation_scope ?? 'CATEGORY').toUpperCase();
  const validation_scope = validationScopeRaw === 'ITEM' ? 'ITEM' : 'CATEGORY';

  const statusRaw = String(body.status ?? 'Draft');
  const validStatuses = ['Draft', 'Active', 'Approved', 'Expired', 'Superseded'];
  const status = validStatuses.includes(statusRaw) ? statusRaw : 'Draft';
  const is_active =
    body.isActive === false || body.is_active === false
      ? false
      : status === 'Active' || status === 'Approved';

  let expiryStr: string | null = null;
  const expiryRaw = body.expiryDate ?? body.expiry_date;
  if (expiryRaw != null && expiryRaw !== '') {
    try {
      expiryStr = parseApiDateToYyyyMmDd(expiryRaw);
    } catch {
      throw new Error('Invalid expiry date.');
    }
  }

  return {
    vendor_id: String(body.vendorId ?? body.vendor_id ?? '').trim(),
    name: String(body.name ?? '').trim(),
    quotation_number:
      body.quotationNumber === undefined && body.quotation_number === undefined
        ? null
        : body.quotationNumber === null || body.quotation_number === null
          ? null
          : String(body.quotationNumber ?? body.quotation_number).trim() || null,
    date: dateStr,
    expiry_date: expiryStr,
    enable_price_validation: body.enablePriceValidation === false || body.enable_price_validation === false ? false : true,
    validation_scope,
    is_active,
    contact_person: body.contactPerson ?? body.contact_person ? String(body.contactPerson ?? body.contact_person).trim() || null : null,
    contact_phone: body.contactPhone ?? body.contact_phone ? String(body.contactPhone ?? body.contact_phone).trim() || null : null,
    contact_email: body.contactEmail ?? body.contact_email ? String(body.contactEmail ?? body.contact_email).trim() || null : null,
    currency: String(body.currency ?? 'PKR').trim() || 'PKR',
    project_id: body.projectId ?? body.project_id ? String(body.projectId ?? body.project_id).trim() || null : null,
    building_id: body.buildingId ?? body.building_id ? String(body.buildingId ?? body.building_id).trim() || null : null,
    package_name: body.packageName ?? body.package_name ? String(body.packageName ?? body.package_name).trim() || null : null,
    quotation_type: body.quotationType ?? body.quotation_type ? String(body.quotationType ?? body.quotation_type).trim() || null : null,
    status,
    is_approved_rate: body.isApprovedRate === true || body.is_approved_rate === true || status === 'Approved',
    payment_terms: body.paymentTerms ?? body.payment_terms ? String(body.paymentTerms ?? body.payment_terms) : null,
    delivery_period: body.deliveryPeriod ?? body.delivery_period ? String(body.deliveryPeriod ?? body.delivery_period).trim() || null : null,
    warranty_period: body.warrantyPeriod ?? body.warranty_period ? String(body.warrantyPeriod ?? body.warranty_period).trim() || null : null,
    retention_percent: Number(body.retentionPercent ?? body.retention_percent ?? 0) || 0,
    advance_percent: Number(body.advancePercent ?? body.advance_percent ?? 0) || 0,
    remarks: body.remarks != null ? String(body.remarks) : null,
    items,
    total_amount,
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

export async function listQuotations(client: pg.PoolClient, tenantId: string): Promise<QuotationRow[]> {
  return new QuotationRepository(tenantId).listActive(client);
}

export type QuotationListPageQuery = {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
  vendorId?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
};

export async function listQuotationsPage(
  client: pg.PoolClient,
  tenantId: string,
  query: QuotationListPageQuery
): Promise<{ rows: QuotationRow[]; total: number }> {
  return new QuotationRepository(tenantId).listPage(client, {
    limit: query.limit,
    offset: query.offset,
    vendorId: query.vendorId,
    search: query.search,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  });
}

export async function getQuotationById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<QuotationRow | null> {
  return new QuotationRepository(tenantId).getById(client, id);
}

async function getQuotationByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<QuotationRow | null> {
  return new QuotationRepository(tenantId).getByIdIncludingDeleted(client, id);
}

export async function listQuotationsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<QuotationRow[]> {
  return new QuotationRepository(tenantId).listChangedSince(client, since);
}

type QuotationNumberFormat = { prefix: string; padding: number };

async function loadQuotationNumberFormat(
  client: pg.PoolClient,
  tenantId: string
): Promise<QuotationNumberFormat> {
  const { getSettingByKey } = await import('../../app-settings/services/appSettingsService.js');
  const raw = await getSettingByKey(client, tenantId, 'procurementSettings');
  const settings = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const qns = settings.quotationNumberSettings;
  if (qns && typeof qns === 'object') {
    const o = qns as Record<string, unknown>;
    const prefix = String(o.prefix ?? 'QTN-');
    const padding = Number(o.padding ?? 4);
    return { prefix, padding: Number.isFinite(padding) && padding > 0 ? Math.trunc(padding) : 4 };
  }
  return { prefix: 'QTN-', padding: 4 };
}

function isDuplicateQuotationNumberConstraint(e: unknown): boolean {
  const msg =
    e && typeof e === 'object' && 'message' in e && typeof (e as { message?: string }).message === 'string'
      ? (e as { message: string }).message
      : e instanceof Error
        ? e.message
        : String(e);
  const lower = msg.toLowerCase();
  const constraint =
    e && typeof e === 'object' && 'constraint' in e
      ? String((e as { constraint?: string }).constraint ?? '')
      : '';
  return constraint === 'idx_quotations_tenant_number_active' || lower.includes('idx_quotations_tenant_number_active');
}

async function allocateQuotationNumber(
  client: pg.PoolClient,
  tenantId: string,
  requested: string | null | undefined,
  excludeId?: string
): Promise<string> {
  const repo = new QuotationRepository(tenantId);
  const format = await loadQuotationNumberFormat(client, tenantId);
  const trimmed = requested?.trim() ?? '';
  if (trimmed) {
    const taken = await repo.quotationNumberExists(client, trimmed, excludeId);
    if (!taken) return trimmed;
  }
  const maxSeq = await repo.getMaxQuotationSequence(client, format.prefix);
  for (let offset = 1; offset <= 25; offset++) {
    const candidate = QuotationRepository.formatQuotationNumber(
      format.prefix,
      format.padding,
      maxSeq + offset
    );
    if (!(await repo.quotationNumberExists(client, candidate, excludeId))) return candidate;
  }
  throw new Error('Could not allocate a unique quotation number. Try again or enter a number manually.');
}

async function bumpProcurementQuotationNextNumber(
  client: pg.PoolClient,
  tenantId: string,
  assignedNumber: string
): Promise<void> {
  const format = await loadQuotationNumberFormat(client, tenantId);
  if (!assignedNumber.startsWith(format.prefix)) return;
  const seq = parseInt(assignedNumber.slice(format.prefix.length), 10);
  if (!Number.isFinite(seq) || seq < 1) return;

  const { getSettingByKey, upsertSetting } = await import('../../app-settings/services/appSettingsService.js');
  const raw = await getSettingByKey(client, tenantId, 'procurementSettings');
  const settings =
    raw && typeof raw === 'object' ? ({ ...(raw as Record<string, unknown>) } as Record<string, unknown>) : {};
  const existingQns =
    settings.quotationNumberSettings && typeof settings.quotationNumberSettings === 'object'
      ? ({ ...(settings.quotationNumberSettings as Record<string, unknown>) } as Record<string, unknown>)
      : { prefix: format.prefix, nextNumber: 1, padding: format.padding };
  const currentNext = Number(existingQns.nextNumber ?? 1);
  if (seq >= currentNext) {
    existingQns.nextNumber = seq + 1;
    settings.quotationNumberSettings = existingQns;
    await upsertSetting(client, tenantId, 'procurementSettings', settings, { skipChangeLog: true });
  }
}

function quotationWriteFields(p: ReturnType<typeof pickBody>): QuotationWriteFields {
  return {
    vendor_id: p.vendor_id,
    name: p.name,
    quotation_number: p.quotation_number,
    date: p.date,
    expiry_date: p.expiry_date,
    enable_price_validation: p.enable_price_validation,
    validation_scope: p.validation_scope,
    is_active: p.is_active,
    contact_person: p.contact_person,
    contact_phone: p.contact_phone,
    contact_email: p.contact_email,
    currency: p.currency,
    project_id: p.project_id,
    building_id: p.building_id,
    package_name: p.package_name,
    quotation_type: p.quotation_type,
    status: p.status,
    is_approved_rate: p.is_approved_rate,
    payment_terms: p.payment_terms,
    delivery_period: p.delivery_period,
    warranty_period: p.warranty_period,
    retention_percent: p.retention_percent,
    advance_percent: p.advance_percent,
    remarks: p.remarks,
    items_json: JSON.stringify(p.items),
    total_amount: p.total_amount,
    document_id: p.document_id ?? null,
  };
}

function itemsToNormalizedWrites(items: unknown[], quotationId: string): QuotationItemWrite[] {
  return items
    .filter((raw) => raw && typeof raw === 'object')
    .map((raw, idx) => {
      const item = raw as Record<string, unknown>;
      const qty = Number(item.quantity ?? 0);
      const rate = Number(item.pricePerQuantity ?? item.price_per_quantity ?? item.unitRate ?? item.unit_rate ?? 0);
      const previousRate = item.previousRate ?? item.previous_rate;
      const prevNum = previousRate != null ? Number(previousRate) : null;
      return {
        id: String(item.id ?? `${quotationId}_item_${idx}`),
        category_id: item.categoryId ?? item.category_id ? String(item.categoryId ?? item.category_id) : null,
        item_id: item.itemId ?? item.item_id ? String(item.itemId ?? item.item_id) : null,
        item_name: item.itemName ?? item.item_name ? String(item.itemName ?? item.item_name) : null,
        brand: item.brand != null ? String(item.brand) : null,
        specification: item.specification != null ? String(item.specification) : null,
        unit: item.unit != null ? String(item.unit) : null,
        quantity: qty,
        unit_rate: rate,
        total_amount: qty * rate,
        market_rate: item.marketRate ?? item.market_rate ? Number(item.marketRate ?? item.market_rate) : null,
        previous_rate: prevNum,
        variance_percent: computeVariancePercent(rate, prevNum) ?? null,
        approval_threshold_percent: Number(item.approvalThresholdPercent ?? item.approval_threshold_percent ?? 5),
        sort_order: idx,
      };
    });
}

function buildPriceHistoryEntries(
  p: ReturnType<typeof pickBody>,
  quotationId: string
): VendorPriceHistoryWrite[] {
  const isApproved = p.is_approved_rate || p.status === 'Approved';
  if (!isApproved && p.status !== 'Active') return [];

  return itemsToNormalizedWrites(p.items, quotationId)
    .filter((item) => item.unit_rate > 0 && item.category_id)
    .map((item) => ({
      vendor_id: p.vendor_id,
      category_id: item.category_id,
      item_id: item.item_id,
      item_name: item.item_name,
      quotation_id: quotationId,
      quoted_rate: item.unit_rate,
      quotation_date: p.date,
      project_id: p.project_id,
      building_id: p.building_id,
      is_approved_rate: isApproved,
    }));
}

async function syncQuotationIntelligence(
  client: pg.PoolClient,
  tenantId: string,
  quotationId: string,
  p: ReturnType<typeof pickBody>
): Promise<void> {
  const itemRepo = new QuotationItemRepository(tenantId);
  const historyRepo = new VendorPriceHistoryRepository(tenantId);
  const normalized = itemsToNormalizedWrites(p.items, quotationId);
  await itemRepo.replaceForQuotation(client, quotationId, normalized);
  const historyEntries = buildPriceHistoryEntries(p, quotationId);
  if (historyEntries.length) {
    await historyRepo.insertEntries(client, historyEntries);
  }
}

async function insertQuotation(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  p: ReturnType<typeof pickBody>,
  actorUserId: string | null
): Promise<QuotationRow> {
  const repo = new QuotationRepository(tenantId);
  let fields = quotationWriteFields(p);
  fields = {
    ...fields,
    quotation_number: await allocateQuotationNumber(client, tenantId, fields.quotation_number, id),
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await repo.insertQuotation(client, id, fields, p.user_id ?? actorUserId);
      if (row.quotation_number) {
        await bumpProcurementQuotationNextNumber(client, tenantId, row.quotation_number);
      }
      await recordDomainMutation(client, {
        tenantId,
        userId: row.user_id,
        module: 'quotations',
        entityType: 'quotation',
        entityId: row.id,
        action: 'create',
        summary: `Quotation ${row.name} created`,
        newValue: rowToQuotationApi(row),
        version: row.version,
      });
      return row;
    } catch (e) {
      if (!isDuplicateQuotationNumberConstraint(e) || attempt >= 4) throw e;
      const format = await loadQuotationNumberFormat(client, tenantId);
      const maxSeq = await repo.getMaxQuotationSequence(client, format.prefix);
      fields = {
        ...fields,
        quotation_number: QuotationRepository.formatQuotationNumber(
          format.prefix,
          format.padding,
          maxSeq + attempt + 2
        ),
      };
    }
  }
  throw new Error('Could not save quotation: duplicate quotation number.');
}

async function updateQuotationRow(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  p: ReturnType<typeof pickBody>
): Promise<QuotationRow> {
  const repo = new QuotationRepository(tenantId);
  let fields = quotationWriteFields(p);
  if (fields.quotation_number) {
    const taken = await repo.quotationNumberExists(client, fields.quotation_number, id);
    if (taken) {
      throw new Error(
        `Quotation number "${fields.quotation_number}" is already used. Choose another number.`
      );
    }
  }
  const row = await repo.updateActive(client, id, fields, p.user_id ?? null);
  if (!row) throw new Error('Quotation not found.');
  return row;
}

export async function upsertQuotation(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{ row: QuotationRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.vendor_id) throw new Error('vendorId is required.');
  if (!p.name) throw new Error('name is required.');

  const id =
    typeof body.id === 'string' && body.id.trim()
      ? body.id.trim()
      : `quotation_${randomUUID().replace(/-/g, '')}`;

  const existing = await getQuotationByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const row = await insertQuotation(client, tenantId, id, p, actorUserId);
    await syncQuotationIntelligence(client, tenantId, id, p);
    return { row, conflict: false, wasInsert: true };
  }

  let existingRow = existing;
  if (existingRow.deleted_at) {
    await new QuotationRepository(tenantId).reviveDeleted(client, id);
    existingRow = { ...existingRow, deleted_at: null, version: 1 };
  }

  if (p.version != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'quotations',
      entityId: id,
      clientVersion: p.version,
    });
    if (lww.conflict) return { row: existingRow, conflict: true, wasInsert: false };
  }

  const oldApi = rowToQuotationApi(existingRow);
  const row = await updateQuotationRow(client, tenantId, id, p);
  await syncQuotationIntelligence(client, tenantId, id, p);
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'quotations',
    entityType: 'quotation',
    entityId: row.id,
    action: 'update',
    summary: `Quotation ${row.name} updated`,
    newValue: rowToQuotationApi(row),
    oldValue: oldApi,
    version: row.version,
  });
  return { row, conflict: false, wasInsert: false };
}

export async function softDeleteQuotation(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  const ex = await getQuotationByIdIncludingDeleted(client, tenantId, id);
  if (!ex || ex.deleted_at) return { ok: false, conflict: false };
  const oldApi = rowToQuotationApi(ex);

  if (expectedVersion != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'quotations',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };
  }

  await new QuotationRepository(tenantId).markDeleted(client, id);
  await recordDomainMutation(client, {
    tenantId,
    userId: ex.user_id,
    module: 'quotations',
    entityType: 'quotation',
    entityId: id,
    action: 'delete',
    summary: `Quotation ${ex.name} deleted`,
    oldValue: oldApi,
  });
  return { ok: true, conflict: false };
}
