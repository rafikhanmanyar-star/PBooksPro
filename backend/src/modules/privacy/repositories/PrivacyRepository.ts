import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type {
  PrivacyRequestRow,
  CreatePrivacyRequestInput,
} from '../../../services/privacy/privacyRequestService.js';
import type { PrivacyRequestStatus } from '../../../constants/privacyRequestTypes.js';
import { PRIVACY_EXPORT_FORMAT } from '../../../constants/privacyRequestTypes.js';

const USER_EXPORT_COLUMNS = [
  'id',
  'tenant_id',
  'username',
  'name',
  'role',
  'email',
  'is_active',
  'created_at',
  'updated_at',
] as const;

function mapPrivacyRequest(row: pg.QueryResultRow): PrivacyRequestRow {
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    request_type: row.request_type,
    status: row.status,
    requested_at:
      row.requested_at instanceof Date ? row.requested_at.toISOString() : String(row.requested_at),
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

function sanitizeUserRow(row: pg.QueryResultRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of USER_EXPORT_COLUMNS) {
    if (row[col] !== undefined) out[col] = row[col];
  }
  return out;
}

export class PrivacyRequestRepository {
  async insert(
    client: pg.PoolClient,
    input: CreatePrivacyRequestInput & { id: string; status: string; completedAt: Date | null }
  ): Promise<PrivacyRequestRow> {
    await client.query(
      `INSERT INTO privacy_requests (
         id, tenant_id, request_type, status, requested_by_user_id, metadata, completed_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        input.id,
        input.tenantId,
        input.requestType,
        input.status,
        input.requestedByUserId,
        JSON.stringify(input.metadata ?? {}),
        input.completedAt,
      ]
    );
    const r = await client.query(`SELECT * FROM privacy_requests WHERE id = $1`, [input.id]);
    return mapPrivacyRequest(r.rows[0]!);
  }

  async getById(
    client: pg.PoolClient,
    tenantId: string,
    requestId: string
  ): Promise<PrivacyRequestRow | null> {
    const r = await client.query(
      `SELECT * FROM privacy_requests WHERE id = $1 AND tenant_id = $2`,
      [requestId, tenantId]
    );
    return r.rows[0] ? mapPrivacyRequest(r.rows[0]) : null;
  }

  async list(
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

    const r = await client.query(sql, params);
    return r.rows.map(mapPrivacyRequest);
  }

  async updateStatus(
    client: pg.PoolClient,
    input: {
      tenantId: string;
      requestId: string;
      status: PrivacyRequestStatus;
      metadataJson: string;
      completedAt: Date | null;
    }
  ): Promise<void> {
    await client.query(
      `UPDATE privacy_requests
       SET status = $1,
           metadata = $2::jsonb,
           completed_at = $3
       WHERE id = $4 AND tenant_id = $5`,
      [input.status, input.metadataJson, input.completedAt, input.requestId, input.tenantId]
    );
  }
}

export class PrivacyAnonymizationRepository {
  async getUserUsername(
    client: pg.PoolClient,
    tenantId: string,
    userId: string
  ): Promise<{ id: string; username: string } | null> {
    const r = await client.query(
      `SELECT id, username FROM users WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    return r.rows[0] ?? null;
  }

  async anonymizeUser(
    client: pg.PoolClient,
    input: {
      tenantId: string;
      userId: string;
      username: string;
      name: string;
      passwordHash: string;
    }
  ): Promise<void> {
    await client.query(
      `UPDATE users
       SET username = $1,
           name = $2,
           email = NULL,
           password_hash = $3,
           is_active = FALSE,
           updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5`,
      [input.username, input.name, input.passwordHash, input.userId, input.tenantId]
    );
  }

  async clearAuditEmail(
    client: pg.PoolClient,
    tenantId: string,
    userId: string
  ): Promise<void> {
    await client.query(
      `UPDATE audit_events SET email = NULL WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId]
    );
  }

  async clearLoginEventEmail(
    client: pg.PoolClient,
    tenantId: string,
    userId: string
  ): Promise<void> {
    await client.query(
      `UPDATE login_events SET email = NULL WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId]
    );
  }

  async tableExists(client: pg.PoolClient, table: string): Promise<boolean> {
    const r = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
      [table]
    );
    return r.rows.length > 0;
  }
}

export class PrivacyDataExportRepository {
  async tableExists(client: pg.PoolClient, table: string): Promise<boolean> {
    const r = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
      [table]
    );
    return r.rows.length > 0;
  }

  async getUserProfile(
    client: pg.PoolClient,
    tenantId: string,
    userId: string
  ): Promise<pg.QueryResultRow | null> {
    const r = await client.query(
      `SELECT ${USER_EXPORT_COLUMNS.join(', ')} FROM users WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listUserAuditEvents(
    client: pg.PoolClient,
    tenantId: string,
    userId: string
  ): Promise<unknown[]> {
    const r = await client.query(
      `SELECT id, module, action, entity_type, entity_id, summary, ip_address, occurred_at
       FROM audit_events WHERE tenant_id = $1 AND user_id = $2
       ORDER BY occurred_at DESC LIMIT 500`,
      [tenantId, userId]
    );
    return r.rows;
  }

  async listUserLoginEvents(
    client: pg.PoolClient,
    tenantId: string,
    userId: string
  ): Promise<unknown[]> {
    const r = await client.query(
      `SELECT id, email, login_time, logout_time, ip_address, user_agent, status
       FROM login_events WHERE tenant_id = $1 AND user_id = $2
       ORDER BY login_time DESC LIMIT 200`,
      [tenantId, userId]
    );
    return r.rows;
  }

  async listUserLegalAcceptances(
    client: pg.PoolClient,
    tenantId: string,
    userId: string
  ): Promise<unknown[]> {
    const r = await client.query(
      `SELECT document_type, document_version, accepted_at, ip_address, context
       FROM legal_acceptance WHERE tenant_id = $1 AND user_id = $2
       ORDER BY accepted_at DESC`,
      [tenantId, userId]
    );
    return r.rows;
  }

  async listUserPrivacyRequests(
    client: pg.PoolClient,
    tenantId: string,
    userId: string
  ): Promise<unknown[]> {
    const r = await client.query(
      `SELECT id, request_type, status, requested_at, completed_at, metadata
       FROM privacy_requests WHERE tenant_id = $1 AND requested_by_user_id = $2
       ORDER BY requested_at DESC LIMIT 100`,
      [tenantId, userId]
    );
    return r.rows;
  }

  async getTenantRow(client: pg.PoolClient, tenantId: string): Promise<pg.QueryResultRow | null> {
    const r = await client.query(
      `SELECT id, name, created_at, updated_at FROM tenants WHERE id = $1`,
      [tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listTenantUsers(client: pg.PoolClient, tenantId: string): Promise<unknown[]> {
    const r = await client.query(
      `SELECT ${USER_EXPORT_COLUMNS.join(', ')} FROM users WHERE tenant_id = $1 ORDER BY created_at`,
      [tenantId]
    );
    return r.rows.map(sanitizeUserRow);
  }

  async listTenantPrivacyRequests(client: pg.PoolClient, tenantId: string): Promise<unknown[]> {
    const r = await client.query(
      `SELECT id, request_type, status, requested_at, completed_at, requested_by_user_id, metadata
       FROM privacy_requests WHERE tenant_id = $1 ORDER BY requested_at DESC LIMIT 200`,
      [tenantId]
    );
    return r.rows;
  }
}

export { randomUUID as newPrivacyRequestId, sanitizeUserRow, PRIVACY_EXPORT_FORMAT };
