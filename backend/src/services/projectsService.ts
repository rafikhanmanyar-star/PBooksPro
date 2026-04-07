import type pg from 'pg';
import { randomUUID } from 'crypto';

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
  const r = await client.query<ProjectRow>(
    `SELECT id, tenant_id, name, location, project_type, description, color, status, pm_config, installment_config, user_id, version, deleted_at, created_at, updated_at
     FROM projects WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
    [tenantId]
  );
  return r.rows;
}

export async function getProjectById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ProjectRow | null> {
  const r = await client.query<ProjectRow>(
    `SELECT id, tenant_id, name, location, project_type, description, color, status, pm_config, installment_config, user_id, version, deleted_at, created_at, updated_at
     FROM projects WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
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
  return r.rows[0];
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
      WHERE id = $9 AND tenant_id = $10 AND deleted_at IS NULL AND version = $11
      RETURNING id, tenant_id, name, location, project_type, description, color, status, pm_config, installment_config, user_id, version, deleted_at, created_at, updated_at`,
      [...vals, id, tenantId, expectedVersion]
    );
    if (r.rowCount === 0) {
      return { row: existing, conflict: true };
    }
    return { row: r.rows[0], conflict: false };
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
  return { row: r.rows[0] ?? null, conflict: false };
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

  if (expectedVersion !== undefined) {
    const r = await client.query(
      `UPDATE projects SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if (r.rowCount === 0) {
      const row = await getProjectById(client, tenantId, id);
      return { ok: false, conflict: !!row, hasUnits: false };
    }
    return { ok: true, conflict: false, hasUnits: false };
  }

  const r = await client.query(
    `UPDATE projects SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return { ok: (r.rowCount ?? 0) > 0, conflict: false, hasUnits: false };
}

/** Incremental sync: projects created/updated/deleted since `since` (includes soft-deleted rows). */
export async function listProjectsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<ProjectRow[]> {
  const r = await client.query<ProjectRow>(
    `SELECT id, tenant_id, name, location, project_type, description, color, status, pm_config, installment_config, user_id, version, deleted_at, created_at, updated_at
     FROM projects WHERE tenant_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}
