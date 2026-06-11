import type pg from 'pg';
import type { ReferralProgramConfig } from '../../constants/referralTypes.js';
import { ReferralProgramConfigRepository } from '../../modules/referrals/repositories/ReferralRepository.js';

const configRepo = new ReferralProgramConfigRepository();

export async function getReferralProgramConfig(
  client: pg.PoolClient
): Promise<ReferralProgramConfig> {
  return configRepo.get(client);
}

export async function updateReferralProgramConfig(
  client: pg.PoolClient,
  patch: Partial<ReferralProgramConfig>
): Promise<ReferralProgramConfig> {
  const current = await getReferralProgramConfig(client);
  const next = { ...current, ...patch };
  await configRepo.update(client, next);
  return getReferralProgramConfig(client);
}
