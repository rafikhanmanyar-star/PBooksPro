import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, todayUtcYyyyMmDd } from '../utils/dateOnly.js';

export type RecurringInvoiceTemplateRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  contact_id: string;
  property_id: string;
  building_id: string;
  amount: string | number;
  description_template: string;
  day_of_month: number;
  next_due_date: Date | string;
  active: boolean;
  agreement_id: string | null;
  invoice_type: string | null;
  frequency: string | null;
  auto_generate: boolean;
  max_occurrences: number | null;
  generated_count: number;
  last_generated_date: Date | string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function optStr(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function rowToRecurringInvoiceTemplateApi(row: RecurringInvoiceTemplateRow): Record<string, unknown> {
  const nextDue = formatPgDateToYyyyMmDd(row.next_due_date);
  const lastGen = row.last_generated_date != null
    ? formatPgDateToYyyyMmDd(row.last_generated_date)
    : undefined;

  const base: Record<string, unknown> = {
    id: row.id,
    contactId: row.contact_id,
    propertyId: row.property_id,
    buildingId: row.building_id,
    amount: typeof row.amount === 'string' ? parseFloat(row.amount) : Number(row.amount),
    descriptionTemplate: row.description_template,
    dayOfMonth: row.day_of_month,
    nextDueDate: nextDue,
    active: row.active,
    agreementId: row.agreement_id ?? undefined,
    invoiceType: row.invoice_type ?? 'Rental',
    frequency: row.frequency ?? undefined,
    autoGenerate: row.auto_generate,
    maxOccurrences: row.max_occurrences ?? undefined,
    generatedCount: row.generated_count,
    lastGeneratedDate: lastGen,
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
  if (row.deleted_at) {
    base.deletedAt =
      row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  return base;
}

function pickBody(body: Record<string, unknown>) {
  const amountRaw = body.amount;
  const amount =
    typeof amountRaw === 'number'
      ? amountRaw
      : typeof amountRaw === 'string'
        ? parseFloat(amountRaw)
        : NaN;
  const dayRaw = body.dayOfMonth ?? body.day_of_month;
  const dayOfMonth =
    typeof dayRaw === 'number' ? dayRaw : parseInt(String(dayRaw ?? '1'), 10) || 1;
  const nextDue = String(body.nextDueDate ?? body.next_due_date ?? '').slice(0, 10);
  const genCountRaw = body.generatedCount ?? body.generated_count;
  const generatedCount =
    typeof genCountRaw === 'number'
      ? genCountRaw
      : parseInt(String(genCountRaw ?? '0'), 10) || 0;

  return {
    contact_id: String(body.contactId ?? body.contact_id ?? '').trim(),
    property_id: String(body.propertyId ?? body.property_id ?? '').trim(),
    building_id: String(body.buildingId ?? body.building_id ?? '').trim(),
    amount: Number.isFinite(amount) ? amount : 0,
    description_template: String(body.descriptionTemplate ?? body.description_template ?? '').trim(),
    day_of_month: dayOfMonth,
    next_due_date: nextDue || todayUtcYyyyMmDd(),
    active:
      body.active === true ||
      body.active === 1 ||
      body.active === 'true' ||
      body.active === '1',
    agreement_id: optStr(body.agreementId ?? body.agreement_id),
    invoice_type: (body.invoiceType ?? body.invoice_type ?? 'Rental') as string,
    frequency: optStr(body.frequency),
    auto_generate:
      body.autoGenerate === true ||
      body.autoGenerate === 1 ||
      body.auto_generate === true ||
      body.auto_generate === 1,
    max_occurrences:
      body.maxOccurrences === null || body.max_occurrences === null
        ? null
        : (() => {
            const m = body.maxOccurrences ?? body.max_occurrences;
            if (m === undefined || m === '') return null;
            const n = typeof m === 'number' ? m : parseInt(String(m), 10);
            return Number.isFinite(n) ? n : null;
          })(),
    generated_count: generatedCount,
    last_generated_date: (() => {
      const v = body.lastGeneratedDate ?? body.last_generated_date;
      if (v === undefined || v === null || v === '') return null;
      return String(v).slice(0, 10);
    })(),
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

export async function listRecurringInvoiceTemplates(
  client: pg.PoolClient,
  tenantId: string
): Promise<RecurringInvoiceTemplateRow[]> {
  const r = await client.query<RecurringInvoiceTemplateRow>(
    `SELECT id, tenant_id, user_id, contact_id, property_id, building_id, amount, description_template, day_of_month,
            next_due_date, active, agreement_id, invoice_type, frequency, auto_generate, max_occurrences,
            generated_count, last_generated_date, version, deleted_at, created_at, updated_at
     FROM recurring_invoice_templates
     WHERE tenant_id = $1 AND deleted_at IS NULL
     ORDER BY next_due_date ASC, id ASC`,
    [tenantId]
  );
  return r.rows;
}

export async function getRecurringInvoiceTemplateById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<RecurringInvoiceTemplateRow | null> {
  const r = await client.query<RecurringInvoiceTemplateRow>(
    `SELECT id, tenant_id, user_id, contact_id, property_id, building_id, amount, description_template, day_of_month,
            next_due_date, active, agreement_id, invoice_type, frequency, auto_generate, max_occurrences,
            generated_count, last_generated_date, version, deleted_at, created_at, updated_at
     FROM recurring_invoice_templates
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function getRecurringInvoiceTemplateByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<RecurringInvoiceTemplateRow | null> {
  const r = await client.query<RecurringInvoiceTemplateRow>(
    `SELECT id, tenant_id, user_id, contact_id, property_id, building_id, amount, description_template, day_of_month,
            next_due_date, active, agreement_id, invoice_type, frequency, auto_generate, max_occurrences,
            generated_count, last_generated_date, version, deleted_at, created_at, updated_at
     FROM recurring_invoice_templates WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function upsertRecurringInvoiceTemplate(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{ row: RecurringInvoiceTemplateRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.contact_id) throw new Error('contactId is required.');
  if (!p.property_id) throw new Error('propertyId is required.');
  if (!p.building_id) throw new Error('buildingId is required.');
  if (!p.description_template) throw new Error('descriptionTemplate is required.');

  const id =
    typeof body.id === 'string' && body.id.trim()
      ? body.id.trim()
      : `rit_${randomUUID().replace(/-/g, '')}`;

  const existing = await getRecurringInvoiceTemplateByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const r = await client.query<RecurringInvoiceTemplateRow>(
      `INSERT INTO recurring_invoice_templates (
         id, tenant_id, user_id, contact_id, property_id, building_id, amount, description_template, day_of_month,
         next_due_date, active, agreement_id, invoice_type, frequency, auto_generate, max_occurrences,
         generated_count, last_generated_date, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12, $13, $14, $15, $16, $17, $18, 1, NULL, NOW(), NOW()
       )
       RETURNING id, tenant_id, user_id, contact_id, property_id, building_id, amount, description_template, day_of_month,
                 next_due_date, active, agreement_id, invoice_type, frequency, auto_generate, max_occurrences,
                 generated_count, last_generated_date, version, deleted_at, created_at, updated_at`,
      [
        id,
        tenantId,
        actorUserId,
        p.contact_id,
        p.property_id,
        p.building_id,
        p.amount,
        p.description_template,
        p.day_of_month,
        p.next_due_date,
        p.active,
        p.agreement_id,
        p.invoice_type || 'Rental',
        p.frequency ?? null,
        p.auto_generate,
        p.max_occurrences,
        p.generated_count,
        p.last_generated_date,
      ]
    );
    const row = r.rows[0];
    if (!row) throw new Error('Insert recurring template failed.');
    return { row, conflict: false, wasInsert: true };
  }

  const expectedVersion = p.version;
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    return { row: existing, conflict: true, wasInsert: false };
  }

  const u = await client.query<RecurringInvoiceTemplateRow>(
    `UPDATE recurring_invoice_templates SET
       user_id = COALESCE($3, user_id),
       contact_id = $4, property_id = $5, building_id = $6, amount = $7, description_template = $8,
       day_of_month = $9, next_due_date = $10::date, active = $11, agreement_id = $12, invoice_type = $13,
       frequency = $14, auto_generate = $15, max_occurrences = $16, generated_count = $17,
       last_generated_date = $18::date, deleted_at = NULL, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, tenant_id, user_id, contact_id, property_id, building_id, amount, description_template, day_of_month,
               next_due_date, active, agreement_id, invoice_type, frequency, auto_generate, max_occurrences,
               generated_count, last_generated_date, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      actorUserId,
      p.contact_id,
      p.property_id,
      p.building_id,
      p.amount,
      p.description_template,
      p.day_of_month,
      p.next_due_date,
      p.active,
      p.agreement_id,
      p.invoice_type || 'Rental',
      p.frequency ?? null,
      p.auto_generate,
      p.max_occurrences,
      p.generated_count,
      p.last_generated_date,
    ]
  );
  const row = u.rows[0];
  if (!row) throw new Error('Update recurring template failed.');
  return { row, conflict: false, wasInsert: false };
}

export async function softDeleteRecurringInvoiceTemplate(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  if (expectedVersion !== undefined) {
    const r = await client.query(
      `UPDATE recurring_invoice_templates SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if (r.rowCount === 0) {
      const ex = await getRecurringInvoiceTemplateById(client, tenantId, id);
      if (!ex) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    return { ok: true, conflict: false };
  }
  const r = await client.query(
    `UPDATE recurring_invoice_templates SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return { ok: (r.rowCount ?? 0) > 0, conflict: false };
}

export async function listRecurringInvoiceTemplatesChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<RecurringInvoiceTemplateRow[]> {
  const r = await client.query<RecurringInvoiceTemplateRow>(
    `SELECT id, tenant_id, user_id, contact_id, property_id, building_id, amount, description_template, day_of_month,
            next_due_date, active, agreement_id, invoice_type, frequency, auto_generate, max_occurrences,
            generated_count, last_generated_date, version, deleted_at, created_at, updated_at
     FROM recurring_invoice_templates WHERE tenant_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}
