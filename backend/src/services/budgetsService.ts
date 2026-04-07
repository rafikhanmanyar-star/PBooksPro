import type pg from 'pg';
import { randomUUID } from 'crypto';

export type BudgetRow = {
  id: string;
  tenant_id: string;
  category_id: string;
  project_id: string;
  amount: string;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export function rowToBudgetApi(row: BudgetRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    categoryId: row.category_id,
    projectId: row.project_id,
    amount: Number(row.amount),
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
  if (row.user_id) base.userId = row.user_id;
  if (row.deleted_at) {
    base.deletedAt =
      row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  return base;
}

function pickBody(body: Record<string, unknown>) {
  const categoryId = String(body.categoryId ?? body.category_id ?? '').trim();
  const projectId = String(body.projectId ?? body.project_id ?? '').trim();
  const amount = Number(body.amount ?? 0);
  return {
    category_id: categoryId,
    project_id: projectId,
    amount,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

export async function listBudgets(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { projectId?: string }
): Promise<BudgetRow[]> {
  const projectId = filters?.projectId?.trim();
  if (projectId) {
    const r = await client.query<BudgetRow>(
      `SELECT id, tenant_id, category_id, project_id, amount::text, user_id, version, deleted_at, created_at, updated_at
       FROM budgets WHERE tenant_id = $1 AND deleted_at IS NULL AND project_id = $2
       ORDER BY category_id ASC`,
      [tenantId, projectId]
    );
    return r.rows;
  }
  const r = await client.query<BudgetRow>(
    `SELECT id, tenant_id, category_id, project_id, amount::text, user_id, version, deleted_at, created_at, updated_at
     FROM budgets WHERE tenant_id = $1 AND deleted_at IS NULL
     ORDER BY project_id ASC, category_id ASC`,
    [tenantId]
  );
  return r.rows;
}

export async function getBudgetById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<BudgetRow | null> {
  const r = await client.query<BudgetRow>(
    `SELECT id, tenant_id, category_id, project_id, amount::text, user_id, version, deleted_at, created_at, updated_at
     FROM budgets WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function getBudgetByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<BudgetRow | null> {
  const r = await client.query<BudgetRow>(
    `SELECT id, tenant_id, category_id, project_id, amount::text, user_id, version, deleted_at, created_at, updated_at
     FROM budgets WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function createBudget(
  client: pg.PoolClient,
  tenantId: string,
  userId: string | undefined,
  body: Record<string, unknown>
): Promise<BudgetRow> {
  const p = pickBody(body);
  if (!p.category_id) throw new Error('categoryId is required.');
  if (!p.project_id) throw new Error('projectId is required.');
  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `budget_${randomUUID().replace(/-/g, '')}`;

  const r = await client.query<BudgetRow>(
    `INSERT INTO budgets (
       id, tenant_id, category_id, project_id, amount, user_id, version, deleted_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, 1, NULL, NOW(), NOW()
     )
     RETURNING id, tenant_id, category_id, project_id, amount::text, user_id, version, deleted_at, created_at, updated_at`,
    [id, tenantId, p.category_id, p.project_id, p.amount, userId ?? null]
  );
  return r.rows[0];
}

export async function upsertBudget(
  client: pg.PoolClient,
  tenantId: string,
  userId: string | undefined,
  body: Record<string, unknown>
): Promise<{ row: BudgetRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.category_id) throw new Error('categoryId is required.');
  if (!p.project_id) throw new Error('projectId is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `budget_${randomUUID().replace(/-/g, '')}`;

  const existing = await getBudgetByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const row = await createBudget(client, tenantId, userId, { ...body, id });
    return { row, conflict: false, wasInsert: true };
  }

  const expectedVersion = p.version;
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    return { row: existing, conflict: true, wasInsert: false };
  }

  if (existing.deleted_at) {
    const u = await client.query<BudgetRow>(
      `UPDATE budgets SET
         category_id = $3, project_id = $4, amount = $5, user_id = COALESCE($6, user_id),
         deleted_at = NULL, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, tenant_id, category_id, project_id, amount::text, user_id, version, deleted_at, created_at, updated_at`,
      [id, tenantId, p.category_id, p.project_id, p.amount, userId ?? null]
    );
    return { row: u.rows[0], conflict: false, wasInsert: false };
  }

  const u = await client.query<BudgetRow>(
    `UPDATE budgets SET
       category_id = $3, project_id = $4, amount = $5, user_id = COALESCE($6, user_id),
       version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, category_id, project_id, amount::text, user_id, version, deleted_at, created_at, updated_at`,
    [id, tenantId, p.category_id, p.project_id, p.amount, userId ?? null]
  );
  if (u.rows.length === 0) {
    return { row: existing, conflict: true, wasInsert: false };
  }
  return { row: u.rows[0], conflict: false, wasInsert: false };
}

export async function softDeleteBudget(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  if (expectedVersion !== undefined) {
    const u = await client.query(
      `UPDATE budgets SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if ((u.rowCount ?? 0) === 0) {
      const ex = await getBudgetByIdIncludingDeleted(client, tenantId, id);
      if (!ex || ex.deleted_at) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    return { ok: true, conflict: false };
  }
  const u = await client.query(
    `UPDATE budgets SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return { ok: (u.rowCount ?? 0) > 0, conflict: false };
}

export async function listBudgetsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<BudgetRow[]> {
  const r = await client.query<BudgetRow>(
    `SELECT id, tenant_id, category_id, project_id, amount::text, user_id, version, deleted_at, created_at, updated_at
     FROM budgets WHERE tenant_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}
