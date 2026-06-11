import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getReferralProgramConfig } from './referralProgramConfigService.js';
import { ReferralCodeRepository } from '../../modules/referrals/repositories/ReferralRepository.js';

export type ReferralCodeRow = {
  id: string;
  tenantId: string;
  code: string;
  isActive: boolean;
  totalClicks: number;
  totalSignups: number;
  totalConversions: number;
};

const codeRepo = new ReferralCodeRepository();

function slugPrefix(tenantId: string): string {
  const clean = tenantId.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
  return clean || 'PB';
}

function randomSuffix(length = 6): string {
  return randomBytes(length).toString('base64url').slice(0, length).toUpperCase();
}

export function buildReferralCode(tenantId: string): string {
  return `${slugPrefix(tenantId)}-${randomSuffix()}`;
}

export function buildShareUrl(baseUrl: string, code: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('ref', code);
  return url.toString();
}

export function hashSignupIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

export async function getOrCreateReferralCode(
  client: pg.PoolClient,
  tenantId: string,
  createdByUserId?: string | null
): Promise<ReferralCodeRow> {
  const existing = await codeRepo.getByTenant(client, tenantId);
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomUUID();
    const code = buildReferralCode(tenantId);
    try {
      return await codeRepo.insert(client, {
        id,
        tenantId,
        code,
        createdByUserId: createdByUserId ?? null,
      });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code !== '23505') throw e;
    }
  }
  throw new Error('Failed to generate unique referral code.');
}

export async function findReferralCodeByCode(
  client: pg.PoolClient,
  code: string
): Promise<ReferralCodeRow | null> {
  return codeRepo.findByCode(client, code);
}

export async function validateReferralCode(
  client: pg.PoolClient,
  code: string
): Promise<{ valid: boolean; code?: string; referrerTenantName?: string; shareUrl?: string }> {
  const config = await getReferralProgramConfig(client);
  if (!config.isEnabled) return { valid: false };

  const row = await findReferralCodeByCode(client, code);
  if (!row) return { valid: false };

  const tenantName = await codeRepo.getTenantName(client, row.tenantId);

  return {
    valid: true,
    code: row.code,
    referrerTenantName: tenantName,
    shareUrl: buildShareUrl(config.signupBaseUrl, row.code),
  };
}

export async function incrementReferralCodeMetric(
  client: pg.PoolClient,
  codeId: string,
  metric: 'total_clicks' | 'total_signups' | 'total_conversions'
): Promise<void> {
  await codeRepo.incrementMetric(client, codeId, metric);
}
