import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getReferralProgramConfig } from './referralProgramConfigService.js';

export type ReferralCodeRow = {
  id: string;
  tenantId: string;
  code: string;
  isActive: boolean;
  totalClicks: number;
  totalSignups: number;
  totalConversions: number;
};

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

function mapRow(row: pg.QueryResultRow): ReferralCodeRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    isActive: row.is_active,
    totalClicks: row.total_clicks,
    totalSignups: row.total_signups,
    totalConversions: row.total_conversions,
  };
}

export async function getOrCreateReferralCode(
  client: pg.PoolClient,
  tenantId: string,
  createdByUserId?: string | null
): Promise<ReferralCodeRow> {
  const { rows } = await client.query(
    `SELECT * FROM referral_codes WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  );
  if (rows.length) return mapRow(rows[0]);

  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomUUID();
    const code = buildReferralCode(tenantId);
    try {
      await client.query(
        `INSERT INTO referral_codes (id, tenant_id, code, created_by_user_id)
         VALUES ($1, $2, $3, $4)`,
        [id, tenantId, code, createdByUserId ?? null]
      );
      const created = await client.query(`SELECT * FROM referral_codes WHERE id = $1`, [id]);
      return mapRow(created.rows[0]);
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
  const { rows } = await client.query(
    `SELECT * FROM referral_codes WHERE LOWER(code) = LOWER($1) AND is_active = TRUE LIMIT 1`,
    [code.trim()]
  );
  return rows.length ? mapRow(rows[0]) : null;
}

export async function validateReferralCode(
  client: pg.PoolClient,
  code: string
): Promise<{ valid: boolean; code?: string; referrerTenantName?: string; shareUrl?: string }> {
  const config = await getReferralProgramConfig(client);
  if (!config.isEnabled) return { valid: false };

  const row = await findReferralCodeByCode(client, code);
  if (!row) return { valid: false };

  const { rows } = await client.query(`SELECT name FROM tenants WHERE id = $1`, [row.tenantId]);
  const tenantName = rows[0]?.name as string | undefined;

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
  await client.query(
    `UPDATE referral_codes SET ${metric} = ${metric} + 1, updated_at = NOW() WHERE id = $1`,
    [codeId]
  );
}
