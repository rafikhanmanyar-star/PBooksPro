import { randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { withTransaction } from '../../db/pool.js';
import { signAccessToken } from '../../auth/jwt.js';
import { bootstrapTenantChart } from '../tenantBootstrap.js';
import { startTrialSubscription } from '../billing/subscriptionService.js';
import { getBillingPlanByCode } from '../billing/billingPlanService.js';
import { createMarketingLead } from '../marketing/marketingLeadService.js';
import { requireLegalAcceptances } from '../legal/legalAcceptanceService.js';
import { initializeTrialOnboarding } from '../onboarding/onboardingService.js';
import { validatePassword } from '../../utils/passwordPolicy.js';
import { getRequiredDocuments } from '../../constants/legalDocuments.js';

export type TrialSignupInput = {
  name: string;
  company: string;
  email: string;
  mobile: string;
  password: string;
  legalAcceptances?: Array<{ documentType: string; documentVersion: string }>;
  acceptTerms?: boolean;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  pageUrl?: string;
  userAgent?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
};

export type TrialSignupResult = {
  tenantId: string;
  username: string;
  token: string;
  trialDaysRemaining: number;
  trialEndDate: string;
  appUrl: string;
  leadId?: string;
};

const RESERVED_TENANT_IDS = new Set(['default', 'admin', 'api', 'system', 'www', 'mail', 'ftp']);

function slugify(s: string): string {
  const x = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return x || 'org';
}

function generateTenantId(companyName: string): string {
  return `${slugify(companyName)}-${randomBytes(3).toString('hex')}`;
}

function usernameFromEmail(email: string): string {
  const local = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32);
  return local || `user_${randomBytes(3).toString('hex')}`;
}

function digitsOnlyPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function validateMobile(phone: string): boolean {
  const digits = digitsOnlyPhone(phone);
  return digits.length >= 10 && digits.length <= 15;
}

function defaultLegalAcceptances() {
  return getRequiredDocuments('registration').map((d) => ({
    documentType: d.type,
    documentVersion: d.version,
  }));
}

async function allocateUniqueUsername(
  client: pg.PoolClient,
  tenantId: string,
  email: string
): Promise<string> {
  let base = usernameFromEmail(email);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 28)}_${i}`;
    const exists = await client.query(
      `SELECT 1 FROM users WHERE tenant_id = $1 AND LOWER(username) = LOWER($2)`,
      [tenantId, candidate]
    );
    if (!exists.rows.length) return candidate;
  }
  return `admin_${randomBytes(3).toString('hex')}`;
}

async function allocateTenantId(client: pg.PoolClient, companyName: string): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const id = generateTenantId(companyName);
    if (RESERVED_TENANT_IDS.has(id)) continue;
    const exists = await client.query(`SELECT 1 FROM tenants WHERE id = $1`, [id]);
    if (!exists.rows.length) return id;
  }
  throw new Error('Could not allocate a unique organization ID.');
}

export function trialSignupEnabled(): boolean {
  return (
    process.env.ALLOW_TRIAL_SIGNUP === 'true' ||
    process.env.ALLOW_SELF_SIGNUP === 'true'
  );
}

export async function createTrialSignup(
  input: TrialSignupInput,
  req?: Request
): Promise<TrialSignupResult> {
  const name = input.name.trim();
  const company = input.company.trim();
  const email = input.email.trim().toLowerCase();
  const mobile = input.mobile.trim();

  if (!name || !company || !email.includes('@')) {
    throw Object.assign(new Error('Name, company, and a valid email are required.'), { code: 'VALIDATION_ERROR' });
  }
  if (!validateMobile(mobile)) {
    throw Object.assign(new Error('Enter a valid mobile number (10–15 digits).'), { code: 'VALIDATION_ERROR' });
  }

  const passwordError = validatePassword(input.password);
  if (passwordError) {
    throw Object.assign(new Error(passwordError), { code: 'VALIDATION_ERROR' });
  }

  const legalAcceptances =
    input.legalAcceptances?.length ? input.legalAcceptances : input.acceptTerms ? defaultLegalAcceptances() : [];

  if (!legalAcceptances.length) {
    throw Object.assign(new Error('You must accept the Terms of Service and Privacy Policy.'), {
      code: 'LEGAL_REQUIRED',
    });
  }

  const appUrl = (process.env.TRIAL_SIGNUP_APP_URL || process.env.EMAIL_AUTOMATION_APP_URL || 'https://app.pbookspro.com').replace(
    /\/$/,
    ''
  );

  return withTransaction(async (client) => {
    const tenantId = await allocateTenantId(client, company);
    const username = await allocateUniqueUsername(client, tenantId, email);
    const userId = `user_${randomUUID().replace(/-/g, '')}`;
    const passwordHash = await bcrypt.hash(input.password, 10);

    await client.query(
      `INSERT INTO tenants (id, name, company_name, email, phone)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, company, company, email, mobile]
    );

    await client.query(
      `INSERT INTO users (id, tenant_id, username, name, role, password_hash, email, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
      [userId, tenantId, username, name, 'Admin', passwordHash, email]
    );

    await bootstrapTenantChart(client, tenantId, { legacyIds: false });
    const subscription = await startTrialSubscription(client, tenantId);
    await initializeTrialOnboarding(client, tenantId);

    await requireLegalAcceptances(client, {
      acceptances: legalAcceptances,
      context: 'registration',
      tenantId,
      userId,
      req,
    });

    let leadId: string | undefined;
    if (process.env.MARKETING_LEADS_ENABLED === 'true') {
      const lead = await createMarketingLead(client, {
        source: 'trial_signup',
        leadMagnet: 'free-trial-account',
        name,
        email,
        company,
        mobile,
        campaign: input.utmCampaign,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        pageUrl: input.pageUrl,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
        metadata: {
          tenantId,
          username,
          ...(input.metadata ?? {}),
        },
      });
      leadId = lead.lead.id;
    }

    const trialPlan = await getBillingPlanByCode(client, 'trial');
    const trialDays =
      typeof trialPlan?.features_json?.trial_days === 'number' && trialPlan.features_json.trial_days > 0
        ? trialPlan.features_json.trial_days
        : 14;

    const token = signAccessToken(userId, tenantId, 'Admin');

    return {
      tenantId,
      username,
      token,
      trialDaysRemaining: trialDays,
      trialEndDate: subscription.trial_end_date ?? new Date(Date.now() + trialDays * 86400000).toISOString(),
      appUrl,
      leadId,
    };
  });
}
