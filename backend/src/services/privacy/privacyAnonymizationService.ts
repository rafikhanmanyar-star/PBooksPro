/**
 * Data anonymization — remove PII from user records while preserving referential integrity.
 */

import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import bcrypt from 'bcryptjs';
import { PrivacyAnonymizationRepository } from '../../modules/privacy/repositories/PrivacyRepository.js';

export type AnonymizeUserResult = {
  userId: string;
  anonymizedUsername: string;
  anonymizedName: string;
};

const anonRepo = new PrivacyAnonymizationRepository();

function anonymizedUsername(userId: string): string {
  return `deleted_${userId.replace(/-/g, '').slice(0, 12)}`;
}

function anonymizedName(userId: string): string {
  return `Deleted User (${userId.slice(0, 8)})`;
}

export async function anonymizeUserData(
  client: pg.PoolClient,
  tenantId: string,
  targetUserId: string
): Promise<AnonymizeUserResult> {
  const user = await anonRepo.getUserUsername(client, tenantId, targetUserId);
  if (!user) {
    throw new Error('User not found in this organization.');
  }

  const nextUsername = anonymizedUsername(targetUserId);
  const nextName = anonymizedName(targetUserId);
  const unusableHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);

  await anonRepo.anonymizeUser(client, {
    tenantId,
    userId: targetUserId,
    username: nextUsername,
    name: nextName,
    passwordHash: unusableHash,
  });

  if (await anonRepo.tableExists(client, 'audit_events')) {
    await anonRepo.clearAuditEmail(client, tenantId, targetUserId);
  }

  if (await anonRepo.tableExists(client, 'login_events')) {
    await anonRepo.clearLoginEventEmail(client, tenantId, targetUserId);
  }

  return {
    userId: targetUserId,
    anonymizedUsername: nextUsername,
    anonymizedName: nextName,
  };
}

export function buildAnonymizationMetadata(result: AnonymizeUserResult): Record<string, unknown> {
  return {
    targetUserId: result.userId,
    anonymizedUsername: result.anonymizedUsername,
    anonymizedName: result.anonymizedName,
    processedAt: new Date().toISOString(),
  };
}

export { anonymizedUsername, anonymizedName };
