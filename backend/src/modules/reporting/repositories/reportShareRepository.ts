import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

export type ReportShareRow = {
  id: string;
  tenant_id: string;
  report_definition_id: string;
  shared_with_user_id: string | null;
  shared_with_role: string | null;
  permission: 'view' | 'edit' | 'clone' | 'delete';
  created_by: string | null;
  created_at: Date | string;
  user_name?: string | null;
  user_username?: string | null;
};

export async function listSharesForDefinition(
  client: PoolClient,
  tenantId: string,
  definitionId: string
): Promise<ReportShareRow[]> {
  const res = await client.query<ReportShareRow>(
    `SELECT rs.*, u.name AS user_name, u.username AS user_username
     FROM report_shares rs
     LEFT JOIN users u ON u.id = rs.shared_with_user_id AND u.tenant_id = rs.tenant_id
     WHERE rs.tenant_id = $1 AND rs.report_definition_id = $2
     ORDER BY rs.created_at DESC`,
    [tenantId, definitionId]
  );
  return res.rows;
}

export async function insertShare(
  client: PoolClient,
  row: {
    tenant_id: string;
    report_definition_id: string;
    shared_with_user_id?: string | null;
    shared_with_role?: string | null;
    permission: ReportShareRow['permission'];
    created_by: string | null;
  }
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO report_shares (
      id, tenant_id, report_definition_id, shared_with_user_id, shared_with_role, permission, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      id,
      row.tenant_id,
      row.report_definition_id,
      row.shared_with_user_id ?? null,
      row.shared_with_role ?? null,
      row.permission,
      row.created_by,
    ]
  );
  return id;
}

export async function deleteShare(
  client: PoolClient,
  tenantId: string,
  shareId: string
): Promise<boolean> {
  const res = await client.query(
    `DELETE FROM report_shares WHERE tenant_id = $1 AND id = $2`,
    [tenantId, shareId]
  );
  return (res.rowCount ?? 0) > 0;
}
