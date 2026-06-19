-- PERF-A3.6 — trigram GIN indexes for procurement & stock movement server-side search.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Bills
CREATE INDEX IF NOT EXISTS idx_bills_search_number_trgm
  ON bills USING gin (bill_number gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bills_search_desc_trgm
  ON bills USING gin (description gin_trgm_ops)
  WHERE deleted_at IS NULL AND description IS NOT NULL;

-- Purchase orders (PO number search)
CREATE INDEX IF NOT EXISTS idx_purchase_orders_search_po_number_trgm
  ON purchase_orders USING gin (po_number gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_search_desc_trgm
  ON purchase_orders USING gin (description gin_trgm_ops)
  WHERE deleted_at IS NULL AND description IS NOT NULL;

-- PO line items (SKU / item name proxy)
CREATE INDEX IF NOT EXISTS idx_pol_search_item_name_trgm
  ON purchase_order_lines USING gin (item_name gin_trgm_ops)
  WHERE item_name IS NOT NULL;

-- Goods receipts (stock movements)
CREATE INDEX IF NOT EXISTS idx_goods_receipts_search_grn_trgm
  ON goods_receipts USING gin (grn_number gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_grl_search_item_name_trgm
  ON goods_receipt_lines USING gin (item_name gin_trgm_ops)
  WHERE item_name IS NOT NULL;

-- Vendor quotations
CREATE INDEX IF NOT EXISTS idx_quotations_search_name_trgm
  ON quotations USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_search_number_trgm
  ON quotations USING gin (quotation_number gin_trgm_ops)
  WHERE deleted_at IS NULL AND quotation_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotation_items_search_item_trgm
  ON quotation_items USING gin (item_name gin_trgm_ops)
  WHERE item_name IS NOT NULL;
