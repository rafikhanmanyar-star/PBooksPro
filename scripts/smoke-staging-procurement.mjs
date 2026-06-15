/**
 * Staging procurement smoke — PO billing context, bill_po_lines, workflow endpoints.
 * Usage: node scripts/smoke-staging-procurement.mjs
 */
const API = process.env.VITE_API_URL || 'http://127.0.0.1:3001/api/v1';
const API_BASE = API.replace(/\/api\/v1$/, '').replace(/\/api$/, '');
const TENANT = process.env.VITE_DEFAULT_TENANT_ID || 'test-company';
const EMAIL = process.env.STAGING_ADMIN_EMAIL || 'rafi@company.local';
const PASS = process.env.STAGING_ADMIN_PASSWORD || 'Rafi1234';

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
      body: JSON.stringify({ companyId: TENANT, selectionToken: body.data.selectionToken }),
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

async function getJson(token, path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { res, body };
}

function assert(name, cond, detail = '') {
  const mark = cond ? '✓' : '✗';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  return cond;
}

async function main() {
  console.log(`Procurement smoke → ${API} (tenant: ${TENANT})\n`);

  const health = await fetch(`${API_BASE}/health`);
  if (!assert('Health', health.ok, String(health.status))) process.exit(1);

  const token = await login();
  assert('Login', true);

  const checks = [];

  // Purchase orders list
  const poList = await getJson(token, '/purchase-orders');
  checks.push(assert('GET /purchase-orders', poList.res.ok, String(poList.res.status)));

  const pos = Array.isArray(poList.body?.data) ? poList.body.data : [];
  const approvedPo = pos.find((p) =>
    ['Approved', 'Partially Billed', 'Fully Billed'].includes(String(p.status))
  );

  if (approvedPo?.id) {
    const ctx = await getJson(
      token,
      `/purchase-orders/${approvedPo.id}/billing-context`
    );
    checks.push(assert('GET billing-context', ctx.res.ok, String(ctx.res.status)));
    const lines = ctx.body?.data?.lines;
    checks.push(
      assert(
        'billing-context.lines array',
        Array.isArray(lines),
        lines ? `${lines.length} line(s)` : 'missing'
      )
    );
    if (Array.isArray(lines) && lines.length > 0) {
      const sample = lines[0];
      checks.push(
        assert(
          'line has billableQty',
          typeof sample.billableQty === 'number' && typeof sample.receivedQty === 'number',
          `rcvd=${sample.receivedQty} billable=${sample.billableQty}`
        )
      );
    }
  } else {
    console.log('○ No approved PO — skipped billing-context line probe');
  }

  // PO report summary
  const poReport = await getJson(token, '/purchase-orders/report/summary');
  checks.push(assert('GET PO report summary', poReport.res.ok, String(poReport.res.status)));

  // Goods receipts
  const grn = await getJson(token, '/goods-receipts');
  checks.push(assert('GET /goods-receipts', grn.res.ok, String(grn.res.status)));

  // Bills list + single bill poBillLines shape
  const bills = await getJson(token, '/bills?limit=20');
  checks.push(assert('GET /bills', bills.res.ok, String(bills.res.status)));

  const billRows = Array.isArray(bills.body?.data) ? bills.body.data : [];
  const poBill = billRows.find((b) => b.purchaseOrderId);
  if (poBill?.id) {
    const billDetail = await getJson(token, `/bills/${poBill.id}`);
    checks.push(assert('GET /bills/:id (PO-linked)', billDetail.res.ok, String(billDetail.res.status)));
    const poLines = billDetail.body?.data?.poBillLines;
    checks.push(
      assert(
        'bill poBillLines field present',
        poLines === undefined || Array.isArray(poLines),
        poLines ? `${poLines.length} line(s)` : 'none (header-only OK)'
      )
    );
  } else {
    console.log('○ No PO-linked bill — skipped bill detail probe');
  }

  // Workflow submit routes exist (OPTIONS/405 or auth OK — we use POST with token)
  if (billRows[0]?.id) {
    const billId = billRows[0].id;
    const submit = await fetch(`${API}/bills/${billId}/submit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    // 200/400/409 acceptable — route must exist (not 404)
    checks.push(
      assert(
        'POST /bills/:id/submit route',
        submit.status !== 404,
        String(submit.status)
      )
    );
  }

  const passed = checks.filter(Boolean).length;
  const total = checks.length;
  console.log(`\n--- Procurement summary: ${passed}/${total} passed ---`);
  if (passed < total) process.exit(1);
}

main().catch((e) => {
  console.error('Procurement smoke aborted:', e.message || e);
  process.exit(1);
});
