import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { randomBytes, randomUUID } from 'node:crypto';
import { getPool, withTransaction } from '../db/pool.js';
import { signAccessToken } from '../auth/jwt.js';
import { bootstrapTenantChart } from '../services/tenantBootstrap.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  tenantId: z.string().optional(),
});

const registerTenantSchema = z.object({
  companyName: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(80).optional(),
  address: z.string().max(500).optional(),
  adminUsername: z.string().min(3).max(64),
  adminPassword: z.string().min(6).max(256),
  adminName: z.string().min(1).max(200),
  isSupplier: z.boolean().optional(),
  requestedTenantId: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z
      .string()
      .min(2)
      .max(63)
      .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Organization ID must be lowercase letters, numbers, and hyphens')
      .optional()
  ),
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMIT', message: 'Too many registration attempts. Try again later.' },
  },
});

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
  const base = slugify(companyName);
  const suffix = randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}

/**
 * Public directory of organizations for the login screen (LAN / self-hosted).
 * Returns id + display name only; no secrets.
 */
authRouter.get('/auth/tenants', async (_req, res) => {
  try {
    const pool = getPool();
    const r = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM tenants ORDER BY LOWER(name) ASC, id ASC`
    );
    sendSuccess(res, r.rows);
  } catch (e) {
    handleRouteError(res, e);
  }
});

authRouter.post('/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'username and password required');
    return;
  }
  const { username, password, tenantId: bodyTenant } = parsed.data;
  const tenantId = bodyTenant || 'default';

  try {
    const pool = getPool();
    const r = await pool.query<{
      id: string;
      password_hash: string;
      name: string;
      role: string;
      tenant_id: string;
      username: string;
      tenant_name: string;
      display_timezone: string | null;
    }>(
      `SELECT u.id, u.password_hash, u.name, u.role, u.tenant_id, u.username, t.name AS tenant_name,
              u.display_timezone
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.tenant_id = $1 AND LOWER(u.username) = LOWER($2) AND u.is_active = TRUE`,
      [tenantId, username]
    );
    if (r.rows.length === 0) {
      sendFailure(res, 401, 'AUTH_FAILED', 'Invalid credentials');
      return;
    }
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      sendFailure(res, 401, 'AUTH_FAILED', 'Invalid credentials');
      return;
    }
    const token = signAccessToken(user.id, user.tenant_id, user.role);
    sendSuccess(res, {
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        tenantId: user.tenant_id,
        displayTimezone: user.display_timezone ?? null,
      },
      tenant: {
        id: user.tenant_id,
        name: user.tenant_name,
        companyName: user.tenant_name,
      },
    });
  } catch (e) {
    handleRouteError(res, e);
  }
});

authRouter.post('/auth/register-tenant', registerLimiter, async (req, res) => {
  const allow = process.env.ALLOW_SELF_SIGNUP === 'true';
  if (!allow) {
    sendFailure(
      res,
      403,
      'SELF_SIGNUP_DISABLED',
      'Self-service registration is disabled. Set ALLOW_SELF_SIGNUP=true on the API server to enable it.'
    );
    return;
  }

  const parsed = registerTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg = Object.values(first).flat()[0] || 'Invalid registration data';
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
    return;
  }

  const { companyName, email, adminUsername, adminPassword, adminName, requestedTenantId } = parsed.data;

  let tenantId: string;
  if (requestedTenantId) {
    tenantId = requestedTenantId.toLowerCase();
    if (RESERVED_TENANT_IDS.has(tenantId)) {
      sendFailure(res, 400, 'INVALID_TENANT_ID', 'This organization ID is reserved.');
      return;
    }
  } else {
    tenantId = generateTenantId(companyName);
  }

  const pool = getPool();
  if (requestedTenantId) {
    const exists = await pool.query('SELECT 1 FROM tenants WHERE id = $1', [tenantId]);
    if (exists.rows.length > 0) {
      sendFailure(res, 409, 'DUPLICATE', 'This organization ID is already in use.');
      return;
    }
  } else {
    for (let attempt = 0; attempt < 12; attempt++) {
      const exists = await pool.query('SELECT 1 FROM tenants WHERE id = $1', [tenantId]);
      if (exists.rows.length === 0) break;
      tenantId = generateTenantId(companyName);
      if (attempt === 11) {
        sendFailure(res, 500, 'SERVER_ERROR', 'Could not allocate a unique organization ID.');
        return;
      }
    }
  }

  const userId = `user_${randomUUID().replace(/-/g, '')}`;
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const tenantDisplayName = companyName.trim();
  const emailVal = email.trim().toLowerCase();

  try {
    await withTransaction(async (client) => {
      await client.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [tenantId, tenantDisplayName]);

      await client.query(
        `INSERT INTO users (id, tenant_id, username, name, role, password_hash, email, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
        [userId, tenantId, adminUsername.trim(), adminName.trim(), 'Admin', passwordHash, emailVal]
      );

      await bootstrapTenantChart(client, tenantId, { legacyIds: false });
    });

    const trialDaysRemaining = 30;

    sendSuccess(
      res,
      {
        tenantId,
        trialDaysRemaining,
        message: `Organization "${tenantDisplayName}" created. Sign in with your admin username and this organization ID.`,
      },
      201
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === '23505') {
      sendFailure(res, 409, 'DUPLICATE', 'This organization ID or username already exists.');
      return;
    }
    handleRouteError(res, e);
  }
});
