/**
 * Staging API smoke test — logs in and probes module endpoints.
 * Usage: node scripts/smoke-staging-api.mjs
 */
const API = process.env.VITE_API_URL || 'http://127.0.0.1:3001/api/v1';
const API_BASE = API.replace(/\/api\/v1$/, '').replace(/\/api$/, '');
const TENANT = process.env.VITE_DEFAULT_TENANT_ID || 'test-company';
const EMAIL = process.env.STAGING_ADMIN_EMAIL || 'rafi@company.local';
const PASS = process.env.STAGING_ADMIN_PASSWORD || 'Rafi1234';

const endpoints = [
  { module: 'Dashboard / state', path: '/state/bulk-chunked?chunk=0' },
  { module: 'General Ledger', path: '/transactions?limit=5' },
  { module: 'Personal transactions', path: '/personal-transactions?limit=5' },
  { module: 'Budget Planner', path: '/budgets' },
  { module: 'Project selling', path: '/project-agreements?limit=5' },
  { module: 'Investment Mgmt', path: '/investor/journal/ledger?projectId=all' },
  { module: 'Project construction', path: '/projects' },
  { module: 'Purchase orders', path: '/purchase-orders' },
  { module: 'Goods receipts', path: '/goods-receipts' },
  { module: 'Bills', path: '/bills?limit=5' },
  { module: 'Vendor directory', path: '/vendors' },
  { module: 'PM cycle', path: '/pm-cycle-allocations' },
  { module: 'Rental', path: '/rental-agreements?limit=5' },
  { module: 'Payroll', path: '/payroll/departments' },
  { module: 'Settings', path: '/app-settings' },
  { module: 'Accounts', path: '/accounts' },
  { module: 'Contacts', path: '/contacts?limit=5' },
  { module: 'P&L report', path: '/reports/profit-loss?projectId=all&from=2025-01-01&to=2025-12-31' },
  { module: 'Balance Sheet', path: '/reports/balance-sheet?projectId=all&asOf=2025-12-31' },
  { module: 'Trial Balance', path: '/reports/trial-balance?from=2025-01-01&to=2025-12-31' },
  { module: 'Reconciliation', path: '/reports/reconciliation/certification?from=2025-01-01&to=2025-12-31' },
  { module: 'Cash Flow', path: '/reports/cash-flow?projectId=all&from=2025-01-01&to=2025-12-31' },
];

async function login() {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS, tenantId: TENANT }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Login failed (${res.status}): ${body?.error?.message || JSON.stringify(body)}`);
  }
  if (body?.data?.token) return body.data.token;
  if (body?.data?.requiresCompanySelection && body?.data?.selectionToken) {
    const pick = await fetch(`${API_BASE}/api/v1/auth/select-company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: TENANT,
        selectionToken: body.data.selectionToken,
      }),
    });
    const picked = await pick.json().catch(() => ({}));
    if (!pick.ok || !picked?.data?.token) {
      throw new Error(
        `Company selection failed (${pick.status}): ${picked?.error?.message || JSON.stringify(picked)}`
      );
    }
    return picked.data.token;
  }
  throw new Error(`Login failed (${res.status}): ${body?.error?.message || JSON.stringify(body)}`);
}

async function probe(token, { module, path }) {
  const url = `${API}${path}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    let errMsg = null;
    if (!res.ok) {
      try {
        const j = JSON.parse(text);
        errMsg = j?.error?.message || j?.error?.code || text.slice(0, 200);
      } catch {
        errMsg = text.slice(0, 200);
      }
    }
    return { module, path, status: res.status, ok: res.ok, error: errMsg };
  } catch (e) {
    return { module, path, status: 0, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  console.log(`API smoke test → ${API} (tenant: ${TENANT}, email: ${EMAIL})\n`);
  const health = await fetch(`${API_BASE}/health`);
  console.log(`Health: ${health.status} ${health.ok ? 'OK' : 'FAIL'}\n`);

  const token = await login();
  console.log('Login: OK\n');

  const results = [];
  for (const ep of endpoints) {
    const r = await probe(token, ep);
    results.push(r);
    const mark = r.ok ? '✓' : '✗';
    console.log(`${mark} [${r.status}] ${r.module}${r.error ? ` — ${r.error}` : ''}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- Summary: ${results.length - failed.length}/${results.length} passed ---`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) {
      console.log(`  ${f.module}: ${f.status} ${f.error || ''}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Smoke test aborted:', e.message || e);
  process.exit(1);
});
