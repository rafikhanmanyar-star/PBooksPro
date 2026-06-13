/**
 * List cloud production org credentials and backfill tenants.email when missing.
 *
 * Env (first match wins for cloud URL):
 *   PG_URL in .env
 *   DATABASE_URL in .env.production.render (Render cloud production)
 *
 * Passwords are bcrypt-hashed in DB — only known seed/demo defaults are listed.
 *
 * Usage:
 *   npm run list:production-cloud-credentials
 *   node scripts/list-production-cloud-credentials.mjs --dry-run
 *   node scripts/list-production-cloud-credentials.mjs --env-file .env.production
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const listOnly = process.argv.includes('--list-only');

const envFileArgIdx = process.argv.indexOf('--env-file');
const envFiles =
  envFileArgIdx >= 0 && process.argv[envFileArgIdx + 1]
    ? [process.argv[envFileArgIdx + 1]]
    : ['.env.production.render', '.env'];

for (const f of envFiles) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) dotenv.config({ path: p });
}

function defaultCompanyEmail(companyName, tenantId) {
  if (tenantId === 'demo-company' || tenantId.startsWith('demo-company-')) {
    return 'demo@company.com';
  }
  if (tenantId === 'pbooks-demo') {
    return 'demo@pbookspro.com';
  }
  const slug =
    (companyName || tenantId).toLowerCase().replace(/[^a-z0-9]+/g, '') ||
    tenantId.replace(/[^a-z0-9]+/g, '');
  return `${slug}@pbookspro.com`;
}

function resolveDbUrl() {
  const candidates = [process.env.PG_URL, process.env.DATABASE_URL].filter(Boolean);
  return candidates[0] || null;
}

const url = resolveDbUrl();
if (!url) {
  console.error('No DATABASE_URL/PG_URL found (.env.production.render, .env, or --env-file).');
  process.exit(1);
}

const knownPasswordHints = {
  'pbooks-demo': { demo: process.env.DEMO_USER_PASSWORD || 'Demo@2024!' },
  'demo-company': { demo: process.env.DEMO_PRESENTATION_PASSWORD || process.env.DEMO_USER_PASSWORD || 'Demo@2024!' },
  'test-company': { Rafi: process.env.STAGING_ADMIN_PASSWORD || 'Rafi1234' },
  'rk-builders-284d6d': { Rafi: process.env.RK_BUILDERS_RAFI_PASSWORD || 'Rafi1234' },
};

function passwordHint(tenantId, username) {
  const byTenant = knownPasswordHints[tenantId];
  if (byTenant && byTenant[username]) return byTenant[username];
  if (tenantId.startsWith('demo-company') && username === 'demo') {
    return process.env.DEMO_PRESENTATION_PASSWORD || process.env.DEMO_USER_PASSWORD || 'Demo@2024!';
  }
  if (username === 'Rafi') return process.env.RK_BUILDERS_RAFI_PASSWORD || 'Rafi1234 (if seeded via seed-rk-builders-rafi)';
  return '(bcrypt hash — use password you set at signup, or reset via admin)';
}

const ssl =
  /render\.com|amazonaws\.com|rds\./i.test(url) ? { rejectUnauthorized: false } : undefined;

const pool = new pg.Pool({ connectionString: url, ssl });

try {
  const missing = await pool.query(`
    SELECT id, name, COALESCE(email, '') AS email
    FROM tenants
    WHERE id !~ '^__' AND (email IS NULL OR TRIM(email) = '')
    ORDER BY id
  `);

  const wrongPresentation = await pool.query(`
    SELECT id, name, COALESCE(email, '') AS email
    FROM tenants
    WHERE (id = 'demo-company' OR id LIKE 'demo-company-%')
      AND LOWER(TRIM(email)) <> 'demo@company.com'
    ORDER BY id
  `);

  const emailsAdded = [];
  const shouldApply = !dryRun && !listOnly;
  for (const t of missing.rows) {
    const email = defaultCompanyEmail(t.name, t.id);
    emailsAdded.push({ tenantId: t.id, companyName: t.name, companyEmail: email, reason: 'missing' });
    if (shouldApply) {
      await pool.query('UPDATE tenants SET email = $1, updated_at = NOW() WHERE id = $2', [email, t.id]);
    }
  }
  for (const t of wrongPresentation.rows) {
    const email = 'demo@company.com';
    emailsAdded.push({ tenantId: t.id, companyName: t.name, companyEmail: email, reason: 'presentation-repair' });
    if (shouldApply) {
      await pool.query('UPDATE tenants SET email = $1, updated_at = NOW() WHERE id = $2', [email, t.id]);
    }
  }

  const tenants = await pool.query(`
    SELECT id, name, COALESCE(company_name, name) AS company_name,
           COALESCE(email, '') AS email, COALESCE(status, 'ACTIVE') AS status
    FROM tenants
    WHERE id !~ '^__'
    ORDER BY LOWER(COALESCE(company_name, name)), id
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

  const rows = tenants.rows.map((t) => ({
    companyName: t.company_name,
    companyEmail: t.email || null,
    tenantId: t.id,
    status: t.status,
    users: (byTenant.get(t.id) || []).map((u) => ({
      username: u.username,
      password: passwordHint(t.id, u.username),
      fullName: u.name,
      userEmail: u.email || null,
      role: u.role,
      isActive: u.is_active,
    })),
  }));

  console.log('');
  console.log('Production DB credentials (for new login: company email + username + password)');
  console.log('============================================================================');
  console.log(`Database: ${url.replace(/:[^:@/]+@/, ':***@').split('@').pop()?.split('?')[0]}`);
  if (dryRun) console.log('(dry-run — tenant emails were NOT updated)');
  if (listOnly) console.log('(list-only — tenant emails were NOT updated)');
  if (emailsAdded.length) {
    console.log('');
    console.log(`Company emails ${shouldApply ? 'added/repaired' : 'missing / to add'} (${emailsAdded.length}):`);
    for (const e of emailsAdded) {
      const note = e.reason === 'presentation-repair' ? ' [presentation demo]' : '';
      console.log(`  ${e.companyName} (${e.tenantId}) → ${e.companyEmail}${note}`);
    }
  }
  console.log('');

  for (const org of rows) {
    console.log(`■ ${org.companyName}`);
    console.log(`  Company email: ${org.companyEmail || '(missing — run without --list-only to backfill)'}`);
    console.log(`  Tenant ID:     ${org.tenantId}`);
    console.log(`  Status:        ${org.status}`);
    if (!org.users.length) {
      console.log('  Users:         (none)');
    } else {
      console.log('  Users:');
      for (const u of org.users) {
        const active = u.isActive ? '' : ' [inactive]';
        console.log(`    - Username: ${u.username}`);
        console.log(`      Password: ${u.password}${active}`);
        if (u.userEmail) console.log(`      User email: ${u.userEmail}`);
        console.log(`      Role: ${u.role}${u.fullName ? ` (${u.fullName})` : ''}`);
      }
    }
    console.log('');
  }

  console.log('Note: Customer-chosen passwords are not stored in plain text.');
  console.log('      Demo/seed passwords above apply only when those seeds were run.');
} finally {
  await pool.end();
}
