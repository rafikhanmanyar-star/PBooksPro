-- System categories for project received assets (in-kind payments & sale). Idempotent.
-- Matches services/database/mandatorySystemCategories.ts and constants/projectAssetSystemCategories.ts

INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, is_hidden, version)
VALUES
  ('sys-cat-rev-asset-in-kind', 'default', 'Revenue - Asset received in kind', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-asset-bs-only', 'default', 'Asset received (balance sheet only)', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-sales-fixed-asset', 'default', 'Sales of fixed asset', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-asset-sale-proceeds', 'default', 'Asset Sale Proceeds', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-cost-asset-sold', 'default', 'Cost of Asset Sold', 'Expense', TRUE, FALSE, FALSE, 1)
ON CONFLICT (id) DO NOTHING;
