/**
 * Staging API validation for RBAC V2 cutover (requires API on :3001).
 * Usage: node --import tsx scripts/rbac-staging-api-validation.mjs
 */
import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';

const outDir = resolve('docs/security/staging-evidence');
mkdirSync(outDir, { recursive: true });

dotenv.config({ path: resolve('.env.staging') });
const base = process.env.VITE_API_URL?.replace(/\/api\/v1$/, '') || 'http://127.0.0.1:3001';
const api = `${base}/api/v1`;
const tenant = process.env.VITE_DEFAULT_TENANT_ID || 'test-company';
const email = process.env.STAGING_ADMIN_EMAIL || 'rafi@company.local';
const password = process.env.STAGING_ADMIN_PASSWORD || 'Rafi1234';
const lines = [];
const log = (s) => {
  lines.push(s);
  console.log(s);
};

const flags = {
  RBAC_V2_ROLE_MANAGEMENT: process.env.RBAC_V2_ROLE_MANAGEMENT,
  RBAC_V2_SOD: process.env.RBAC_V2_SOD,
  RBAC_V2_BREAK_GLASS: process.env.RBAC_V2_BREAK_GLASS,
  RBAC_V2_AUTHORIZATION_ENGINE: process.env.RBAC_V2_AUTHORIZATION_ENGINE,
  RBAC_V2_DATA_SCOPE: process.env.RBAC_V2_DATA_SCOPE,
  RBAC_V2_APPROVAL_MATRIX: process.env.RBAC_V2_APPROVAL_MATRIX,
};
log('=== RBAC Staging API Validation ===');
log(`Time: ${new Date().toISOString()}`);
log(`Base URL: ${base}`);
log(`Flags: ${JSON.stringify(flags)}`);

try {
  const health = await fetch(`${base}/health`);
  log(`GET /health → ${health.status}`);
  if (!health.ok) throw new Error('API not reachable');

  const loginRes = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, tenantId: tenant }),
  });
  log(`POST /auth/login (${email}) → ${loginRes.status}`);
  const loginBody = await loginRes.json().catch(() => ({}));
  let token = loginBody?.data?.token;
  if (!token && loginBody?.data?.selectionToken) {
    const pick = await fetch(`${api}/auth/select-company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: tenant, selectionToken: loginBody.data.selectionToken }),
    });
    const picked = await pick.json().catch(() => ({}));
    token = picked?.data?.token;
    log(`POST /auth/select-company → ${pick.status}`);
  }
  const av = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).av : null;
  log(`JWT av present: ${Boolean(av)} av=${av ?? 'n/a'}`);

  if (token) {
    const ctx = await fetch(`${api}/rbac/effective-context`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    log(`GET /rbac/effective-context → ${ctx.status}`);
    if (ctx.ok) {
      const body = await ctx.json();
      const data = body?.data ?? body;
      log(`roleVersionHash present: ${Boolean(data?.roleVersionHash)}`);
      log(`permissions count: ${data?.permissions?.length ?? 'n/a'}`);
      log(`scopes count: ${data?.scopes?.length ?? 0}`);
      log(`approvalCapabilities count: ${data?.approvalCapabilities?.length ?? 0}`);
    }

    const catalog = await fetch(`${api}/rbac/permission-catalog`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    log(`GET /rbac/permission-catalog → ${catalog.status}`);

    // TOKEN_STALE: use wrong av
    const staleRes = await fetch(`${base}/api/v1/rbac/effective-context`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Debug-Force-Stale-Av': '1',
      },
    });
    log(`effective-context (normal token after login): ${ctx.status}`);
  } else {
    log('Login failed — skip authenticated checks');
  }
} catch (e) {
  log(`ERROR: ${e.message}`);
  log('Start API: npm run start:backend:staging');
}

writeFileSync(resolve(outDir, 'api-validation.txt'), lines.join('\n') + '\n');
