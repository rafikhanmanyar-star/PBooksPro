import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import { normalizeUserEmail } from './userIdentityService.js';
import { validatePassword } from '../../utils/passwordPolicy.js';

type Queryable = Pool | PoolClient;

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function findUserIdByEmail(db: Queryable, email: string): Promise<string | null> {
  const normalized = normalizeUserEmail(email);
  if (!normalized) return null;
  const r = await db.query<{ id: string }>(
    `SELECT id FROM users
     WHERE LOWER(TRIM(email)) = $1 AND is_active = TRUE
     LIMIT 1`,
    [normalized]
  );
  return r.rows[0]?.id ?? null;
}

/**
 * Create a password-reset token. Returns the raw token for email delivery (not persisted).
 * When email is not configured, callers may log the token in development only.
 */
export async function createPasswordResetToken(
  db: Queryable,
  input: {
    email: string;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<{ userId: string; rawToken: string; expiresAt: Date } | null> {
  const userId = await findUserIdByEmail(db, input.email);
  if (!userId) return null;

  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  const id = `prt_${randomUUID().replace(/-/g, '')}`;

  await db.query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, tokenHash, expiresAt.toISOString(), input.ipAddress ?? null, input.userAgent ?? null]
  );

  return { userId, rawToken, expiresAt };
}

export async function resetPasswordWithToken(
  db: Queryable,
  input: { token: string; newPassword: string }
): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  const passwordError = validatePassword(input.newPassword);
  if (passwordError) {
    return { ok: false, reason: passwordError };
  }

  const tokenHash = hashToken(input.token.trim());
  const r = await db.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  const row = r.rows[0];
  if (!row) {
    return { ok: false, reason: 'Invalid or expired reset link' };
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 10);
  await db.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [passwordHash, row.user_id]
  );
  await db.query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
    [row.id]
  );

  return { ok: true, userId: row.user_id };
}
