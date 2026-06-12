import type pg from 'pg';
import { UserProfileRepository } from '../../auth/repositories/AuthRepository.js';

const userProfileRepo = new UserProfileRepository();

/** Resolve tenant user email for backup audit context. */
export async function getUserEmailForAudit(
  client: pg.PoolClient,
  userId: string | null | undefined
): Promise<string | undefined> {
  if (!userId) return undefined;
  const email = await userProfileRepo.getEmailById(client, userId);
  return email ?? undefined;
}
