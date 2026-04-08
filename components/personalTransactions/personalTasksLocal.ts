/**
 * Personal tasks — local SQLite (Electron offline).
 */

import { getDatabaseService } from '../../services/database/databaseService';
import type { PersonalTaskApi } from '../../services/api/repositories/personalTasksApiRepository';

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const ALLOWED_STATUS = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
const ALLOWED_PRIORITY = new Set(['low', 'medium', 'high']);

function parseProgress(n: unknown): number {
  const v = typeof n === 'number' ? n : parseInt(String(n ?? '0'), 10);
  if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error('Progress must be between 0 and 100.');
  return v;
}

function rowToApi(r: Record<string, unknown>): PersonalTaskApi {
  const status = String(r.status ?? 'pending');
  const st = ALLOWED_STATUS.has(status) ? status : 'pending';
  const pr = String(r.priority ?? 'medium');
  const priority = ALLOWED_PRIORITY.has(pr) ? pr : 'medium';
  return {
    id: String(r.id),
    userId: r.user_id != null ? String(r.user_id) : undefined,
    title: String(r.title ?? ''),
    description: r.description != null ? String(r.description) : undefined,
    createdDate: String(r.created_date ?? '').slice(0, 10),
    targetDate: String(r.target_date ?? '').slice(0, 10),
    status: st as PersonalTaskApi['status'],
    progress: typeof r.progress === 'number' ? r.progress : parseInt(String(r.progress ?? 0), 10) || 0,
    priority: priority as PersonalTaskApi['priority'],
    createdAt: r.created_at != null ? String(r.created_at) : undefined,
    updatedAt: r.updated_at != null ? String(r.updated_at) : undefined,
  };
}

export function listPersonalTasksLocal(userId: string): PersonalTaskApi[] {
  const db = getDatabaseService();
  if (!db.isReady()) return [];
  const rows = db.query<Record<string, unknown>>(
    `SELECT * FROM personal_tasks WHERE user_id = ? ORDER BY target_date ASC, created_at DESC`,
    [userId]
  );
  return rows.map(rowToApi);
}

export function getPersonalTaskLocal(userId: string, id: string): PersonalTaskApi | null {
  const db = getDatabaseService();
  if (!db.isReady()) return null;
  const rows = db.query<Record<string, unknown>>(
    `SELECT * FROM personal_tasks WHERE user_id = ? AND id = ?`,
    [userId, id]
  );
  return rows[0] ? rowToApi(rows[0]) : null;
}

export function calendarMonthLocal(userId: string, monthYm: string): Record<string, PersonalTaskApi[]> {
  const m = monthYm.trim();
  if (!/^\d{4}-\d{2}$/.test(m)) throw new Error('Invalid month. Use YYYY-MM.');
  const [yStr, moStr] = m.split('-');
  const y = parseInt(yStr, 10);
  const mo = parseInt(moStr, 10);
  const start = `${y}-${String(mo).padStart(2, '0')}-01`;
  const lastDay = new Date(y, mo, 0).getDate();
  const end = `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const db = getDatabaseService();
  if (!db.isReady()) return {};
  const rows = db.query<Record<string, unknown>>(
    `SELECT * FROM personal_tasks WHERE user_id = ? AND target_date >= ? AND target_date <= ? ORDER BY target_date ASC, title ASC`,
    [userId, start, end]
  );

  const out: Record<string, PersonalTaskApi[]> = {};
  for (const r of rows) {
    const t = rowToApi(r);
    const key = t.targetDate.slice(0, 10);
    if (!out[key]) out[key] = [];
    out[key].push(t);
  }
  return out;
}

export function createPersonalTaskLocal(
  userId: string,
  body: { title: string; description?: string; targetDate: string; priority?: string }
): PersonalTaskApi {
  const db = getDatabaseService();
  if (!db.isReady()) throw new Error('Database not ready.');

  const title = body.title.trim();
  if (!title) throw new Error('Title is required.');

  const createdDate = todayYmd();
  const targetDate = body.targetDate.slice(0, 10);
  if (targetDate < createdDate) throw new Error('Target date must be on or after created date.');

  const pr = body.priority ?? 'medium';
  const priority = ALLOWED_PRIORITY.has(pr) ? pr : 'medium';
  const id = newId();
  const description = body.description?.trim() ? body.description.trim() : null;

  db.execute(
    `INSERT INTO personal_tasks (id, user_id, title, description, created_date, target_date, status, progress, priority)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
    [id, userId, title, description, createdDate, targetDate, priority]
  );
  db.save();

  const row = getPersonalTaskLocal(userId, id);
  if (!row) throw new Error('Failed to create task.');
  return row;
}

export function updatePersonalTaskLocal(
  userId: string,
  id: string,
  body: Partial<{
    title: string;
    description: string | null;
    targetDate: string;
    status: string;
    progress: number;
    priority: string;
  }>
): PersonalTaskApi {
  const db = getDatabaseService();
  if (!db.isReady()) throw new Error('Database not ready.');

  const existing = getPersonalTaskLocal(userId, id);
  if (!existing) throw new Error('Not found.');

  const title = body.title !== undefined ? String(body.title).trim() : existing.title;
  if (!title) throw new Error('Title is required.');

  const createdDate = existing.createdDate;
  let targetDate = body.targetDate !== undefined ? body.targetDate.slice(0, 10) : existing.targetDate;
  if (targetDate < createdDate) throw new Error('Target date must be on or after created date.');

  const description =
    body.description !== undefined
      ? body.description != null && String(body.description).trim() !== ''
        ? String(body.description)
        : null
      : existing.description ?? null;

  let status =
    body.status !== undefined
      ? ALLOWED_STATUS.has(body.status)
        ? body.status
        : existing.status
      : existing.status;
  let progress = body.progress !== undefined ? parseProgress(body.progress) : existing.progress;
  if (status === 'completed') progress = 100;

  const priority =
    body.priority !== undefined && ALLOWED_PRIORITY.has(body.priority)
      ? body.priority
      : existing.priority;

  db.execute(
    `UPDATE personal_tasks SET title = ?, description = ?, target_date = ?, status = ?, progress = ?, priority = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [title, description, targetDate, status, progress, priority, id, userId]
  );
  db.save();

  const row = getPersonalTaskLocal(userId, id);
  if (!row) throw new Error('Failed to update task.');
  return row;
}

export function deletePersonalTaskLocal(userId: string, id: string): void {
  const db = getDatabaseService();
  if (!db.isReady()) throw new Error('Database not ready.');
  db.execute(`DELETE FROM personal_tasks WHERE id = ? AND user_id = ?`, [id, userId]);
  db.save();
}

/** Overdue or due within `days` (not completed/cancelled). */
export function listUpcomingTasksLocal(userId: string, days: number): PersonalTaskApi[] {
  const db = getDatabaseService();
  if (!db.isReady()) return [];
  const d = Math.min(365, Math.max(1, Math.floor(days)));
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + d);
  const hy = horizon.getFullYear();
  const hm = String(horizon.getMonth() + 1).padStart(2, '0');
  const hd = String(horizon.getDate()).padStart(2, '0');
  const horizonStr = `${hy}-${hm}-${hd}`;

  const rows = db.query<Record<string, unknown>>(
    `SELECT * FROM personal_tasks WHERE user_id = ?
       AND status NOT IN ('completed', 'cancelled')
       AND target_date <= ?`,
    [userId, horizonStr]
  );
  const mapped = rows.map(rowToApi);
  mapped.sort((a, b) => {
    if (a.targetDate !== b.targetDate) return a.targetDate.localeCompare(b.targetDate);
    return a.title.localeCompare(b.title);
  });
  return mapped;
}
