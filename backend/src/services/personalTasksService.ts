import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from '../utils/dateOnly.js';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { PersonalTaskRepository } from '../modules/personal-finance/repositories/PersonalTaskRepository.js';

export type PersonalTaskRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  created_date: Date;
  target_date: Date;
  status: string;
  progress: number;
  priority: string;
  created_at: Date;
  updated_at: Date;
};

const ALLOWED_STATUS = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
const ALLOWED_PRIORITY = new Set(['low', 'medium', 'high']);

export function rowToPersonalTaskApi(row: PersonalTaskRow): Record<string, unknown> {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description ?? undefined,
    createdDate: formatPgDateToYyyyMmDd(row.created_date),
    targetDate: formatPgDateToYyyyMmDd(row.target_date),
    status: row.status,
    progress: row.progress,
    priority: row.priority,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

async function assertUserInTenant(
  client: pg.PoolClient,
  userId: string,
  tenantId: string
): Promise<void> {
  const ok = await new PersonalTaskRepository(tenantId).userBelongsToTenant(client, userId);
  if (!ok) {
    throw new Error('User not found for tenant.');
  }
}

function parseProgress(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Progress must be between 0 and 100.');
  return n;
}

function normalizeStatus(raw: unknown, fallback: string): string {
  const s = String(raw ?? fallback).trim();
  if (!ALLOWED_STATUS.has(s)) throw new Error(`Invalid status. Allowed: ${[...ALLOWED_STATUS].join(', ')}`);
  return s;
}

function normalizePriority(raw: unknown, fallback: string): string {
  const p = String(raw ?? fallback).trim();
  if (!ALLOWED_PRIORITY.has(p)) throw new Error(`Invalid priority. Allowed: ${[...ALLOWED_PRIORITY].join(', ')}`);
  return p;
}

export async function createPersonalTask(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>
): Promise<PersonalTaskRow> {
  await assertUserInTenant(client, userId, tenantId);

  const title = String(body.title ?? '').trim();
  if (!title) throw new Error('Title is required.');

  const targetDate = parseApiDateToYyyyMmDd(body.targetDate ?? body.target_date);
  const createdDate = parseApiDateToYyyyMmDd(body.createdDate ?? body.created_date ?? new Date().toISOString());

  if (targetDate < createdDate) {
    throw new Error('Target date must be on or after created date.');
  }

  const priority = normalizePriority(body.priority, 'medium');
  const description =
    body.description != null && String(body.description).trim() !== '' ? String(body.description) : null;

  let status = normalizeStatus(body.status ?? 'pending', 'pending');
  let progress = parseProgress(body.progress ?? 0);
  if (status === 'completed') progress = 100;

  const id = randomUUID();

  const row = await new PersonalTaskRepository(tenantId).insertTask(
    client,
    id,
    userId,
    title,
    description,
    createdDate,
    targetDate,
    status,
    progress,
    priority
  );
  if (!row) throw new Error('Failed to create task.');

  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'personal_finance',
    entityType: 'personal_task',
    entityId: row.id,
    action: 'create',
    summary: `Personal task ${row.title} created`,
    newValue: rowToPersonalTaskApi(row),
  });
  return row;
}

export async function listPersonalTasksForUser(
  client: pg.PoolClient,
  tenantId: string,
  userId: string
): Promise<PersonalTaskRow[]> {
  await assertUserInTenant(client, userId, tenantId);
  return new PersonalTaskRepository(tenantId).listForUser(client, userId);
}

/** Calendar month YYYY-MM: tasks grouped by target_date (YYYY-MM-DD keys). */
export async function listPersonalTasksCalendarMonth(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  monthYm: string
): Promise<Record<string, PersonalTaskRow[]>> {
  await assertUserInTenant(client, userId, tenantId);
  const m = String(monthYm).trim();
  if (!/^\d{4}-\d{2}$/.test(m)) throw new Error('Invalid month. Use YYYY-MM.');

  const [yStr, moStr] = m.split('-');
  const y = parseInt(yStr, 10);
  const mo = parseInt(moStr, 10);
  const start = `${y}-${String(mo).padStart(2, '0')}-01`;
  const lastDay = new Date(y, mo, 0).getDate();
  const end = `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const rows = await new PersonalTaskRepository(tenantId).listCalendarMonth(client, userId, start, end);

  const out: Record<string, PersonalTaskRow[]> = {};
  for (const row of rows) {
    const key = formatPgDateToYyyyMmDd(row.target_date);
    if (!out[key]) out[key] = [];
    out[key].push(row);
  }
  return out;
}

export async function getPersonalTaskById(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  id: string
): Promise<PersonalTaskRow | null> {
  return new PersonalTaskRepository(tenantId).getForUser(client, userId, id);
}

export async function updatePersonalTask(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  id: string,
  body: Record<string, unknown>
): Promise<PersonalTaskRow | null> {
  const existing = await new PersonalTaskRepository(tenantId).getForUser(client, userId, id);
  if (!existing) return null;

  const title =
    body.title !== undefined ? String(body.title).trim() : existing.title;
  if (!title) throw new Error('Title is required.');

  const createdDateStr = formatPgDateToYyyyMmDd(existing.created_date);

  let targetDate =
    body.targetDate !== undefined || body.target_date !== undefined
      ? parseApiDateToYyyyMmDd(body.targetDate ?? body.target_date)
      : formatPgDateToYyyyMmDd(existing.target_date);

  if (targetDate < createdDateStr) {
    throw new Error('Target date must be on or after created date.');
  }

  const description =
    body.description !== undefined
      ? body.description != null && String(body.description).trim() !== ''
        ? String(body.description)
        : null
      : existing.description;

  let status =
    body.status !== undefined ? normalizeStatus(body.status, existing.status) : existing.status;
  let progress =
    body.progress !== undefined ? parseProgress(body.progress) : existing.progress;
  if (status === 'completed') progress = 100;

  const priority =
    body.priority !== undefined ? normalizePriority(body.priority, existing.priority) : existing.priority;

  const row = await new PersonalTaskRepository(tenantId).updateActive(
    client,
    id,
    userId,
    title,
    description,
    targetDate,
    status,
    progress,
    priority
  );
  if (row) {
    await recordDomainMutation(client, {
      tenantId,
      userId,
      module: 'personal_finance',
      entityType: 'personal_task',
      entityId: row.id,
      action: 'update',
      summary: `Personal task ${row.title} updated`,
      newValue: rowToPersonalTaskApi(row),
      oldValue: rowToPersonalTaskApi(existing),
    });
  }
  return row;
}

export async function deletePersonalTask(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  id: string
): Promise<boolean> {
  const existing = await new PersonalTaskRepository(tenantId).getForUser(client, userId, id);
  if (!existing) return false;
  await new PersonalTaskRepository(tenantId).deleteForUser(client, id, userId);
  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'personal_finance',
    entityType: 'personal_task',
    entityId: id,
    action: 'delete',
    summary: `Personal task ${existing.title} deleted`,
    oldValue: rowToPersonalTaskApi(existing),
  });
  return true;
}

/**
 * Tasks that need attention for notifications: not completed/cancelled,
 * target within next `days` days (inclusive) or overdue.
 */
export async function listUpcomingPersonalTasks(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  days: number
): Promise<PersonalTaskRow[]> {
  await assertUserInTenant(client, userId, tenantId);
  const d = Math.min(365, Math.max(1, Math.floor(days)));
  const rows = await new PersonalTaskRepository(tenantId).listUpcoming(client, userId, d);
  rows.sort((a, b) => {
    const da = formatPgDateToYyyyMmDd(a.target_date);
    const db = formatPgDateToYyyyMmDd(b.target_date);
    if (da !== db) return da.localeCompare(db);
    return a.title.localeCompare(b.title);
  });
  return rows;
}
