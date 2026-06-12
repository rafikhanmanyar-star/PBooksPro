/**
 * Desktop SQLite email backfill — mirrors shared/auth/emailIdentity.ts for Electron CJS.
 */

const MIGRATION_EMAIL_DOMAIN = 'company.local';

function normalizeEmail(email) {
  if (email == null) return null;
  const trimmed = String(email).trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function buildPlaceholderEmail(username, userId, attempt = 0) {
  const safeUser = (username || 'user')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '') || 'user';
  const idFrag = String(userId).replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  const suffix = attempt > 0 ? `.${idFrag}${attempt > 1 ? attempt : ''}` : '';
  return `${safeUser}${suffix}@${MIGRATION_EMAIL_DOMAIN}`;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {{ report: object; updated: number }}
 */
function runEmailAuthMigration(db) {
  const userCols = db.prepare('PRAGMA table_info(users)').all();
  const colNames = new Set(userCols.map((c) => c.name));
  if (!colNames.has('email')) {
    db.prepare('ALTER TABLE users ADD COLUMN email TEXT').run();
  }
  if (!colNames.has('email_verified')) {
    db.prepare('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0').run();
  }
  if (!colNames.has('email_requires_update')) {
    db.prepare('ALTER TABLE users ADD COLUMN email_requires_update INTEGER NOT NULL DEFAULT 0').run();
  }

  try {
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_global_lower
       ON users (LOWER(TRIM(email)))
       WHERE email IS NOT NULL AND TRIM(email) <> ''`
    ).run();
  } catch (_) { /* index may exist */ }

  const rows = db.prepare('SELECT id, username, email FROM users ORDER BY id').all();
  const existingEmails = new Set();
  for (const row of rows) {
    const e = normalizeEmail(row.email);
    if (e) existingEmails.add(e);
  }

  const updates = [];
  let duplicatesResolved = 0;
  let usersAlreadyHadEmail = 0;
  const samples = [];

  for (const row of rows) {
    if (normalizeEmail(row.email)) {
      usersAlreadyHadEmail += 1;
      continue;
    }
    let attempt = 0;
    let candidate = buildPlaceholderEmail(row.username, row.id, attempt);
    while (existingEmails.has(candidate)) {
      attempt += 1;
      duplicatesResolved += 1;
      candidate = buildPlaceholderEmail(row.username, row.id, attempt);
    }
    existingEmails.add(candidate);
    updates.push({ id: row.id, email: candidate });
    if (samples.length < 10) {
      samples.push({ userId: row.id, username: row.username, email: candidate });
    }
  }

  const updateStmt = db.prepare(
    `UPDATE users SET email = ?, email_requires_update = 1, updated_at = datetime('now') WHERE id = ?`
  );
  const tx = db.transaction(() => {
    for (const u of updates) {
      updateStmt.run(u.email, u.id);
    }
  });
  tx();

  const report = {
    edition: 'desktop',
    usersTotal: rows.length,
    usersAlreadyHadEmail,
    usersBackfilled: updates.length,
    duplicatesResolved,
    samples,
    message: updates.length
      ? 'Placeholder emails assigned (@company.local). Update in Administration → Users.'
      : 'All users already had email addresses.',
  };

  try {
    db.prepare(
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
    ).run();
    const reportId = `auth_mig_desktop_${Date.now()}`;
    db.prepare(
      `INSERT INTO auth_migration_reports
       (id, edition, users_total, users_backfilled, users_already_had_email, duplicates_resolved, report_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      reportId,
      'desktop',
      report.usersTotal,
      report.usersBackfilled,
      report.usersAlreadyHadEmail,
      report.duplicatesResolved,
      JSON.stringify(report)
    );
  } catch (e) {
    console.warn('[EmailAuthMigration] Could not write auth_migration_reports:', e.message);
  }

  if (updates.length > 0) {
    console.log(
      `[EmailAuthMigration] Backfilled ${updates.length} user email(s). Example: ${samples[0]?.email ?? 'n/a'}`
    );
  }

  return { report, updated: updates.length };
}

module.exports = { runEmailAuthMigration, normalizeEmail, MIGRATION_EMAIL_DOMAIN };
