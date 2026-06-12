import {
  backfillUserEmailsSqlite,
  type EmailBackfillReport,
  type SqliteUserRow,
} from '../../shared/auth/emailIdentity';

export type SqliteExec = {
  query<T>(sql: string, params?: unknown[]): T[];
  execute(sql: string, params?: unknown[]): void;
};

export function runEmailAuthMigrationSqlite(db: SqliteExec, edition: 'desktop' = 'desktop'): EmailBackfillReport {
  const userCols = db.query<{ name: string }>('PRAGMA table_info(users)');
  const colNames = new Set(userCols.map((c) => c.name));
  if (!colNames.has('email')) db.execute('ALTER TABLE users ADD COLUMN email TEXT');
  if (!colNames.has('email_verified')) {
    db.execute('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
  }
  if (!colNames.has('email_requires_update')) {
    db.execute('ALTER TABLE users ADD COLUMN email_requires_update INTEGER NOT NULL DEFAULT 0');
  }

  try {
    db.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_global_lower
       ON users (LOWER(TRIM(email)))
       WHERE email IS NOT NULL AND TRIM(email) <> ''`
    );
  } catch {
    /* index may exist */
  }

  const rows = db.query<SqliteUserRow>('SELECT id, username, email FROM users ORDER BY id');
  const existingEmails = new Set<string>();
  for (const row of rows) {
    const e = row.email?.trim().toLowerCase();
    if (e) existingEmails.add(e);
  }

  const { updates, report } = backfillUserEmailsSqlite(rows, existingEmails, edition);
  for (const u of updates) {
    db.execute(
      `UPDATE users SET email = ?, email_requires_update = 1, updated_at = datetime('now') WHERE id = ?`,
      [u.email, u.id]
    );
  }

  try {
    db.execute(
      `CREATE TABLE IF NOT EXISTS auth_migration_reports (
        id TEXT PRIMARY KEY,
        edition TEXT NOT NULL,
        run_at TEXT NOT NULL DEFAULT (datetime('now')),
        users_total INTEGER NOT NULL DEFAULT 0,
        users_backfilled INTEGER NOT NULL DEFAULT 0,
        users_already_had_email INTEGER NOT NULL DEFAULT 0,
        duplicates_resolved INTEGER NOT NULL DEFAULT 0,
        report_json TEXT
      )`
    );
    const reportId = `auth_mig_${edition}_${Date.now()}`;
    db.execute(
      `INSERT INTO auth_migration_reports
       (id, edition, users_total, users_backfilled, users_already_had_email, duplicates_resolved, report_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        reportId,
        edition,
        report.usersTotal,
        report.usersBackfilled,
        report.usersAlreadyHadEmail,
        report.duplicatesResolved,
        JSON.stringify(report),
      ]
    );
  } catch {
    /* best-effort audit */
  }

  return report;
}
