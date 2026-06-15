-- Sprint 5: Goods Receipt (GRN) module

ALTER TABLE purchase_order_lines
  ADD COLUMN IF NOT EXISTS received_qty NUMERIC(18, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billed_qty NUMERIC(18, 3) NOT NULL DEFAULT 0;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS received_amount NUMERIC(18, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS goods_receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  grn_number VARCHAR(64) NOT NULL,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  received_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  notes TEXT,
  posted_at TIMESTAMPTZ,
  posted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT goods_receipts_status_check CHECK (status IN ('Draft', 'Posted', 'Closed')),
  CONSTRAINT goods_receipts_tenant_grn_unique UNIQUE (tenant_id, grn_number)
);

CREATE INDEX IF NOT EXISTS idx_grn_tenant_status
  ON goods_receipts (tenant_id, status, received_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_grn_tenant_po
  ON goods_receipts (tenant_id, purchase_order_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_grn_tenant_vendor
  ON goods_receipts (tenant_id, vendor_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS goods_receipt_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  goods_receipt_id TEXT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id TEXT REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
  item_id TEXT,
  item_name VARCHAR(255),
  description TEXT,
  ordered_qty NUMERIC(18, 3) NOT NULL DEFAULT 0,
  received_qty NUMERIC(18, 3) NOT NULL DEFAULT 0,
  unit_rate NUMERIC(18, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grl_grn
  ON goods_receipt_lines (goods_receipt_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_grl_po_line
  ON goods_receipt_lines (tenant_id, purchase_order_line_id);

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS goods_receipt_id TEXT REFERENCES goods_receipts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bills_goods_receipt
  ON bills (tenant_id, goods_receipt_id)
  WHERE deleted_at IS NULL AND goods_receipt_id IS NOT NULL;

COMMENT ON TABLE goods_receipts IS 'Goods receipt notes (GRN) against approved purchase orders.';
COMMENT ON COLUMN purchase_order_lines.received_qty IS 'Cumulative quantity received via posted GRNs.';
COMMENT ON COLUMN purchase_orders.received_amount IS 'Cumulative value received via posted GRNs.';
