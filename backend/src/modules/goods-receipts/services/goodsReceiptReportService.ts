import type pg from 'pg';

export async function getGoodsReceiptReportSummary(client: pg.PoolClient, tenantId: string) {
  const pending = await client.query<{
    po_id: string;
    po_number: string;
    vendor_id: string;
    vendor_name: string;
    project_id: string | null;
    ordered_qty: string;
    received_qty: string;
    remaining_qty: string;
    ordered_value: string;
    received_value: string;
  }>(
    `SELECT po.id AS po_id, po.po_number, po.vendor_id, v.name AS vendor_name, po.project_id,
            COALESCE(SUM(pol.quantity), 0)::text AS ordered_qty,
            COALESCE(SUM(pol.received_qty), 0)::text AS received_qty,
            COALESCE(SUM(GREATEST(pol.quantity - pol.received_qty, 0)), 0)::text AS remaining_qty,
            COALESCE(SUM(pol.line_total), 0)::text AS ordered_value,
            COALESCE(SUM(pol.received_qty * pol.unit_rate), 0)::text AS received_value
     FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id AND v.tenant_id = po.tenant_id
     JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id AND pol.tenant_id = po.tenant_id
     WHERE po.tenant_id = $1 AND po.deleted_at IS NULL
       AND po.status IN ('Approved', 'Partially Billed')
     GROUP BY po.id, po.po_number, po.vendor_id, v.name, po.project_id
     HAVING COALESCE(SUM(GREATEST(pol.quantity - pol.received_qty, 0)), 0) > 0
     ORDER BY po.po_number
     LIMIT 100`,
    [tenantId]
  );

  const poVsReceived = await client.query<{
    po_id: string;
    po_number: string;
    vendor_name: string;
    total_amount: string;
    received_amount: string;
    billed_amount: string;
    receipt_count: string;
  }>(
    `SELECT po.id AS po_id, po.po_number, v.name AS vendor_name,
            po.total_amount::text, po.received_amount::text, po.billed_amount::text,
            (SELECT COUNT(*)::text FROM goods_receipts gr
             WHERE gr.purchase_order_id = po.id AND gr.tenant_id = po.tenant_id
               AND gr.deleted_at IS NULL AND gr.status IN ('Posted', 'Closed')) AS receipt_count
     FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id AND v.tenant_id = po.tenant_id
     WHERE po.tenant_id = $1 AND po.deleted_at IS NULL
       AND po.status NOT IN ('Draft', 'Submitted', 'Cancelled')
     ORDER BY po.issue_date DESC
     LIMIT 100`,
    [tenantId]
  );

  const vendorPerformance = await client.query<{
    vendor_id: string;
    vendor_name: string;
    grn_count: string;
    total_received_value: string;
    avg_days_to_receive: string;
  }>(
    `SELECT gr.vendor_id, v.name AS vendor_name,
            COUNT(*)::text AS grn_count,
            COALESCE(SUM(
              (SELECT COALESCE(SUM(gl.line_total), 0) FROM goods_receipt_lines gl
               WHERE gl.goods_receipt_id = gr.id AND gl.tenant_id = gr.tenant_id)
            ), 0)::text AS total_received_value,
            COALESCE(AVG(
              EXTRACT(EPOCH FROM (gr.posted_at - po.approved_at)) / 86400
            ), 0)::text AS avg_days_to_receive
     FROM goods_receipts gr
     JOIN vendors v ON v.id = gr.vendor_id AND v.tenant_id = gr.tenant_id
     JOIN purchase_orders po ON po.id = gr.purchase_order_id AND po.tenant_id = gr.tenant_id
     WHERE gr.tenant_id = $1 AND gr.deleted_at IS NULL AND gr.status IN ('Posted', 'Closed')
     GROUP BY gr.vendor_id, v.name
     ORDER BY total_received_value DESC
     LIMIT 50`,
    [tenantId]
  );

  const grnByStatus = await client.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count
     FROM goods_receipts
     WHERE tenant_id = $1 AND deleted_at IS NULL
     GROUP BY status`,
    [tenantId]
  );

  return {
    pendingReceipts: pending.rows.map((r) => ({
      purchaseOrderId: r.po_id,
      poNumber: r.po_number,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      projectId: r.project_id,
      orderedQty: Number(r.ordered_qty),
      receivedQty: Number(r.received_qty),
      remainingQty: Number(r.remaining_qty),
      orderedValue: Number(r.ordered_value),
      receivedValue: Number(r.received_value),
    })),
    poVsReceived: poVsReceived.rows.map((r) => ({
      purchaseOrderId: r.po_id,
      poNumber: r.po_number,
      vendorName: r.vendor_name,
      totalAmount: Number(r.total_amount),
      receivedAmount: Number(r.received_amount),
      billedAmount: Number(r.billed_amount),
      receiptCount: Number(r.receipt_count),
      receivePercent:
        Number(r.total_amount) > 0
          ? Math.round((Number(r.received_amount) / Number(r.total_amount)) * 100)
          : 0,
    })),
    vendorPerformance: vendorPerformance.rows.map((r) => ({
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      grnCount: Number(r.grn_count),
      totalReceivedValue: Number(r.total_received_value),
      avgDaysToReceive: Math.round(Number(r.avg_days_to_receive) * 10) / 10,
    })),
    grnByStatus: grnByStatus.rows.map((r) => ({
      status: r.status,
      count: Number(r.count),
    })),
  };
}
