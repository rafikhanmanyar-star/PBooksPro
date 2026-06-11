import type { PoolClient } from 'pg';
import { getPool } from '../../db/pool.js';
import {
  UserSessionRepository,
  newSessionId,
} from '../../modules/auth/repositories/AuthRepository.js';

const sessionRepo = new UserSessionRepository();

export async function upsertUserSession(
  client: PoolClient,
  userId: string,
  tenantId: string,
  loginEventId?: string | null
): Promise<void> {
  await sessionRepo.upsert(client, {
    id: `us_${newSessionId().replace(/-/g, '')}`,
    userId,
    tenantId,
    loginEventId: loginEventId ?? null,
  });
}

export async function touchUserSession(userId: string, tenantId: string): Promise<void> {
  const pool = getPool();
  await sessionRepo.touch(pool, userId, tenantId, `us_${newSessionId().replace(/-/g, '')}`);
}

export async function deleteUserSession(
  client: PoolClient,
  userId: string,
  tenantId: string
): Promise<void> {
  await sessionRepo.delete(client, userId, tenantId);
}

export async function markUserLoggedIn(
  client: PoolClient,
  userId: string,
  tenantId: string
): Promise<void> {
  await sessionRepo.markLoggedIn(client, userId, tenantId);
}

export async function markUserLoggedOut(
  client: PoolClient,
  userId: string,
  tenantId: string
): Promise<void> {
  await sessionRepo.markLoggedOut(client, userId, tenantId);
}
