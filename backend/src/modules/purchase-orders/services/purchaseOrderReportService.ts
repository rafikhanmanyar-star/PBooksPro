import type pg from 'pg';

export async function getPurchaseOrderReportSummary(client: pg.PoolClient, tenantId: string) {
  const r = await client.query<{
    status: string;
    count: string;
    total_amount: string;
    billed_amount: string;
  }>(
    `SELECT status,
            COUNT(*)::text AS count,
            COALESCE(SUM(total_amount), 0)::text AS total_amount,
            COALESCE(SUM(billed_amount), 0)::text AS billed_amount
     FROM purchase_orders
     WHERE tenant_id = $1 AND deleted_at IS NULL
     GROUP BY status
     ORDER BY status`,
    [tenantId]
  );

  const byStatus = r.rows.map((row) => ({
    status: row.status,
    count: Number(row.count),
    totalAmount: Number(row.total_amount),
    billedAmount: Number(row.billed_amount),
    openAmount: Math.max(0, Number(row.total_amount) - Number(row.billed_amount)),
  }));

  const totals = byStatus.reduce(
    (acc, row) => ({
      count: acc.count + row.count,
      totalAmount: acc.totalAmount + row.totalAmount,
      billedAmount: acc.billedAmount + row.billedAmount,
      openAmount: acc.openAmount + row.openAmount,
    }),
    { count: 0, totalAmount: 0, billedAmount: 0, openAmount: 0 }
  );

  const openPos = await client.query<{
    id: string;
    po_number: string;
    vendor_id: string;
    vendor_name: string;
    status: string;
    total_amount: string;
    billed_amount: string;
    issue_date: Date;
  }>(
    `SELECT po.id, po.po_number, po.vendor_id, v.name AS vendor_name, po.status,
            po.total_amount::text, po.billed_amount::text, po.issue_date
     FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id AND v.tenant_id = po.tenant_id
     WHERE po.tenant_id = $1 AND po.deleted_at IS NULL
       AND po.status IN ('Approved', 'Partially Billed', 'Submitted')
     ORDER BY po.issue_date DESC
     LIMIT 50`,
    [tenantId]
  );

  return {
    byStatus,
    totals,
    openPurchaseOrders: openPos.rows.map((row) => ({
      id: row.id,
      poNumber: row.po_number,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      status: row.status,
      totalAmount: Number(row.total_amount),
      billedAmount: Number(row.billed_amount),
      remainingAmount: Math.max(0, Number(row.total_amount) - Number(row.billed_amount)),
      issueDate: row.issue_date,
    })),
  };
}
