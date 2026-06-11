import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, todayUtcYyyyMmDd } from '../utils/dateOnly.js';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import {
  RecurringInvoiceTemplateRepository,
  type RecurringInvoiceTemplateWriteFields,
} from '../modules/customers/repositories/RecurringInvoiceTemplateRepository.js';

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

function recurringTemplateWriteFields(
  p: ReturnType<typeof pickBody>
): RecurringInvoiceTemplateWriteFields {
  return {
    contact_id: p.contact_id,
    property_id: p.property_id,
    building_id: p.building_id,
    amount: p.amount,
    description_template: p.description_template,
    day_of_month: p.day_of_month,
    next_due_date: p.next_due_date,
    active: p.active,
    agreement_id: p.agreement_id ?? null,
    invoice_type: p.invoice_type || 'Rental',
    frequency: p.frequency ?? null,
    auto_generate: p.auto_generate,
    max_occurrences: p.max_occurrences,
    generated_count: p.generated_count,
    last_generated_date: p.last_generated_date,
  };
}

export async function listRecurringInvoiceTemplates(
  client: pg.PoolClient,
  tenantId: string
): Promise<RecurringInvoiceTemplateRow[]> {
  return new RecurringInvoiceTemplateRepository(tenantId).listActive(client);
}

export async function getRecurringInvoiceTemplateById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<RecurringInvoiceTemplateRow | null> {
  return new RecurringInvoiceTemplateRepository(tenantId).getById(client, id);
}

export async function getRecurringInvoiceTemplateByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<RecurringInvoiceTemplateRow | null> {
  return new RecurringInvoiceTemplateRepository(tenantId).getByIdIncludingDeleted(client, id);
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
    const row = await new RecurringInvoiceTemplateRepository(tenantId).insertTemplate(
      client,
      id,
      recurringTemplateWriteFields(p),
      actorUserId
    );
    if (!row) throw new Error('Insert recurring template failed.');
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'recurring_invoice_templates',
      entityType: 'recurring_invoice_template',
      entityId: row.id,
      action: 'create',
      summary: `Recurring invoice template ${row.id} created`,
      newValue: rowToRecurringInvoiceTemplateApi(row),
      version: row.version,
    });
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
        table: 'recurring_invoice_templates',
        entityId: id,
        clientVersion: expectedVersion,
      });
      if (lww.conflict) return { row: existing, conflict: true, wasInsert: false };
    }
  }

  const oldApi = rowToRecurringInvoiceTemplateApi(existing);

  const row = await new RecurringInvoiceTemplateRepository(tenantId).updateUpsert(
    client,
    id,
    recurringTemplateWriteFields(p),
    actorUserId
  );
  if (!row) throw new Error('Update recurring template failed.');
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'recurring_invoice_templates',
    entityType: 'recurring_invoice_template',
    entityId: row.id,
    action: 'update',
    summary: `Recurring invoice template ${row.id} updated`,
    newValue: rowToRecurringInvoiceTemplateApi(row),
    oldValue: oldApi,
    version: row.version,
  });
  return { row, conflict: false, wasInsert: false };
}

export async function softDeleteRecurringInvoiceTemplate(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  const ex = await getRecurringInvoiceTemplateByIdIncludingDeleted(client, tenantId, id);
  const oldApi = ex ? rowToRecurringInvoiceTemplateApi(ex) : undefined;

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'recurring_invoice_templates',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const ok = await new RecurringInvoiceTemplateRepository(tenantId).markDeleted(
      client,
      id,
      expectedVersion
    );
    if (!ok) {
      const ex = await getRecurringInvoiceTemplateById(client, tenantId, id);
      if (!ex) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    await recordDomainMutation(client, {
      tenantId,
      userId: ex?.user_id ?? null,
      module: 'recurring_invoice_templates',
      entityType: 'recurring_invoice_template',
      entityId: id,
      action: 'delete',
      summary: `Recurring invoice template ${id} deleted`,
      oldValue: oldApi,
    });
    return { ok: true, conflict: false };
  }
  const ok = await new RecurringInvoiceTemplateRepository(tenantId).markDeleted(client, id);
  if (ok) {
    await recordDomainMutation(client, {
      tenantId,
      userId: ex?.user_id ?? null,
      module: 'recurring_invoice_templates',
      entityType: 'recurring_invoice_template',
      entityId: id,
      action: 'delete',
      summary: `Recurring invoice template ${id} deleted`,
      oldValue: oldApi,
    });
  }
  return { ok, conflict: false };
}

export async function listRecurringInvoiceTemplatesChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<RecurringInvoiceTemplateRow[]> {
  return new RecurringInvoiceTemplateRepository(tenantId).listChangedSince(client, since);
}
