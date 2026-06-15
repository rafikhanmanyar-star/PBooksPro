-- Line-level PO billing: bill allocations per purchase order line

CREATE TABLE IF NOT EXISTS bill_po_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  purchase_order_line_id TEXT NOT NULL REFERENCES purchase_order_lines(id) ON DELETE RESTRICT,
  goods_receipt_line_id TEXT REFERENCES goods_receipt_lines(id) ON DELETE SET NULL,
  billed_qty NUMERIC(18, 3) NOT NULL DEFAULT 0,
  unit_rate NUMERIC(18, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bill_po_lines_bill
  ON bill_po_lines (tenant_id, bill_id);

CREATE INDEX IF NOT EXISTS idx_bill_po_lines_po_line
  ON bill_po_lines (tenant_id, purchase_order_line_id);

COMMENT ON TABLE bill_po_lines IS 'Bill line allocations against purchase order lines (drives purchase_order_lines.billed_qty).';
COMMENT ON COLUMN purchase_order_lines.billed_qty IS 'Cumulative quantity billed via approved bills (recalculated from bill_po_lines).';
