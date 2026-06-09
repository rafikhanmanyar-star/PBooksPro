import type pg from 'pg';

export type PeVRegisterRow = {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  projectId: string;
  projectName: string;
  categoryName: string;
  vendorName: string | null;
  amount: number;
  status: string;
  description: string | null;
};

export type PeVAggregateRow = {
  key: string;
  label: string;
  count: number;
  amount: number;
};

export type PeVTrendRow = {
  period: string;
  count: number;
  amount: number;
};

export async function getProjectExpenseRegister(
  client: pg.PoolClient,
  tenantId: string,
  filters?: {
    projectId?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
  }
): Promise<PeVRegisterRow[]> {
  const clauses = ['v.tenant_id = $1', 'v.deleted_at IS NULL'];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (filters?.projectId) {
    clauses.push(`v.project_id = $${idx++}`);
    params.push(filters.projectId);
  }
  if (filters?.status) {
    clauses.push(`v.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.fromDate) {
    clauses.push(`v.voucher_date >= $${idx++}::date`);
    params.push(filters.fromDate);
  }
  if (filters?.toDate) {
    clauses.push(`v.voucher_date <= $${idx++}::date`);
    params.push(filters.toDate);
  }

  const r = await client.query<{
    id: string;
    voucher_number: string;
    voucher_date: Date;
    project_id: string;
    project_name: string;
    category_name: string;
    vendor_name: string | null;
    amount: string;
    status: string;
    description: string | null;
  }>(
    `SELECT v.id, v.voucher_number, v.voucher_date, v.project_id,
       COALESCE(p.name, v.project_id) AS project_name,
       COALESCE(c.name, v.expense_category_id) AS category_name,
       ven.name AS vendor_name,
       v.amount::text, v.status, v.description
     FROM project_expense_vouchers v
     LEFT JOIN projects p ON p.id = v.project_id AND p.tenant_id = v.tenant_id
     LEFT JOIN project_expense_categories c ON c.id = v.expense_category_id AND c.tenant_id = v.tenant_id
     LEFT JOIN vendors ven ON ven.id = v.vendor_id AND ven.tenant_id = v.tenant_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY v.voucher_date DESC, v.voucher_number DESC`,
    params
  );

  return r.rows.map((row) => ({
    id: row.id,
    voucherNumber: row.voucher_number,
    voucherDate:
      row.voucher_date instanceof Date
        ? row.voucher_date.toISOString().slice(0, 10)
        : String(row.voucher_date).slice(0, 10),
    projectId: row.project_id,
    projectName: row.project_name,
    categoryName: row.category_name,
    vendorName: row.vendor_name,
    amount: Number(row.amount),
    status: row.status,
    description: row.description,
  }));
}

export async function getPeVExpenseByCategory(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { projectId?: string; fromDate?: string; toDate?: string; postedOnly?: boolean }
): Promise<PeVAggregateRow[]> {
  const clauses = ['v.tenant_id = $1', 'v.deleted_at IS NULL'];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (filters?.postedOnly !== false) {
    clauses.push(`v.status = 'posted'`);
  }
  if (filters?.projectId) {
    clauses.push(`v.project_id = $${idx++}`);
    params.push(filters.projectId);
  }
  if (filters?.fromDate) {
    clauses.push(`v.voucher_date >= $${idx++}::date`);
    params.push(filters.fromDate);
  }
  if (filters?.toDate) {
    clauses.push(`v.voucher_date <= $${idx++}::date`);
    params.push(filters.toDate);
  }

  const r = await client.query<{ key: string; label: string; cnt: string; total: string }>(
    `SELECT c.id AS key, c.name AS label,
       COUNT(*)::text AS cnt, COALESCE(SUM(v.amount), 0)::text AS total
     FROM project_expense_vouchers v
     INNER JOIN project_expense_categories c ON c.id = v.expense_category_id AND c.tenant_id = v.tenant_id
     WHERE ${clauses.join(' AND ')}
     GROUP BY c.id, c.name
     ORDER BY SUM(v.amount) DESC`,
    params
  );

  return r.rows.map((row) => ({
    key: row.key,
    label: row.label,
    count: Number(row.cnt),
    amount: Number(row.total),
  }));
}

export async function getPeVExpenseByProject(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { fromDate?: string; toDate?: string; postedOnly?: boolean }
): Promise<PeVAggregateRow[]> {
  const clauses = ['v.tenant_id = $1', 'v.deleted_at IS NULL'];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (filters?.postedOnly !== false) {
    clauses.push(`v.status = 'posted'`);
  }
  if (filters?.fromDate) {
    clauses.push(`v.voucher_date >= $${idx++}::date`);
    params.push(filters.fromDate);
  }
  if (filters?.toDate) {
    clauses.push(`v.voucher_date <= $${idx++}::date`);
    params.push(filters.toDate);
  }

  const r = await client.query<{ key: string; label: string; cnt: string; total: string }>(
    `SELECT p.id AS key, COALESCE(p.name, v.project_id) AS label,
       COUNT(*)::text AS cnt, COALESCE(SUM(v.amount), 0)::text AS total
     FROM project_expense_vouchers v
     LEFT JOIN projects p ON p.id = v.project_id AND p.tenant_id = v.tenant_id
     WHERE ${clauses.join(' AND ')}
     GROUP BY p.id, p.name, v.project_id
     ORDER BY SUM(v.amount) DESC`,
    params
  );

  return r.rows.map((row) => ({
    key: row.key,
    label: row.label,
    count: Number(row.cnt),
    amount: Number(row.total),
  }));
}

export async function getPeVExpenseByVendor(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { projectId?: string; fromDate?: string; toDate?: string; postedOnly?: boolean }
): Promise<PeVAggregateRow[]> {
  const clauses = ['v.tenant_id = $1', 'v.deleted_at IS NULL', 'v.vendor_id IS NOT NULL'];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (filters?.postedOnly !== false) {
    clauses.push(`v.status = 'posted'`);
  }
  if (filters?.projectId) {
    clauses.push(`v.project_id = $${idx++}`);
    params.push(filters.projectId);
  }
  if (filters?.fromDate) {
    clauses.push(`v.voucher_date >= $${idx++}::date`);
    params.push(filters.fromDate);
  }
  if (filters?.toDate) {
    clauses.push(`v.voucher_date <= $${idx++}::date`);
    params.push(filters.toDate);
  }

  const r = await client.query<{ key: string; label: string; cnt: string; total: string }>(
    `SELECT ven.id AS key, COALESCE(ven.name, v.vendor_id) AS label,
       COUNT(*)::text AS cnt, COALESCE(SUM(v.amount), 0)::text AS total
     FROM project_expense_vouchers v
     INNER JOIN vendors ven ON ven.id = v.vendor_id AND ven.tenant_id = v.tenant_id
     WHERE ${clauses.join(' AND ')}
     GROUP BY ven.id, ven.name, v.vendor_id
     ORDER BY SUM(v.amount) DESC`,
    params
  );

  return r.rows.map((row) => ({
    key: row.key,
    label: row.label,
    count: Number(row.cnt),
    amount: Number(row.total),
  }));
}

export async function getPeVExpenseTrend(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { projectId?: string; fromDate?: string; toDate?: string; granularity?: 'month' | 'week' }
): Promise<PeVTrendRow[]> {
  const granularity = filters?.granularity === 'week' ? 'week' : 'month';
  const trunc = granularity === 'week' ? 'week' : 'month';

  const clauses = [`v.tenant_id = $1`, `v.deleted_at IS NULL`, `v.status = 'posted'`];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (filters?.projectId) {
    clauses.push(`v.project_id = $${idx++}`);
    params.push(filters.projectId);
  }
  if (filters?.fromDate) {
    clauses.push(`v.voucher_date >= $${idx++}::date`);
    params.push(filters.fromDate);
  }
  if (filters?.toDate) {
    clauses.push(`v.voucher_date <= $${idx++}::date`);
    params.push(filters.toDate);
  }

  const r = await client.query<{ period: Date; cnt: string; total: string }>(
    `SELECT date_trunc('${trunc}', v.voucher_date)::date AS period,
       COUNT(*)::text AS cnt, COALESCE(SUM(v.amount), 0)::text AS total
     FROM project_expense_vouchers v
     WHERE ${clauses.join(' AND ')}
     GROUP BY 1
     ORDER BY 1 ASC`,
    params
  );

  return r.rows.map((row) => ({
    period:
      row.period instanceof Date ? row.period.toISOString().slice(0, 10) : String(row.period).slice(0, 10),
    count: Number(row.cnt),
    amount: Number(row.total),
  }));
}
