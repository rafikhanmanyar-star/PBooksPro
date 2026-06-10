import type pg from 'pg';

export interface DashboardActivityItem {
  id: string;
  type: 'Invoice' | 'Income' | 'Expense';
  title: string;
  amount: number;
  date: string;
}

export interface DashboardActivityResponse {
  items: DashboardActivityItem[];
  generatedAt: string;
}

/**
 * Recent invoices and income/expense transactions for the executive dashboard feed.
 */
export async function getDashboardActivityJson(
  client: pg.PoolClient,
  tenantId: string,
  limit = 5
): Promise<DashboardActivityResponse> {
  const safeLimit = Math.min(Math.max(1, limit), 20);

  const r = await client.query<{
    id: string;
    item_type: string;
    title: string;
    amount: string;
    activity_date: string;
  }>(
    `SELECT id, item_type, title, amount, activity_date::text
     FROM (
       SELECT i.id,
              'Invoice'::text AS item_type,
              ('Invoice #' || COALESCE(i.invoice_number, i.id)) AS title,
              i.amount::numeric AS amount,
              COALESCE(i.issue_date, i.due_date)::date AS activity_date
       FROM invoices i
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
         AND COALESCE(i.issue_date, i.due_date) IS NOT NULL

       UNION ALL

       SELECT t.id,
              CASE WHEN t.type = 'Income' THEN 'Income' ELSE 'Expense' END AS item_type,
              COALESCE(NULLIF(TRIM(t.description), ''), 'Transaction') AS title,
              t.amount::numeric AS amount,
              t.date::date AS activity_date
       FROM transactions t
       WHERE t.tenant_id = $1 AND t.deleted_at IS NULL
         AND t.type IN ('Income', 'Expense')
     ) combined
     ORDER BY activity_date DESC, id DESC
     LIMIT $2`,
    [tenantId, safeLimit]
  );

  const items: DashboardActivityItem[] = r.rows.map((row) => ({
    id: row.id,
    type: row.item_type as DashboardActivityItem['type'],
    title: row.title,
    amount: Number(row.amount),
    date: row.activity_date.slice(0, 10),
  }));

  return {
    items,
    generatedAt: new Date().toISOString(),
  };
}
