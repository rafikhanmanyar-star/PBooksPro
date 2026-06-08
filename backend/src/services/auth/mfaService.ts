/**
 * MFA settings persistence — TOTP secrets and recovery codes.
 */

import bcrypt from 'bcryptjs';
import type pg from 'pg';
import {
  buildOtpauthUri,
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  verifyTotp,
} from '../../auth/totp.js';
import { encryptMfaSecret, decryptMfaSecret } from '../../auth/mfaCrypto.js';
import { userRoleRequiresMfa } from '../../auth/mfaPolicy.js';

export type UserMfaRow = {
  user_id: string;
  tenant_id: string;
  enabled: boolean;
  secret: string | null;
  backup_codes: string[];
};

function parseBackupHashes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

function mapRow(row: pg.QueryResultRow): UserMfaRow {
  return {
    user_id: row.user_id,
    tenant_id: row.tenant_id,
    enabled: Boolean(row.enabled),
    secret: row.secret != null ? String(row.secret) : null,
    backup_codes: parseBackupHashes(row.backup_codes),
  };
}

export async function getUserMfaSettings(
  client: pg.PoolClient,
  userId: string
): Promise<UserMfaRow | null> {
  const { rows } = await client.query(`SELECT * FROM user_mfa_settings WHERE user_id = $1`, [userId]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function startMfaSetup(
  client: pg.PoolClient,
  input: { userId: string; tenantId: string; accountLabel: string }
): Promise<{ secret: string; otpauthUri: string }> {
  const secret = generateTotpSecret();
  const encrypted = encryptMfaSecret(secret);
  await client.query(
    `INSERT INTO user_mfa_settings (user_id, tenant_id, enabled, secret, backup_codes, updated_at)
     VALUES ($1, $2, FALSE, $3, '[]'::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       secret = EXCLUDED.secret,
       enabled = FALSE,
       backup_codes = '[]'::jsonb,
       updated_at = NOW()`,
    [input.userId, input.tenantId, encrypted]
  );
  const otpauthUri = buildOtpauthUri({
    issuer: 'PBooksPro',
    accountName: input.accountLabel,
    secret,
  });
  return { secret, otpauthUri };
}

export async function confirmMfaEnable(
  client: pg.PoolClient,
  userId: string,
  totpCode: string
): Promise<{ backupCodes: string[] }> {
  const settings = await getUserMfaSettings(client, userId);
  if (!settings?.secret) {
    throw new Error('MFA setup not started. Call setup first.');
  }
  const plainSecret = decryptMfaSecret(settings.secret);
  if (!verifyTotp(plainSecret, totpCode, { window: 2 })) {
    throw new Error('Invalid authenticator code.');
  }

  const plainCodes = generateRecoveryCodes(10);
  const hashed = await Promise.all(plainCodes.map((c) => bcrypt.hash(normalizeRecoveryCode(c), 10)));

  await client.query(
    `UPDATE user_mfa_settings
     SET enabled = TRUE, backup_codes = $2::jsonb, updated_at = NOW()
     WHERE user_id = $1`,
    [userId, JSON.stringify(hashed)]
  );

  return { backupCodes: plainCodes };
}

export async function disableMfa(
  client: pg.PoolClient,
  userId: string,
  totpCode: string
): Promise<void> {
  const settings = await getUserMfaSettings(client, userId);
  if (!settings?.enabled || !settings.secret) {
    throw new Error('MFA is not enabled.');
  }
  const plainSecret = decryptMfaSecret(settings.secret);
  if (!verifyTotp(plainSecret, totpCode)) {
    throw new Error('Invalid authenticator code.');
  }
  await client.query(
    `UPDATE user_mfa_settings
     SET enabled = FALSE, secret = NULL, backup_codes = '[]'::jsonb, updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );
}

export async function verifyMfaForLogin(
  client: pg.PoolClient,
  userId: string,
  input: { totpCode?: string; recoveryCode?: string }
): Promise<{ usedRecoveryCode: boolean }> {
  const settings = await getUserMfaSettings(client, userId);
  if (!settings?.enabled || !settings.secret) {
    throw new Error('MFA is not enabled for this account.');
  }

  const plainSecret = decryptMfaSecret(settings.secret);

  if (input.totpCode) {
    if (verifyTotp(plainSecret, input.totpCode)) {
      return { usedRecoveryCode: false };
    }
    throw new Error('Invalid authenticator code.');
  }

  if (input.recoveryCode) {
    const normalized = normalizeRecoveryCode(input.recoveryCode);
    const hashes = settings.backup_codes;
    for (let i = 0; i < hashes.length; i++) {
      const hash = hashes[i]!;
      if (await bcrypt.compare(normalized, hash)) {
        const remaining = hashes.filter((_, idx) => idx !== i);
        await client.query(
          `UPDATE user_mfa_settings SET backup_codes = $2::jsonb, updated_at = NOW() WHERE user_id = $1`,
          [userId, JSON.stringify(remaining)]
        );
        return { usedRecoveryCode: true };
      }
    }
    throw new Error('Invalid recovery code.');
  }

  throw new Error('Provide totpCode or recoveryCode.');
}

export function isMfaRequiredForRole(role: string): boolean {
  return isMfaEnforcementEnabled() && userRoleRequiresMfa(role);
}

/** When true, privileged roles skip MFA at login (staging/dev). Set DISABLE_MFA_ENFORCEMENT=true. */
export function isMfaEnforcementEnabled(): boolean {
  return process.env.DISABLE_MFA_ENFORCEMENT !== 'true';
}

export async function getMfaStatus(
  client: pg.PoolClient,
  userId: string,
  role: string
): Promise<{
  enabled: boolean;
  required: boolean;
  backupCodesRemaining: number;
}> {
  const settings = await getUserMfaSettings(client, userId);
  return {
    enabled: settings?.enabled ?? false,
    required: isMfaRequiredForRole(role),
    backupCodesRemaining: settings?.enabled ? settings.backup_codes.length : 0,
  };
}

export { userRoleRequiresMfa, buildOtpauthUri, verifyTotp, generateTotpSecret };
