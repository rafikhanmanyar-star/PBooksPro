import type pg from 'pg';
import type {
  BackupJobRow,
  BackupJobRunRow,
  BackupJobStatus,
  BackupFrequency,
} from '../services/backupSchedulerService.js';

function mapJob(row: pg.QueryResultRow): BackupJobRow {
  return row as BackupJobRow;
}

function mapRun(row: pg.QueryResultRow): BackupJobRunRow {
  return row as BackupJobRunRow;
}

export class BackupJobRepository {
  async jobExists(client: pg.PoolClient, jobId: string): Promise<boolean> {
    const r = await client.query(`SELECT id FROM backup_jobs WHERE id = $1`, [jobId]);
    return r.rows.length > 0;
  }

  async insertDefaultJob(
    client: pg.PoolClient,
    input: {
      id: string;
      jobName: string;
      frequency: BackupFrequency;
      nextRun: string;
      retentionDays: number;
      storageLocation: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO backup_jobs (
         id, job_name, backup_type, frequency, next_run, status, retention_days, storage_location
       ) VALUES ($1, $2, 'full_pg', $3, $4, 'idle', $5, $6)`,
      [
        input.id,
        input.jobName,
        input.frequency,
        input.nextRun,
        input.retentionDays,
        input.storageLocation,
      ]
    );
  }

  async listJobs(client: pg.PoolClient): Promise<BackupJobRow[]> {
    const r = await client.query(
      `SELECT * FROM backup_jobs ORDER BY
         CASE frequency WHEN 'daily' THEN 1 WHEN 'weekly' THEN 2 ELSE 3 END,
         job_name`
    );
    return r.rows.map(mapJob);
  }

  async getJob(client: pg.PoolClient, jobId: string): Promise<BackupJobRow | null> {
    const r = await client.query(`SELECT * FROM backup_jobs WHERE id = $1`, [jobId]);
    return r.rows[0] ? mapJob(r.rows[0]) : null;
  }

  async listDueJobs(client: pg.PoolClient): Promise<BackupJobRow[]> {
    const r = await client.query(
      `SELECT * FROM backup_jobs
       WHERE status NOT IN ('running', 'disabled')
         AND next_run <= NOW()
       ORDER BY next_run ASC`
    );
    return r.rows.map(mapJob);
  }

  async insertRunStart(
    client: pg.PoolClient,
    runId: string,
    jobId: string,
    startedAt: string,
    attemptNumber: number
  ): Promise<void> {
    await client.query(
      `INSERT INTO backup_job_runs (id, job_id, started_at, attempt_number, success)
       VALUES ($1, $2, $3, $4, false)`,
      [runId, jobId, startedAt, attemptNumber]
    );
  }

  async setJobStatus(client: pg.PoolClient, jobId: string, status: BackupJobStatus): Promise<void> {
    await client.query(
      `UPDATE backup_jobs SET status = $2, updated_at = NOW() WHERE id = $1`,
      [jobId, status]
    );
  }

  async completeRun(
    client: pg.PoolClient,
    runId: string,
    patch: {
      completedAt: string;
      sizeBytes: number | null;
      durationMs: number;
      success: boolean;
      failureReason: string | null;
      storagePath: string | null;
      encrypted: boolean;
      encryptionMode: string | null;
      contentSha256: string | null;
    }
  ): Promise<void> {
    await client.query(
      `UPDATE backup_job_runs SET
         completed_at = $2,
         size_bytes = $3,
         duration_ms = $4,
         success = $5,
         failure_reason = $6,
         storage_path = $7,
         encrypted = $8,
         encryption_mode = $9,
         content_sha256 = $10
       WHERE id = $1`,
      [
        runId,
        patch.completedAt,
        patch.sizeBytes,
        patch.durationMs,
        patch.success,
        patch.failureReason,
        patch.storagePath,
        patch.encrypted,
        patch.encryptionMode,
        patch.contentSha256,
      ]
    );
  }

  async updateJobAfterRun(
    client: pg.PoolClient,
    jobId: string,
    lastRun: string,
    nextRun: string,
    status: BackupJobStatus
  ): Promise<void> {
    await client.query(
      `UPDATE backup_jobs SET
         last_run = $2,
         next_run = $3,
         status = $4,
         updated_at = NOW()
       WHERE id = $1`,
      [jobId, lastRun, nextRun, status]
    );
  }

  async countRuns(client: pg.PoolClient, jobId?: string): Promise<number> {
    const params: unknown[] = [];
    let where = '';
    if (jobId) {
      params.push(jobId);
      where = `WHERE r.job_id = $${params.length}`;
    }
    const r = await client.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM backup_job_runs r ${where}`,
      params
    );
    return Number(r.rows[0]?.c ?? 0);
  }

  async listRuns(
    client: pg.PoolClient,
    opts: { jobId?: string; limit: number; offset: number }
  ): Promise<BackupJobRunRow[]> {
    const params: unknown[] = [];
    let where = '';
    if (opts.jobId) {
      params.push(opts.jobId);
      where = `WHERE r.job_id = $${params.length}`;
    }
    params.push(opts.limit, opts.offset);
    const r = await client.query(
      `SELECT r.*, j.job_name, j.backup_type, j.frequency
       FROM backup_job_runs r
       JOIN backup_jobs j ON j.id = r.job_id
       ${where}
       ORDER BY r.started_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return r.rows.map(mapRun);
  }

  async getRun(client: pg.PoolClient, runId: string): Promise<BackupJobRunRow | null> {
    const r = await client.query(
      `SELECT r.*, j.job_name, j.backup_type, j.frequency
       FROM backup_job_runs r
       JOIN backup_jobs j ON j.id = r.job_id
       WHERE r.id = $1`,
      [runId]
    );
    return r.rows[0] ? mapRun(r.rows[0]) : null;
  }

  async deleteRun(client: pg.PoolClient, runId: string): Promise<void> {
    await client.query(`DELETE FROM backup_job_runs WHERE id = $1`, [runId]);
  }

  async getLastRun(client: pg.PoolClient): Promise<pg.QueryResultRow | null> {
    const r = await client.query(
      `SELECT r.id, r.completed_at, r.started_at, r.success, r.size_bytes, j.job_name
       FROM backup_job_runs r
       LEFT JOIN backup_jobs j ON j.id = r.job_id
       ORDER BY COALESCE(r.completed_at, r.started_at) DESC
       LIMIT 1`
    );
    return r.rows[0] ?? null;
  }

  async getLastSuccessfulRun(client: pg.PoolClient): Promise<pg.QueryResultRow | null> {
    const r = await client.query(
      `SELECT r.id, r.completed_at, r.size_bytes, j.job_name
       FROM backup_job_runs r
       LEFT JOIN backup_jobs j ON j.id = r.job_id
       WHERE r.success = true
       ORDER BY r.completed_at DESC NULLS LAST
       LIMIT 1`
    );
    return r.rows[0] ?? null;
  }

  async getLatestSuccessfulRunWithPath(
    client: pg.PoolClient
  ): Promise<{ id: string; storage_path: string; size_bytes: string | null } | null> {
    const r = await client.query<{ id: string; storage_path: string; size_bytes: string | null }>(
      `SELECT id, storage_path, size_bytes FROM backup_job_runs
       WHERE success = true AND storage_path IS NOT NULL
       ORDER BY completed_at DESC NULLS LAST
       LIMIT 1`
    );
    return r.rows[0] ?? null;
  }

  async getLatestRunWithPath(
    client: pg.PoolClient
  ): Promise<{ id: string; storage_path: string; success: boolean } | null> {
    const r = await client.query<{ id: string; storage_path: string; success: boolean }>(
      `SELECT id, storage_path, success FROM backup_job_runs
       WHERE storage_path IS NOT NULL
       ORDER BY completed_at DESC NULLS LAST
       LIMIT 1`
    );
    return r.rows[0] ?? null;
  }

  async getLastSuccessfulCompletedAt(client: pg.PoolClient): Promise<string | null> {
    const r = await client.query<{ completed_at: string }>(
      `SELECT completed_at FROM backup_job_runs WHERE success = true ORDER BY completed_at DESC LIMIT 1`
    );
    return r.rows[0]?.completed_at ?? null;
  }
}
