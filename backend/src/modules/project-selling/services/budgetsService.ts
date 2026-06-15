import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import { BudgetRepository } from '../repositories/BudgetRepository.js';

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
  return new BudgetRepository(tenantId).listActive(client, filters);
}

export async function getBudgetById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<BudgetRow | null> {
  return new BudgetRepository(tenantId).getById(client, id);
}

export async function getBudgetByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<BudgetRow | null> {
  return new BudgetRepository(tenantId).getByIdIncludingDeleted(client, id);
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

  const budgetRepo = new BudgetRepository(tenantId);
  const row = await budgetRepo.insertBudget(
    client,
    id,
    { category_id: p.category_id, project_id: p.project_id, amount: p.amount },
    userId ?? null
  );
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'budgets',
    entityType: 'budget',
    entityId: row.id,
    action: 'create',
    summary: `Budget ${row.id} created`,
    newValue: rowToBudgetApi(row),
    version: row.version,
  });
  return row;
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
  if (expectedVersion !== undefined) {
    if (existing.deleted_at) {
      if (existing.version !== expectedVersion) {
        return { row: existing, conflict: true, wasInsert: false };
      }
    } else {
      const lww = await checkEntityLwwConflict(client, {
        tenantId,
        table: 'budgets',
        entityId: id,
        clientVersion: expectedVersion,
      });
      if (lww.conflict) return { row: existing, conflict: true, wasInsert: false };
    }
  }

  const oldApi = rowToBudgetApi(existing);

  const budgetRepo = new BudgetRepository(tenantId);
  const budgetFields = {
    category_id: p.category_id,
    project_id: p.project_id,
    amount: p.amount,
  };

  if (existing.deleted_at) {
    const row = await budgetRepo.updateActive(client, id, budgetFields, {
      userId: userId ?? null,
      restoreDeleted: true,
    });
    if (!row) throw new Error('Budget restore failed.');
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'budgets',
      entityType: 'budget',
      entityId: row.id,
      action: 'update',
      summary: `Budget ${row.id} restored`,
      newValue: rowToBudgetApi(row),
      oldValue: oldApi,
      version: row.version,
    });
    return { row, conflict: false, wasInsert: false };
  }

  const row = await budgetRepo.updateActive(client, id, budgetFields, { userId: userId ?? null });
  if (!row) {
    return { row: existing, conflict: true, wasInsert: false };
  }
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'budgets',
    entityType: 'budget',
    entityId: row.id,
    action: 'update',
    summary: `Budget ${row.id} updated`,
    newValue: rowToBudgetApi(row),
    oldValue: oldApi,
    version: row.version,
  });
  return { row, conflict: false, wasInsert: false };
}

export async function softDeleteBudget(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  const ex = await getBudgetByIdIncludingDeleted(client, tenantId, id);
  const oldApi = ex ? rowToBudgetApi(ex) : undefined;

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'budgets',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const { ok } = await new BudgetRepository(tenantId).markDeleted(client, id, expectedVersion);
    if (!ok) {
      const ex = await getBudgetByIdIncludingDeleted(client, tenantId, id);
      if (!ex || ex.deleted_at) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    await recordDomainMutation(client, {
      tenantId,
      userId: ex?.user_id ?? null,
      module: 'budgets',
      entityType: 'budget',
      entityId: id,
      action: 'delete',
      summary: `Budget ${id} deleted`,
      oldValue: oldApi,
    });
    return { ok: true, conflict: false };
  }
  const { ok } = await new BudgetRepository(tenantId).markDeleted(client, id);
  if (ok) {
    await recordDomainMutation(client, {
      tenantId,
      userId: ex?.user_id ?? null,
      module: 'budgets',
      entityType: 'budget',
      entityId: id,
      action: 'delete',
      summary: `Budget ${id} deleted`,
      oldValue: oldApi,
    });
  }
  return { ok, conflict: false };
}

export async function listBudgetsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<BudgetRow[]> {
  return new BudgetRepository(tenantId).listChangedSince(client, since);
}
