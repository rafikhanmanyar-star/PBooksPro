import { randomUUID } from 'node:crypto';
import { getPool } from '../../../db/pool.js';

export type ReportVisibility = 'private' | 'team' | 'company';

export type ReportDefinitionRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  category: string | null;
  module: string;
  report_type: string;
  tags: string[];
  visibility: ReportVisibility;
  configuration_json: unknown;
  created_by: string | null;
  updated_by: string | null;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
  is_favorite?: boolean;
  pinned?: boolean;
  last_opened_at?: Date | null;
};

export type ReportFavoriteRow = {
  id: string;
  report_definition_id: string | null;
  pinned: boolean;
  last_opened_at: Date | null;
};

function accessibleWhere(alias = 'rd'): string {
  return `(
    ${alias}.created_by = $2
    OR ${alias}.visibility IN ('team', 'company')
    OR EXISTS (
      SELECT 1 FROM report_shares rs
      WHERE rs.tenant_id = ${alias}.tenant_id
        AND rs.report_definition_id = ${alias}.id
        AND (
          rs.shared_with_user_id = $2
          OR rs.shared_with_role = (
            SELECT u.role FROM users u
            WHERE u.id = $2 AND u.tenant_id = ${alias}.tenant_id
            LIMIT 1
          )
        )
    )
  )`;
}

export async function listAccessibleDefinitions(params: {
  tenantId: string;
  userId: string;
  module?: string;
}): Promise<ReportDefinitionRow[]> {
  const pool = getPool();
  const mod = params.module?.trim();
  const res = await pool.query<ReportDefinitionRow>(
    `
    SELECT rd.*,
           EXISTS (
             SELECT 1 FROM report_favorites rf
             WHERE rf.tenant_id = rd.tenant_id
               AND rf.user_id = $2
               AND rf.report_definition_id = rd.id
           ) AS is_favorite,
           (
             SELECT rf.pinned FROM report_favorites rf
             WHERE rf.tenant_id = rd.tenant_id
               AND rf.user_id = $2
               AND rf.report_definition_id = rd.id
             LIMIT 1
           ) AS pinned,
           (
             SELECT rf.last_opened_at FROM report_favorites rf
             WHERE rf.tenant_id = rd.tenant_id
               AND rf.user_id = $2
               AND rf.report_definition_id = rd.id
             LIMIT 1
           ) AS last_opened_at
    FROM report_definitions rd
    WHERE rd.tenant_id = $1
      AND rd.is_archived IS FALSE
      AND ($3::text IS NULL OR rd.module = $3)
      AND ${accessibleWhere('rd')}
    ORDER BY rd.updated_at DESC
    `,
    [params.tenantId, params.userId, mod ?? null]
  );
  return res.rows.map((r) => ({
    ...r,
    is_favorite: Boolean(r.is_favorite),
    pinned: Boolean(r.pinned),
  }));
}

export async function getDefinitionById(
  tenantId: string,
  userId: string,
  id: string
): Promise<ReportDefinitionRow | null> {
  const pool = getPool();
  const res = await pool.query<ReportDefinitionRow>(
    `
    SELECT rd.*
    FROM report_definitions rd
    WHERE rd.tenant_id = $1 AND rd.id = $2 AND rd.is_archived IS FALSE
      AND ${accessibleWhere('rd')}
    `,
    [tenantId, userId, id]
  );
  return res.rows[0] ?? null;
}

export async function insertDefinition(row: {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  module: string;
  report_type: string;
  tags?: string[];
  visibility: ReportVisibility;
  configuration_json: unknown;
  created_by: string;
  updated_by: string;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `
    INSERT INTO report_definitions
      (id, tenant_id, name, description, category, module, report_type, tags, visibility,
       configuration_json, created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::text[],$9,$10::jsonb,$11,$12)
    `,
    [
      row.id,
      row.tenant_id,
      row.name,
      row.description ?? null,
      row.category ?? null,
      row.module,
      row.report_type,
      row.tags ?? [],
      row.visibility,
      JSON.stringify(row.configuration_json ?? {}),
      row.created_by,
      row.updated_by,
    ]
  );
}

export async function updateDefinition(params: {
  tenantId: string;
  id: string;
  userId: string;
  name?: string;
  description?: string | null;
  category?: string | null;
  report_type?: string;
  tags?: string[];
  visibility?: ReportVisibility;
  configuration_json?: unknown;
}): Promise<boolean> {
  const pool = getPool();
  const sets: string[] = ['updated_by = $4', 'updated_at = NOW()'];
  const vals: unknown[] = [params.tenantId, params.id, params.userId, params.userId];
  let idx = 5;
  if (params.name !== undefined) {
    sets.push(`name = $${idx++}`);
    vals.push(params.name);
  }
  if (params.description !== undefined) {
    sets.push(`description = $${idx++}`);
    vals.push(params.description);
  }
  if (params.category !== undefined) {
    sets.push(`category = $${idx++}`);
    vals.push(params.category);
  }
  if (params.report_type !== undefined) {
    sets.push(`report_type = $${idx++}`);
    vals.push(params.report_type);
  }
  if (params.tags !== undefined) {
    sets.push(`tags = $${idx++}::text[]`);
    vals.push(params.tags);
  }
  if (params.visibility !== undefined) {
    sets.push(`visibility = $${idx++}`);
    vals.push(params.visibility);
  }
  if (params.configuration_json !== undefined) {
    sets.push(`configuration_json = $${idx++}::jsonb`);
    vals.push(JSON.stringify(params.configuration_json));
  }
  const res = await pool.query(
    `
    UPDATE report_definitions rd
    SET ${sets.join(', ')}
    WHERE rd.tenant_id = $1 AND rd.id = $2
      AND (rd.created_by = $3 OR rd.visibility = 'company')
    `,
    vals
  );
  return (res.rowCount ?? 0) > 0;
}

export async function archiveDefinition(tenantId: string, userId: string, id: string): Promise<boolean> {
  const pool = getPool();
  const res = await pool.query(
    `
    UPDATE report_definitions
    SET is_archived = TRUE, updated_by = $3, updated_at = NOW()
    WHERE tenant_id = $1 AND id = $2 AND created_by = $3
    `,
    [tenantId, id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function toggleFavorite(params: {
  tenantId: string;
  userId: string;
  definitionId: string;
  pinned?: boolean;
}): Promise<{ favorited: boolean }> {
  const pool = getPool();
  const existing = await pool.query<{ id: string }>(
    `
    SELECT id FROM report_favorites
    WHERE tenant_id = $1 AND user_id = $2 AND report_definition_id = $3
    `,
    [params.tenantId, params.userId, params.definitionId]
  );
  if (existing.rows[0]) {
    await pool.query(`DELETE FROM report_favorites WHERE id = $1`, [existing.rows[0].id]);
    return { favorited: false };
  }
  await pool.query(
    `
    INSERT INTO report_favorites (id, tenant_id, user_id, report_definition_id, pinned, last_opened_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    `,
    [
      randomUUID(),
      params.tenantId,
      params.userId,
      params.definitionId,
      params.pinned ?? false,
    ]
  );
  return { favorited: true };
}

export async function recordDefinitionOpened(params: {
  tenantId: string;
  userId: string;
  definitionId: string;
}): Promise<void> {
  const pool = getPool();
  const existing = await pool.query<{ id: string }>(
    `
    SELECT id FROM report_favorites
    WHERE tenant_id = $1 AND user_id = $2 AND report_definition_id = $3
    `,
    [params.tenantId, params.userId, params.definitionId]
  );
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE report_favorites SET last_opened_at = NOW() WHERE id = $1`,
      [existing.rows[0].id]
    );
    return;
  }
  await pool.query(
    `
    INSERT INTO report_favorites (id, tenant_id, user_id, report_definition_id, pinned, last_opened_at)
    VALUES ($1, $2, $3, $4, FALSE, NOW())
    `,
    [crypto.randomUUID(), params.tenantId, params.userId, params.definitionId]
  );
}

export async function listRecentDefinitions(params: {
  tenantId: string;
  userId: string;
  module?: string;
  limit?: number;
}): Promise<ReportDefinitionRow[]> {
  const pool = getPool();
  const lim = Math.min(params.limit ?? 12, 30);
  const mod = params.module?.trim();
  const res = await pool.query<ReportDefinitionRow>(
    `
    SELECT rd.*, TRUE AS is_favorite, rf.pinned, rf.last_opened_at
    FROM report_favorites rf
    JOIN report_definitions rd
      ON rd.id = rf.report_definition_id AND rd.tenant_id = rf.tenant_id
    WHERE rf.tenant_id = $1 AND rf.user_id = $2
      AND rd.is_archived IS FALSE
      AND rf.last_opened_at IS NOT NULL
      AND ($3::text IS NULL OR rd.module = $3)
    ORDER BY rf.last_opened_at DESC
    LIMIT $4
    `,
    [params.tenantId, params.userId, mod ?? null, lim]
  );
  return res.rows;
}

export async function listFavoriteDefinitions(params: {
  tenantId: string;
  userId: string;
  module?: string;
}): Promise<ReportDefinitionRow[]> {
  const pool = getPool();
  const mod = params.module?.trim();
  const res = await pool.query<ReportDefinitionRow>(
    `
    SELECT rd.*, TRUE AS is_favorite, rf.pinned, rf.last_opened_at
    FROM report_favorites rf
    JOIN report_definitions rd
      ON rd.id = rf.report_definition_id AND rd.tenant_id = rf.tenant_id
    WHERE rf.tenant_id = $1 AND rf.user_id = $2
      AND rd.is_archived IS FALSE
      AND ($3::text IS NULL OR rd.module = $3)
    ORDER BY rf.pinned DESC, rf.last_opened_at DESC NULLS LAST, rd.name
    `,
    [params.tenantId, params.userId, mod ?? null]
  );
  return res.rows;
}
