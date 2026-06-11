import type pg from 'pg';
import { randomUUID } from 'crypto';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import type { ChangeLogAction } from './changeLogService.js';
import {
  ProjectExpenseCategoryRepository,
  type ProjectExpenseCategoryRow,
} from '../modules/project-expense/repositories/ProjectExpenseCategoryRepository.js';

export type { ProjectExpenseCategoryRow };

export function rowToPeCategoryApi(row: ProjectExpenseCategoryRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function auditPeCategory(
  client: pg.PoolClient,
  params: {
    tenantId: string;
    userId: string | null;
    entityId: string;
    auditAction: 'create' | 'update' | 'delete';
    summary: string;
    row?: ProjectExpenseCategoryRow;
    version?: number;
  }
): Promise<void> {
  const action: ChangeLogAction =
    params.auditAction === 'delete' ? 'delete' : params.auditAction === 'create' ? 'create' : 'update';
  await recordDomainMutation(client, {
    tenantId: params.tenantId,
    userId: params.userId,
    module: 'project_expense',
    entityType: 'project_expense_category',
    entityId: params.entityId,
    action,
    auditAction: params.auditAction,
    summary: params.summary,
    newValue: params.row ? rowToPeCategoryApi(params.row) : undefined,
    version: params.version ?? params.row?.version,
  });
}

export async function listProjectExpenseCategories(
  client: pg.PoolClient,
  tenantId: string,
  options?: { activeOnly?: boolean }
): Promise<ProjectExpenseCategoryRow[]> {
  return new ProjectExpenseCategoryRepository(tenantId).list(client, options);
}

export async function upsertProjectExpenseCategory(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null = null
): Promise<{ row: ProjectExpenseCategoryRow; wasInsert: boolean; conflict?: boolean }> {
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw new Error('Category name is required.');

  const description =
    typeof body.description === 'string' ? body.description.trim() || null : null;
  const isActive = body.isActive !== false && body.is_active !== false;
  const clientVersion =
    typeof body.version === 'number'
      ? body.version
      : typeof body.version === 'string' && body.version !== ''
        ? Number(body.version)
        : undefined;

  const repo = new ProjectExpenseCategoryRepository(tenantId);
  const existing = await repo.getByIdForUpdate(client, id);
  if (existing) {
    if (clientVersion != null) {
      const conflict = await checkEntityLwwConflict(client, {
        clientVersion,
        table: 'project_expense_categories',
        entityId: id,
        tenantId,
      });
      if (conflict) return { row: existing, wasInsert: false, conflict: true };
    }

    const r = await client.query<ProjectExpenseCategoryRow>(
      `UPDATE project_expense_categories SET
         name = $1, description = $2, is_active = $3, version = version + 1, updated_at = NOW()
       WHERE tenant_id = $4 AND id = $5 AND deleted_at IS NULL
       RETURNING id, tenant_id, name, description, is_active, version, created_at, updated_at, deleted_at`,
      [name, description, isActive, tenantId, id]
    );
    const row = r.rows[0];
    if (!row) throw new Error('Category not found after update.');

    await auditPeCategory(client, {
      tenantId,
      userId: actorUserId,
      entityId: id,
      auditAction: 'update',
      summary: `Expense category "${name}" updated`,
      row,
    });
    return { row, wasInsert: false };
  }

  const r = await client.query<ProjectExpenseCategoryRow>(
    `INSERT INTO project_expense_categories (id, tenant_id, name, description, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, tenant_id, name, description, is_active, version, created_at, updated_at, deleted_at`,
    [id, tenantId, name, description, isActive]
  );
  const row = r.rows[0];

  await auditPeCategory(client, {
    tenantId,
    userId: actorUserId,
    entityId: id,
    auditAction: 'create',
    summary: `Expense category "${name}" created`,
    row,
  });
  return { row, wasInsert: true };
}

export async function softDeleteProjectExpenseCategory(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  actorUserId: string | null = null,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict?: boolean }> {
  const repo = new ProjectExpenseCategoryRepository(tenantId);
  const row = await repo.getByIdForUpdate(client, id);
  if (!row) return { ok: false };

  if (expectedVersion != null) {
    const conflict = await checkEntityLwwConflict(client, {
      clientVersion: expectedVersion,
      table: 'project_expense_categories',
      entityId: id,
      tenantId,
    });
    if (conflict) return { ok: false, conflict: true };
  }

  await client.query(
    `UPDATE project_expense_categories SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [tenantId, id]
  );

  await auditPeCategory(client, {
    tenantId,
    userId: actorUserId,
    entityId: id,
    auditAction: 'delete',
    summary: `Expense category "${row.name}" deleted`,
    version: row.version + 1,
  });
  return { ok: true };
}
