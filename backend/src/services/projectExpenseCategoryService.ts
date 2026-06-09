import type pg from 'pg';
import { randomUUID } from 'crypto';

export type ProjectExpenseCategoryRow = {
  id: string;
  tenant_id: string;
  name: string;
  gl_account_id: string;
  is_active: boolean;
  description: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function newId(): string {
  return randomUUID();
}

export function rowToPeCategoryApi(row: ProjectExpenseCategoryRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    glAccountId: row.gl_account_id,
    isActive: row.is_active,
    description: row.description ?? undefined,
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    ...(row.deleted_at
      ? { deletedAt: row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at }
      : {}),
  };
}

const SELECT_COLS = `id, tenant_id, name, gl_account_id, is_active, description, version, deleted_at, created_at, updated_at`;

function pickCategoryBody(body: Record<string, unknown>) {
  const name = String(body.name ?? '').trim();
  if (!name) throw new Error('Category name is required.');
  const glAccountId = String(body.glAccountId ?? body.gl_account_id ?? '').trim();
  if (!glAccountId) throw new Error('GL account mapping is required.');
  const isActiveRaw = body.isActive ?? body.is_active;
  const isActive = isActiveRaw === false || isActiveRaw === 0 || isActiveRaw === 'false' ? false : true;
  const description =
    body.description != null && String(body.description).trim() !== ''
      ? String(body.description).trim()
      : null;
  return { name, gl_account_id: glAccountId, is_active: isActive, description };
}

export async function listProjectExpenseCategories(
  client: pg.PoolClient,
  tenantId: string,
  opts?: { activeOnly?: boolean }
): Promise<ProjectExpenseCategoryRow[]> {
  const activeOnly = opts?.activeOnly === true;
  const r = await client.query<ProjectExpenseCategoryRow>(
    `SELECT ${SELECT_COLS}
     FROM project_expense_categories
     WHERE tenant_id = $1 AND deleted_at IS NULL
       ${activeOnly ? 'AND is_active = TRUE' : ''}
     ORDER BY name ASC`,
    [tenantId]
  );
  return r.rows;
}

export async function getProjectExpenseCategoryById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ProjectExpenseCategoryRow | null> {
  const r = await client.query<ProjectExpenseCategoryRow>(
    `SELECT ${SELECT_COLS}
     FROM project_expense_categories
     WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [tenantId, id]
  );
  return r.rows[0] ?? null;
}

export async function upsertProjectExpenseCategory(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>
): Promise<{ row: ProjectExpenseCategoryRow; wasInsert: boolean; conflict?: boolean }> {
  const picked = pickCategoryBody(body);
  const id = String(body.id ?? '').trim() || newId();
  const expectedVersion =
    body.version != null && Number.isFinite(Number(body.version)) ? Number(body.version) : undefined;

  const existing = await getProjectExpenseCategoryById(client, tenantId, id);
  if (existing && expectedVersion != null && existing.version !== expectedVersion) {
    return { row: existing, wasInsert: false, conflict: true };
  }

  if (existing) {
    await client.query(
      `UPDATE project_expense_categories
       SET name = $1, gl_account_id = $2, is_active = $3, description = $4,
           version = version + 1, updated_at = NOW()
       WHERE tenant_id = $5 AND id = $6 AND deleted_at IS NULL`,
      [picked.name, picked.gl_account_id, picked.is_active, picked.description, tenantId, id]
    );
  } else {
    await client.query(
      `INSERT INTO project_expense_categories
         (id, tenant_id, name, gl_account_id, is_active, description, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW())`,
      [id, tenantId, picked.name, picked.gl_account_id, picked.is_active, picked.description]
    );
  }

  const row = await getProjectExpenseCategoryById(client, tenantId, id);
  if (!row) throw new Error('Failed to save expense category.');
  return { row, wasInsert: !existing };
}

export async function softDeleteProjectExpenseCategory(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict?: boolean }> {
  const existing = await getProjectExpenseCategoryById(client, tenantId, id);
  if (!existing) return { ok: false };
  if (expectedVersion != null && existing.version !== expectedVersion) {
    return { ok: false, conflict: true };
  }

  const inUse = await client.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM project_expense_vouchers
     WHERE tenant_id = $1 AND expense_category_id = $2 AND deleted_at IS NULL`,
    [tenantId, id]
  );
  if (Number(inUse.rows[0]?.cnt ?? 0) > 0) {
    throw new Error('Cannot delete category that is used by expense vouchers.');
  }

  await client.query(
    `UPDATE project_expense_categories SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [tenantId, id]
  );
  return { ok: true };
}
