import type pg from 'pg';
import { randomUUID } from 'crypto';
import type { OffsiteUploadRow, OffsiteUploadStatus } from '../services/backup/backupOffsiteService.js';

const SETTINGS_ID = 'default';

function mapUpload(row: pg.QueryResultRow): OffsiteUploadRow {
  return row as OffsiteUploadRow;
}

export class BackupOffsiteRepository {
  async getById(client: pg.PoolClient, uploadId: string): Promise<OffsiteUploadRow | null> {
    const r = await client.query(`SELECT * FROM backup_offsite_uploads WHERE id = $1`, [uploadId]);
    return r.rows[0] ? mapUpload(r.rows[0]) : null;
  }

  async getByRunId(client: pg.PoolClient, runId: string): Promise<OffsiteUploadRow | null> {
    const r = await client.query(
      `SELECT * FROM backup_offsite_uploads WHERE run_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [runId]
    );
    return r.rows[0] ? mapUpload(r.rows[0]) : null;
  }

  async list(
    client: pg.PoolClient,
    opts: { runId?: string; limit: number }
  ): Promise<OffsiteUploadRow[]> {
    const params: unknown[] = [];
    let where = '';
    if (opts.runId) {
      params.push(opts.runId);
      where = `WHERE run_id = $${params.length}`;
    }
    params.push(opts.limit);
    const r = await client.query(
      `SELECT * FROM backup_offsite_uploads ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
    return r.rows.map(mapUpload);
  }

  async insertPending(
    client: pg.PoolClient,
    input: {
      id: string;
      runId: string;
      objectKey: string;
      provider: string;
      attemptNumber: number;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO backup_offsite_uploads (
         id, run_id, object_key, provider, status, encrypted, attempt_number
       ) VALUES ($1, $2, $3, $4, 'pending', true, $5)`,
      [input.id, input.runId, input.objectKey, input.provider, input.attemptNumber]
    );
  }

  async updateStatus(
    client: pg.PoolClient,
    uploadId: string,
    patch: Partial<{
      status: OffsiteUploadStatus;
      local_sha256: string;
      remote_sha256: string;
      remote_etag: string;
      size_bytes: number;
      started_at: string;
      completed_at: string;
      failure_reason: string | null;
      attempt_number: number;
    }>
  ): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [uploadId];
    let i = 2;
    for (const [key, val] of Object.entries(patch)) {
      if (val === undefined) continue;
      fields.push(`${key} = $${i++}`);
      values.push(val);
    }
    fields.push('updated_at = NOW()');
    await client.query(
      `UPDATE backup_offsite_uploads SET ${fields.join(', ')} WHERE id = $1`,
      values
    );
  }

  async sumCompletedBytes(client: pg.PoolClient): Promise<number> {
    const r = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(size_bytes), 0)::bigint AS total FROM backup_offsite_uploads WHERE status = 'completed'`
    );
    return Number(r.rows[0]?.total ?? 0);
  }

  async hasCompletedForSuccessfulRun(client: pg.PoolClient): Promise<boolean> {
    const r = await client.query(
      `SELECT 1 FROM backup_offsite_uploads u
       INNER JOIN backup_job_runs r ON r.id = u.run_id
       WHERE r.success = true AND u.status = 'completed'
       ORDER BY u.completed_at DESC NULLS LAST
       LIMIT 1`
    );
    return r.rows.length > 0;
  }
}

export type BackupStorageSettingsRow = {
  id: string;
  provider: string;
  access_key_encrypted: string;
  secret_key_encrypted: string;
  bucket_name: string;
  region: string | null;
  endpoint_url: string | null;
  enabled: boolean;
  auto_upload: boolean;
  created_at: string;
  updated_at: string;
};

export class BackupStorageSettingsRepository {
  async getRow(client: pg.PoolClient): Promise<BackupStorageSettingsRow | null> {
    const r = await client.query(`SELECT * FROM backup_storage_settings WHERE id = $1`, [
      SETTINGS_ID,
    ]);
    return r.rows[0] ? (r.rows[0] as BackupStorageSettingsRow) : null;
  }

  async update(
    client: pg.PoolClient,
    input: {
      provider: string;
      accessEnc: string;
      secretEnc: string;
      bucketName: string;
      region: string | null;
      endpointUrl: string | null;
      enabled: boolean;
      autoUpload: boolean;
    }
  ): Promise<void> {
    await client.query(
      `UPDATE backup_storage_settings SET
         provider = $2,
         access_key_encrypted = $3,
         secret_key_encrypted = $4,
         bucket_name = $5,
         region = $6,
         endpoint_url = $7,
         enabled = $8,
         auto_upload = $9,
         updated_at = NOW()
       WHERE id = $1`,
      [
        SETTINGS_ID,
        input.provider,
        input.accessEnc,
        input.secretEnc,
        input.bucketName,
        input.region,
        input.endpointUrl,
        input.enabled,
        input.autoUpload,
      ]
    );
  }

  async insert(
    client: pg.PoolClient,
    input: {
      provider: string;
      accessEnc: string;
      secretEnc: string;
      bucketName: string;
      region: string | null;
      endpointUrl: string | null;
      enabled: boolean;
      autoUpload: boolean;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO backup_storage_settings (
         id, provider, access_key_encrypted, secret_key_encrypted,
         bucket_name, region, endpoint_url, enabled, auto_upload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        SETTINGS_ID,
        input.provider,
        input.accessEnc,
        input.secretEnc,
        input.bucketName,
        input.region,
        input.endpointUrl,
        input.enabled,
        input.autoUpload,
      ]
    );
  }
}

export type BackupSecuritySettingsRow = {
  id: string;
  encrypt_at_rest: boolean;
  encrypt_before_upload: boolean;
  require_restore_authorization: boolean;
  min_backup_password_length: number;
  key_version: number;
  key_rotated_at: string | null;
  updated_at: string;
};

export class BackupSecuritySettingsRepository {
  async getRow(client: pg.PoolClient): Promise<BackupSecuritySettingsRow | null> {
    const r = await client.query(`SELECT * FROM backup_security_settings WHERE id = 'default'`);
    return r.rows[0] ? (r.rows[0] as BackupSecuritySettingsRow) : null;
  }

  async update(
    client: pg.PoolClient,
    patch: {
      encrypt_at_rest: boolean;
      encrypt_before_upload: boolean;
      require_restore_authorization: boolean;
      min_backup_password_length: number;
    }
  ): Promise<void> {
    await client.query(
      `UPDATE backup_security_settings SET
         encrypt_at_rest = $1,
         encrypt_before_upload = $2,
         require_restore_authorization = $3,
         min_backup_password_length = $4,
         updated_at = NOW()
       WHERE id = 'default'`,
      [
        patch.encrypt_at_rest,
        patch.encrypt_before_upload,
        patch.require_restore_authorization,
        patch.min_backup_password_length,
      ]
    );
  }

  async rotateKeyVersion(client: pg.PoolClient): Promise<void> {
    await client.query(
      `UPDATE backup_security_settings SET
         key_version = key_version + 1,
         key_rotated_at = NOW(),
         updated_at = NOW()
       WHERE id = 'default'`
    );
  }
}

export { SETTINGS_ID as BACKUP_STORAGE_SETTINGS_ID };
