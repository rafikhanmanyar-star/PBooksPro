import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { RecordLockRow, RecordLockType } from '../services/recordLocksService.js';

export class RecordLockRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async pruneExpired(client: pg.PoolClient): Promise<void> {
    await client.query(`DELETE FROM record_locks WHERE tenant_id = $1 AND expires_at < NOW()`, [this.tenantId]);
  }

  async getActive(
    client: pg.PoolClient,
    recordType: RecordLockType,
    recordId: string
  ): Promise<RecordLockRow | null> {
    const r = await client.query<RecordLockRow>(
      `SELECT id, tenant_id, record_type, record_id, locked_by, locked_by_name, locked_at, expires_at
       FROM record_locks
       WHERE tenant_id = $1 AND record_type = $2 AND record_id = $3 AND expires_at >= NOW()`,
      [this.tenantId, recordType, recordId]
    );
    return r.rows[0] ?? null;
  }

  async getByRecord(
    client: pg.PoolClient,
    recordType: RecordLockType,
    recordId: string
  ): Promise<RecordLockRow | null> {
    const r = await client.query<RecordLockRow>(
      `SELECT id, tenant_id, record_type, record_id, locked_by, locked_by_name, locked_at, expires_at
       FROM record_locks WHERE tenant_id = $1 AND record_type = $2 AND record_id = $3`,
      [this.tenantId, recordType, recordId]
    );
    return r.rows[0] ?? null;
  }

  async refreshHolder(
    client: pg.PoolClient,
    recordType: RecordLockType,
    recordId: string,
    userName: string,
    expiresAt: Date
  ): Promise<void> {
    await client.query(
      `UPDATE record_locks SET locked_by_name = $4, expires_at = $5, locked_at = NOW()
       WHERE tenant_id = $1 AND record_type = $2 AND record_id = $3`,
      [this.tenantId, recordType, recordId, userName, expiresAt]
    );
  }

  async insertLock(
    client: pg.PoolClient,
    id: string,
    recordType: RecordLockType,
    recordId: string,
    userId: string,
    userName: string,
    expiresAt: Date
  ): Promise<void> {
    await client.query(
      `INSERT INTO record_locks (id, tenant_id, record_type, record_id, locked_by, locked_by_name, locked_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
      [id, this.tenantId, recordType, recordId, userId, userName, expiresAt]
    );
  }

  async refreshOwned(
    client: pg.PoolClient,
    recordType: RecordLockType,
    recordId: string,
    userId: string,
    userName: string,
    expiresAt: Date
  ): Promise<boolean> {
    const r = await client.query(
      `UPDATE record_locks
       SET expires_at = $5, locked_by_name = $6, locked_at = NOW()
       WHERE tenant_id = $1 AND record_type = $2 AND record_id = $3 AND locked_by = $4`,
      [this.tenantId, recordType, recordId, userId, expiresAt, userName]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async releaseOwned(
    client: pg.PoolClient,
    recordType: RecordLockType,
    recordId: string,
    userId: string
  ): Promise<boolean> {
    const r = await client.query(
      `DELETE FROM record_locks
       WHERE tenant_id = $1 AND record_type = $2 AND record_id = $3 AND locked_by = $4`,
      [this.tenantId, recordType, recordId, userId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async forceTakeover(
    client: pg.PoolClient,
    recordType: RecordLockType,
    recordId: string,
    userId: string,
    userName: string,
    expiresAt: Date
  ): Promise<void> {
    await client.query(
      `UPDATE record_locks SET locked_by = $4, locked_by_name = $5, locked_at = NOW(), expires_at = $6
       WHERE tenant_id = $1 AND record_type = $2 AND record_id = $3`,
      [this.tenantId, recordType, recordId, userId, userName, expiresAt]
    );
  }

  async insertForceTakeoverAudit(
    client: pg.PoolClient,
    id: string,
    actorUserId: string,
    recordType: RecordLockType,
    recordId: string,
    previousValue: string,
    message: string
  ): Promise<void> {
    await client.query(
      `INSERT INTO accounting_audit_log (id, tenant_id, entity_type, entity_id, action, user_id, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        this.tenantId,
        'record_lock',
        `${recordType}:${recordId}`,
        'force_takeover',
        actorUserId,
        previousValue,
        message,
      ]
    );
  }
}
