-- Sprint 3: Purchase Order full lifecycle (Draft → Submitted → Approved → Billed → Cancelled)

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

UPDATE purchase_orders SET status = CASE status
  WHEN 'DRAFT' THEN 'Draft'
  WHEN 'SENT' THEN 'Submitted'
  WHEN 'RECEIVED' THEN 'Approved'
  WHEN 'INVOICED' THEN 'Partially Billed'
  WHEN 'DELIVERED' THEN 'Partially Billed'
  WHEN 'COMPLETED' THEN 'Fully Billed'
  ELSE status
END
WHERE status IN ('DRAFT', 'SENT', 'RECEIVED', 'INVOICED', 'DELIVERED', 'COMPLETED');

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS department_id TEXT REFERENCES payroll_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issue_date DATE,
  ADD COLUMN IF NOT EXISTS required_date DATE,
  ADD COLUMN IF NOT EXISTS billed_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

UPDATE purchase_orders SET issue_date = created_at::date WHERE issue_date IS NULL;

ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Partially Billed', 'Fully Billed', 'Cancelled'));

CREATE INDEX IF NOT EXISTS idx_po_tenant_status
  ON purchase_orders(tenant_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_po_tenant_project
  ON purchase_orders(tenant_id, project_id)
  WHERE deleted_at IS NULL AND project_id IS NOT NULL;

-- Normalized PO line items for reporting
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id TEXT,
  item_name VARCHAR(255),
  description TEXT,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
  unit_rate NUMERIC(18, 2) NOT NULL DEFAULT 0,
  tax_percent NUMERIC(8, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pol_po
  ON purchase_order_lines(purchase_order_id, sort_order);

-- Link vendor bills to purchase orders
ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS purchase_order_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bills_purchase_order
  ON bills(tenant_id, purchase_order_id)
  WHERE deleted_at IS NULL AND purchase_order_id IS NOT NULL;

COMMENT ON TABLE purchase_order_lines IS 'Normalized PO line items synced from purchase_orders.items JSONB.';
COMMENT ON COLUMN bills.purchase_order_id IS 'Vendor bill raised against an approved purchase order.';
