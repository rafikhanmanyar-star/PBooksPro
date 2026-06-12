/**
 * Global email identity helpers — shared by cloud API and desktop SQLite migrations.
 */

export type EmailBackfillReport = {
  edition: 'cloud' | 'desktop';
  usersTotal: number;
  usersAlreadyHadEmail: number;
  usersBackfilled: number;
  duplicatesResolved: number;
  samples: Array<{ userId: string; username: string; email: string; requiresUpdate: boolean }>;
};

export function normalizeUserEmail(email: string | null | undefined): string | null {
  if (email == null) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Placeholder domain for migrated accounts — administrator must replace with a real address. */
export const MIGRATION_EMAIL_DOMAIN = 'company.local';

export function buildPlaceholderEmail(username: string, userId: string, attempt = 0): string {
  const safeUser = (username || 'user')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '') || 'user';
  const idFrag = userId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  const suffix = attempt > 0 ? `.${idFrag}${attempt > 1 ? attempt : ''}` : '';
  return `${safeUser}${suffix}@${MIGRATION_EMAIL_DOMAIN}`;
}

export type SqliteUserRow = {
  id: string;
  username: string;
  email: string | null;
};

/**
 * Backfill missing user emails in SQLite with globally unique placeholders.
 */
export function backfillUserEmailsSqlite(
  rows: SqliteUserRow[],
  existingEmails: Set<string>,
  edition: 'cloud' | 'desktop'
): { updates: Array<{ id: string; email: string }>; report: EmailBackfillReport } {
  const normalizedExisting = new Set(
    [...existingEmails].map((e) => e.trim().toLowerCase()).filter(Boolean)
  );
  const updates: Array<{ id: string; email: string }> = [];
  let usersAlreadyHadEmail = 0;
  let duplicatesResolved = 0;
  const samples: EmailBackfillReport['samples'] = [];

  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));

  for (const row of sorted) {
    const current = normalizeUserEmail(row.email);
    if (current) {
      usersAlreadyHadEmail += 1;
      normalizedExisting.add(current);
      continue;
    }

    let attempt = 0;
    let candidate = buildPlaceholderEmail(row.username, row.id, attempt);
    while (normalizedExisting.has(candidate)) {
      attempt += 1;
      duplicatesResolved += 1;
      candidate = buildPlaceholderEmail(row.username, row.id, attempt);
    }
    normalizedExisting.add(candidate);
    updates.push({ id: row.id, email: candidate });
    if (samples.length < 10) {
      samples.push({
        userId: row.id,
        username: row.username,
        email: candidate,
        requiresUpdate: true,
      });
    }
  }

  return {
    updates,
    report: {
      edition,
      usersTotal: rows.length,
      usersAlreadyHadEmail,
      usersBackfilled: updates.length,
      duplicatesResolved,
      samples,
    },
  };
}
