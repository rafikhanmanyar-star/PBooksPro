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
import { MfaRepository } from '../../modules/auth/repositories/AuthRepository.js';

export type UserMfaRow = {
  user_id: string;
  tenant_id: string;
  enabled: boolean;
  secret: string | null;
  backup_codes: string[];
};

const mfaRepo = new MfaRepository();

export async function getUserMfaSettings(
  client: pg.PoolClient,
  userId: string
): Promise<UserMfaRow | null> {
  return mfaRepo.getByUserId(client, userId);
}

export async function startMfaSetup(
  client: pg.PoolClient,
  input: { userId: string; tenantId: string; accountLabel: string }
): Promise<{ secret: string; otpauthUri: string }> {
  const secret = generateTotpSecret();
  const encrypted = encryptMfaSecret(secret);
  await mfaRepo.upsertSetup(client, {
    userId: input.userId,
    tenantId: input.tenantId,
    encryptedSecret: encrypted,
  });
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

  await mfaRepo.enableWithBackupCodes(client, userId, JSON.stringify(hashed));

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
  await mfaRepo.disable(client, userId);
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
        await mfaRepo.updateBackupCodes(client, userId, JSON.stringify(remaining));
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
