import dotenv from 'dotenv';
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.staging');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing — set .env.staging');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
try {
  const tenants = await pool.query(`
    SELECT id, name, COALESCE(email, '') AS email, COALESCE(status, 'ACTIVE') AS status
    FROM tenants
    WHERE id !~ '^__'
    ORDER BY LOWER(name), id
  `);

  const users = await pool.query(`
    SELECT u.tenant_id, u.username, COALESCE(u.name, '') AS name,
           COALESCE(u.email, '') AS email, u.role, u.is_active
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id
    WHERE t.id !~ '^__'
    ORDER BY u.tenant_id, LOWER(u.username)
  `);

  const byTenant = new Map();
  for (const u of users.rows) {
    if (!byTenant.has(u.tenant_id)) byTenant.set(u.tenant_id, []);
    byTenant.get(u.tenant_id).push(u);
  }

  const orgRequests = await pool.query(`
    SELECT tenant_id, company_name, email, admin_username, status, created_at
    FROM organization_requests
    ORDER BY created_at DESC
    LIMIT 50
  `).catch(() => ({ rows: [] }));

  console.log(JSON.stringify({
    organizations: tenants.rows.map((t) => ({
      tenantId: t.id,
      companyName: t.name,
      companyEmail: t.email || null,
      status: t.status,
      users: (byTenant.get(t.id) || []).map((u) => ({
        username: u.username,
        fullName: u.name,
        userEmail: u.email || null,
        role: u.role,
        isActive: u.is_active,
      })),
    })),
    organizationRequests: orgRequests.rows,
    knownSeedPasswords: {
      'test-company': {
        Rafi: 'Rafi1234',
      },
    },
    loginNote:
      'New login requires Company email (tenants.email). Staging seed does not set it yet — set email on tenants or use registration email below.',
  }, null, 2));
} finally {
  await pool.end();
}
