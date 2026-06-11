import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import { ProjectRepository } from '../modules/project-selling/repositories/ProjectRepository.js';

export type ProjectRow = {
  id: string;
  tenant_id: string;
  name: string;
  location: string | null;
  project_type: string | null;
  description: string | null;
  color: string | null;
  status: string | null;
  pm_config: unknown | null;
  installment_config: unknown | null;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function parseJson(val: unknown): unknown {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return val;
}

export function rowToProjectApi(row: ProjectRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    location: row.location ?? undefined,
    projectType: row.project_type ?? undefined,
    description: row.description ?? undefined,
    color: row.color ?? undefined,
    status: row.status ?? 'Active',
    pmConfig: parseJson(row.pm_config) ?? undefined,
    installmentConfig: parseJson(row.installment_config) ?? undefined,
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
  let description: string | null | undefined;
  if (body.description === undefined) description = undefined;
  else if (body.description === null) description = null;
  else description = String(body.description);

  let location: string | null | undefined;
  if (body.location === undefined) location = undefined;
  else if (body.location === null) location = null;
  else location = String(body.location);

  const projectType = (body.projectType ?? body.project_type) as string | undefined;
  const color = (body.color as string | undefined) ?? undefined;
  const status = (body.status as string | undefined) ?? undefined;
  const version = typeof body.version === 'number' ? body.version : undefined;

  let pmConfig: unknown = body.pmConfig ?? body.pm_config;
  if (typeof pmConfig === 'string') pmConfig = parseJson(pmConfig);
  let installmentConfig: unknown = body.installmentConfig ?? body.installment_config;
  if (typeof installmentConfig === 'string') installmentConfig = parseJson(installmentConfig);

  return {
    name: String(body.name ?? '').trim(),
    location,
    project_type: projectType != null && projectType !== '' ? String(projectType) : undefined,
    description,
    color: color != null ? String(color) : undefined,
    status: status != null ? String(status) : undefined,
    pm_config: pmConfig !== undefined ? pmConfig : undefined,
    installment_config: installmentConfig !== undefined ? installmentConfig : undefined,
    version,
  };
}

export async function listProjects(client: pg.PoolClient, tenantId: string): Promise<ProjectRow[]> {
  return new ProjectRepository(tenantId).listActive(client);
}

export async function getProjectById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ProjectRow | null> {
  return new ProjectRepository(tenantId).getById(client, id);
}

export async function createProject(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>
): Promise<ProjectRow> {
  const p = pickBody(body);
  if (!p.name) throw new Error('Project name is required.');

  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID();

  const r = await client.query<ProjectRow>(
    `INSERT INTO projects (
      id, tenant_id, name, location, project_type, description, color, status, pm_config, installment_config, user_id, version, deleted_at, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, 1, NULL, NOW(), NOW()
    )
    RETURNING id, tenant_id, name, location, project_type, description, color, status, pm_config, installment_config, user_id, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.name,
      p.location === undefined ? null : p.location,
      p.project_type ?? null,
      p.description ?? null,
      p.color ?? null,
      p.status ?? 'Active',
      p.pm_config != null ? JSON.stringify(p.pm_config) : null,
      p.installment_config != null ? JSON.stringify(p.installment_config) : null,
      (body.userId ?? body.user_id) as string | null ?? null,
    ]
  );
  const row = r.rows[0];
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'projects',
    entityType: 'project',
    entityId: row.id,
    action: 'create',
    summary: `Project ${row.name} created`,
    newValue: rowToProjectApi(row),
    version: row.version,
  });
  return row;
}

export async function updateProject(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>
): Promise<{ row: ProjectRow | null; conflict: boolean }> {
  const existing = await getProjectById(client, tenantId, id);
  if (!existing) {
    return { row: null, conflict: false };
  }

  const merged: Record<string, unknown> = { ...rowToProjectApi(existing), ...body };
  const p = pickBody(merged);
  const expectedVersion = p.version;

  if (!p.name) throw new Error('Project name is required.');

  const vals = [
    p.name,
    p.location === undefined ? null : p.location,
    p.project_type ?? null,
    p.description ?? null,
    p.color ?? null,
    p.status ?? 'Active',
    p.pm_config != null ? JSON.stringify(p.pm_config) : null,
    p.installment_config != null ? JSON.stringify(p.installment_config) : null,
  ];

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'projects',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: existing, conflict: true };

    const r = await client.query<ProjectRow>(
      `UPDATE projects SET
        name = $1,
        location = $2,
        project_type = $3,
        description = $4,
        color = $5,
        status = $6,
        pm_config = $7::jsonb,
        installment_config = $8::jsonb,
        version = version + 1,
        updated_at = NOW()
      WHERE id = $9 AND tenant_id = $10 AND deleted_at IS NULL
      RETURNING id, tenant_id, name, location, project_type, description, color, status, pm_config, installment_config, user_id, version, deleted_at, created_at, updated_at`,
      [...vals, id, tenantId]
    );
    const row = r.rows[0] ?? null;
    if (!row) return { row: null, conflict: false };
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'projects',
      entityType: 'project',
      entityId: row.id,
      action: 'update',
      summary: `Project ${row.name} updated`,
      newValue: rowToProjectApi(row),
      version: row.version,
    });
    return { row, conflict: false };
  }

  const r = await client.query<ProjectRow>(
    `UPDATE projects SET
      name = $1,
      location = $2,
      project_type = $3,
      description = $4,
      color = $5,
      status = $6,
      pm_config = $7::jsonb,
      installment_config = $8::jsonb,
      version = version + 1,
      updated_at = NOW()
    WHERE id = $9 AND tenant_id = $10 AND deleted_at IS NULL
    RETURNING id, tenant_id, name, location, project_type, description, color, status, pm_config, installment_config, user_id, version, deleted_at, created_at, updated_at`,
    [...vals, id, tenantId]
  );
  const row = r.rows[0] ?? null;
  if (row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'projects',
      entityType: 'project',
      entityId: row.id,
      action: 'update',
      summary: `Project ${row.name} updated`,
      newValue: rowToProjectApi(row),
      version: row.version,
    });
  }
  return { row, conflict: false };
}

export async function softDeleteProject(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean; hasUnits: boolean }> {
  const unitCount = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM units WHERE tenant_id = $1 AND project_id = $2 AND deleted_at IS NULL`,
    [tenantId, id]
  );
  const n = parseInt(unitCount.rows[0]?.c ?? '0', 10);
  if (n > 0) {
    return { ok: false, conflict: false, hasUnits: true };
  }

  const before = await getProjectById(client, tenantId, id);
  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'projects',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true, hasUnits: false };

    const r = await client.query(
      `UPDATE projects SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, tenant_id, name, location, project_type, description, color, status, pm_config, installment_config, user_id, version, deleted_at, created_at, updated_at`,
      [id, tenantId]
    );
    if (r.rowCount === 0) return { ok: false, conflict: false, hasUnits: false };
    const row = r.rows[0] as ProjectRow;
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'projects',
      entityType: 'project',
      entityId: row.id,
      action: 'delete',
      summary: `Project ${row.name} deleted`,
      oldValue: before ? rowToProjectApi(before) : null,
      version: row.version,
    });
    return { ok: true, conflict: false, hasUnits: false };
  }

  const r = await client.query(
    `UPDATE projects SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, name, location, project_type, description, color, status, pm_config, installment_config, user_id, version, deleted_at, created_at, updated_at`,
    [id, tenantId]
  );
  const ok = (r.rowCount ?? 0) > 0;
  if (ok && r.rows[0]) {
    const row = r.rows[0] as ProjectRow;
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'projects',
      entityType: 'project',
      entityId: row.id,
      action: 'delete',
      summary: `Project ${row.name} deleted`,
      oldValue: before ? rowToProjectApi(before) : null,
      version: row.version,
    });
  }
  return { ok, conflict: false, hasUnits: false };
}

/** Incremental sync: projects created/updated/deleted since `since` (includes soft-deleted rows). */
export async function listProjectsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<ProjectRow[]> {
  return new ProjectRepository(tenantId).listChangedSince(client, since);
}
