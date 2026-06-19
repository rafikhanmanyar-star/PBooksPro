import type pg from 'pg';

export type VendorProcurementStatRow = {
  vendorId: string;
  vendorName: string;
  poCount: number;
  poValue: number;
  grnCount: number;
  billCount: number;
  openBillBalance: number;
};

export type ProcurementStockAggregationResponse = {
  generatedAt: string;
  purchaseOrders: {
    totalCount: number;
    openCount: number;
    totalValue: number;
    receivedValue: number;
    billedValue: number;
  };
  stockMovements: {
    postedGrnCount: number;
    totalReceivedQty: number;
    totalReceivedValue: number;
  };
  bills: {
    openCount: number;
    openBalance: number;
    totalBilled: number;
  };
  vendorStats: VendorProcurementStatRow[];
};

const OPEN_PO_STATUSES = ['Draft', 'Submitted', 'Approved', 'Partially Billed', 'Partially Received'];

export async function getProcurementStockAggregation(
  client: pg.PoolClient,
  tenantId: string
): Promise<ProcurementStockAggregationResponse> {
  const [poAgg, grnAgg, billAgg, vendorStats] = await Promise.all([
    client.query<{
      total_count: string;
      open_count: string;
      total_value: string;
      received_value: string;
      billed_value: string;
    }>(
      `SELECT
         COUNT(*)::text AS total_count,
         COUNT(*) FILTER (WHERE status = ANY($2::text[]))::text AS open_count,
         COALESCE(SUM(total_amount), 0)::text AS total_value,
         COALESCE(SUM(received_amount), 0)::text AS received_value,
         COALESCE(SUM(billed_amount), 0)::text AS billed_value
       FROM purchase_orders
       WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId, OPEN_PO_STATUSES]
    ),
    client.query<{ posted_count: string; total_qty: string; total_value: string }>(
      `SELECT
         COUNT(DISTINCT gr.id)::text AS posted_count,
         COALESCE(SUM(grl.received_qty), 0)::text AS total_qty,
         COALESCE(SUM(grl.line_total), 0)::text AS total_value
       FROM goods_receipts gr
       INNER JOIN goods_receipt_lines grl
         ON grl.goods_receipt_id = gr.id AND grl.tenant_id = gr.tenant_id
       WHERE gr.tenant_id = $1
         AND gr.deleted_at IS NULL
         AND gr.status = 'Posted'`,
      [tenantId]
    ),
    client.query<{ open_count: string; open_balance: string; total_billed: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('Unpaid', 'Partially Paid'))::text AS open_count,
         COALESCE(SUM(amount - paid_amount) FILTER (WHERE status IN ('Unpaid', 'Partially Paid')), 0)::text AS open_balance,
         COALESCE(SUM(amount), 0)::text AS total_billed
       FROM bills
       WHERE tenant_id = $1 AND deleted_at IS NULL AND vendor_id IS NOT NULL`,
      [tenantId]
    ),
    client.query<{
      vendor_id: string;
      vendor_name: string;
      po_count: string;
      po_value: string;
      grn_count: string;
      bill_count: string;
      open_bill_balance: string;
    }>(
      `SELECT
         v.id AS vendor_id,
         v.name AS vendor_name,
         COALESCE(po_stats.po_count, 0)::text AS po_count,
         COALESCE(po_stats.po_value, 0)::text AS po_value,
         COALESCE(grn_stats.grn_count, 0)::text AS grn_count,
         COALESCE(bill_stats.bill_count, 0)::text AS bill_count,
         COALESCE(bill_stats.open_balance, 0)::text AS open_bill_balance
       FROM vendors v
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS po_count, COALESCE(SUM(total_amount), 0) AS po_value
         FROM purchase_orders po
         WHERE po.vendor_id = v.id AND po.tenant_id = v.tenant_id AND po.deleted_at IS NULL
       ) po_stats ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS grn_count
         FROM goods_receipts gr
         WHERE gr.vendor_id = v.id AND gr.tenant_id = v.tenant_id AND gr.deleted_at IS NULL
       ) grn_stats ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS bill_count,
           COALESCE(SUM(amount - paid_amount) FILTER (
             WHERE status IN ('Unpaid', 'Partially Paid')
           ), 0) AS open_balance
         FROM bills b
         WHERE b.vendor_id = v.id AND b.tenant_id = v.tenant_id AND b.deleted_at IS NULL
       ) bill_stats ON TRUE
       WHERE v.tenant_id = $1 AND v.deleted_at IS NULL
         AND (
           COALESCE(po_stats.po_count, 0) > 0
           OR COALESCE(grn_stats.grn_count, 0) > 0
           OR COALESCE(bill_stats.bill_count, 0) > 0
         )
       ORDER BY COALESCE(po_stats.po_count, 0) DESC, v.name ASC
       LIMIT 25`,
      [tenantId]
    ),
  ]);

  const po = poAgg.rows[0]!;
  const grn = grnAgg.rows[0]!;
  const bills = billAgg.rows[0]!;

  return {
    generatedAt: new Date().toISOString(),
    purchaseOrders: {
      totalCount: Number(po.total_count ?? 0),
      openCount: Number(po.open_count ?? 0),
      totalValue: Number(po.total_value ?? 0),
      receivedValue: Number(po.received_value ?? 0),
      billedValue: Number(po.billed_value ?? 0),
    },
    stockMovements: {
      postedGrnCount: Number(grn.posted_count ?? 0),
      totalReceivedQty: Number(grn.total_qty ?? 0),
      totalReceivedValue: Number(grn.total_value ?? 0),
    },
    bills: {
      openCount: Number(bills.open_count ?? 0),
      openBalance: Number(bills.open_balance ?? 0),
      totalBilled: Number(bills.total_billed ?? 0),
    },
    vendorStats: vendorStats.rows.map((r) => ({
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      poCount: Number(r.po_count ?? 0),
      poValue: Number(r.po_value ?? 0),
      grnCount: Number(r.grn_count ?? 0),
      billCount: Number(r.bill_count ?? 0),
      openBillBalance: Number(r.open_bill_balance ?? 0),
    })),
  };
}
