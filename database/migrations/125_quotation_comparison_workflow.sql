-- Sprint 2: Quotation comparison workflow, vendor selection, and purchase orders

CREATE TABLE IF NOT EXISTS quotation_comparison_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title VARCHAR(255),
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
  package_name VARCHAR(255),
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  item_name VARCHAR(255),
  preferred_quotation_id TEXT REFERENCES quotations(id) ON DELETE SET NULL,
  approved_quotation_id TEXT REFERENCES quotations(id) ON DELETE SET NULL,
  purchase_order_id TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'comparing'
    CHECK (status IN ('comparing', 'preferred', 'approved', 'converted')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qcs_tenant_status
  ON quotation_comparison_sessions(tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS quotation_comparison_session_quotations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES quotation_comparison_sessions(id) ON DELETE CASCADE,
  quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  recommendation_score NUMERIC(5, 2),
  recommendation_rank INTEGER,
  is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(session_id, quotation_id)
);

CREATE INDEX IF NOT EXISTS idx_qcsq_session
  ON quotation_comparison_session_quotations(session_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  po_number VARCHAR(100) NOT NULL,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  quotation_id TEXT REFERENCES quotations(id) ON DELETE SET NULL,
  comparison_session_id TEXT REFERENCES quotation_comparison_sessions(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
  total_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SENT', 'RECEIVED', 'INVOICED', 'DELIVERED', 'COMPLETED')),
  items JSONB NOT NULL DEFAULT '[]',
  payment_terms TEXT,
  delivery_period VARCHAR(100),
  warranty_period VARCHAR(100),
  description TEXT,
  target_delivery_date DATE,
  currency VARCHAR(10) DEFAULT 'PKR',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, po_number)
);

ALTER TABLE quotation_comparison_sessions
  DROP CONSTRAINT IF EXISTS fk_qcs_purchase_order;
ALTER TABLE quotation_comparison_sessions
  ADD CONSTRAINT fk_qcs_purchase_order
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_po_tenant_vendor
  ON purchase_orders(tenant_id, vendor_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_po_tenant_quotation
  ON purchase_orders(tenant_id, quotation_id)
  WHERE deleted_at IS NULL AND quotation_id IS NOT NULL;

COMMENT ON TABLE quotation_comparison_sessions IS 'Grouped vendor quotation comparison and selection workflow.';
COMMENT ON TABLE purchase_orders IS 'Purchase orders created from approved vendor quotations.';
