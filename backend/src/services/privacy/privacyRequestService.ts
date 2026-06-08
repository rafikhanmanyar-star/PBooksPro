/**
 * Privacy request tracking — create, list, and update data-subject requests.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  isPrivacyRequestStatus,
  isPrivacyRequestType,
  type PrivacyRequestStatus,
  type PrivacyRequestType,
} from '../../constants/privacyRequestTypes.js';

export type PrivacyRequestRow = {
  id: string;
  tenant_id: string;
  request_type: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
  requested_by_user_id: string | null;
  metadata: Record<string, unknown>;
};

export type CreatePrivacyRequestInput = {
  tenantId: string;
  requestedByUserId: string;
  requestType: PrivacyRequestType;
  metadata?: Record<string, unknown>;
  status?: PrivacyRequestStatus;
};

function mapRow(row: pg.QueryResultRow): PrivacyRequestRow {
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    request_type: row.request_type,
    status: row.status,
    requested_at: row.requested_at instanceof Date ? row.requested_at.toISOString() : String(row.requested_at),
    completed_at:
      row.completed_at == null
        ? null
        : row.completed_at instanceof Date
          ? row.completed_at.toISOString()
          : String(row.completed_at),
    requested_by_user_id: row.requested_by_user_id ?? null,
    metadata,
  };
}

export async function createPrivacyRequest(
  client: pg.PoolClient,
  input: CreatePrivacyRequestInput
): Promise<PrivacyRequestRow> {
  if (!isPrivacyRequestType(input.requestType)) {
    throw new Error(`Invalid privacy request type: ${input.requestType}`);
  }
  const status = input.status ?? 'pending';
  if (!isPrivacyRequestStatus(status)) {
    throw new Error(`Invalid privacy request status: ${status}`);
  }

  const id = randomUUID();
  const metadata = input.metadata ?? {};
  const completedAt = status === 'completed' ? new Date() : null;

  await client.query(
    `INSERT INTO privacy_requests (
       id, tenant_id, request_type, status, requested_by_user_id, metadata, completed_at
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [id, input.tenantId, input.requestType, status, input.requestedByUserId, JSON.stringify(metadata), completedAt]
  );

  const { rows } = await client.query(`SELECT * FROM privacy_requests WHERE id = $1`, [id]);
  return mapRow(rows[0]!);
}

export async function getPrivacyRequest(
  client: pg.PoolClient,
  tenantId: string,
  requestId: string
): Promise<PrivacyRequestRow | null> {
  const { rows } = await client.query(
    `SELECT * FROM privacy_requests WHERE id = $1 AND tenant_id = $2`,
    [requestId, tenantId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listPrivacyRequests(
  client: pg.PoolClient,
  tenantId: string,
  options?: { userId?: string | null; limit?: number }
): Promise<PrivacyRequestRow[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const params: unknown[] = [tenantId];
  let sql = `SELECT * FROM privacy_requests WHERE tenant_id = $1`;

  if (options?.userId) {
    params.push(options.userId);
    sql += ` AND requested_by_user_id = $${params.length}`;
  }

  params.push(limit);
  sql += ` ORDER BY requested_at DESC LIMIT $${params.length}`;

  const { rows } = await client.query(sql, params);
  return rows.map(mapRow);
}

export async function updatePrivacyRequestStatus(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    requestId: string;
    status: PrivacyRequestStatus;
    metadataPatch?: Record<string, unknown>;
    completedAt?: Date | null;
  }
): Promise<PrivacyRequestRow | null> {
  if (!isPrivacyRequestStatus(input.status)) {
    throw new Error(`Invalid privacy request status: ${input.status}`);
  }

  const existing = await getPrivacyRequest(client, input.tenantId, input.requestId);
  if (!existing) return null;

  const mergedMetadata = {
    ...existing.metadata,
    ...(input.metadataPatch ?? {}),
  };
  const completedAt =
    input.completedAt !== undefined
      ? input.completedAt
      : input.status === 'completed' || input.status === 'rejected' || input.status === 'failed'
        ? new Date()
        : null;

  await client.query(
    `UPDATE privacy_requests
     SET status = $1,
         metadata = $2::jsonb,
         completed_at = $3
     WHERE id = $4 AND tenant_id = $5`,
    [input.status, JSON.stringify(mergedMetadata), completedAt, input.requestId, input.tenantId]
  );

  return getPrivacyRequest(client, input.tenantId, input.requestId);
}

export function canUserAccessRequest(
  request: PrivacyRequestRow,
  userId: string,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  return request.requested_by_user_id === userId;
}
