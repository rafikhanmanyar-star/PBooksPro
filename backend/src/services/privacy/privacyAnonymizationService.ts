/**
 * Data anonymization — remove PII from user records while preserving referential integrity.
 */

import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import bcrypt from 'bcryptjs';

export type AnonymizeUserResult = {
  userId: string;
  anonymizedUsername: string;
  anonymizedName: string;
};

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
  const { rows } = await client.query(
    `SELECT id, username FROM users WHERE id = $1 AND tenant_id = $2`,
    [targetUserId, tenantId]
  );
  if (rows.length === 0) {
    throw new Error('User not found in this organization.');
  }

  const nextUsername = anonymizedUsername(targetUserId);
  const nextName = anonymizedName(targetUserId);
  const unusableHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);

  await client.query(
    `UPDATE users
     SET username = $1,
         name = $2,
         email = NULL,
         password_hash = $3,
         is_active = FALSE,
         updated_at = NOW()
     WHERE id = $4 AND tenant_id = $5`,
    [nextUsername, nextName, unusableHash, targetUserId, tenantId]
  );

  if (await auditTableExists(client)) {
    await client.query(
      `UPDATE audit_events SET email = NULL WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, targetUserId]
    );
  }

  if (await loginEventsTableExists(client)) {
    await client.query(
      `UPDATE login_events SET email = NULL WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, targetUserId]
    );
  }

  return {
    userId: targetUserId,
    anonymizedUsername: nextUsername,
    anonymizedName: nextName,
  };
}

async function auditTableExists(client: pg.PoolClient): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'audit_events' LIMIT 1`
  );
  return r.rows.length > 0;
}

async function loginEventsTableExists(client: pg.PoolClient): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'login_events' LIMIT 1`
  );
  return r.rows.length > 0;
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
