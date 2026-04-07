-- System categories for sales returns (refund revenue reduction, penalty). Idempotent.
-- Matches services/database/mandatorySystemCategories.ts and constants/salesReturnSystemCategories.ts

INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, is_hidden, version)
VALUES
  ('sys-cat-sales-return-refund', 'default', 'Sales Return Refund (revenue reduction)', 'Income', TRUE, FALSE, FALSE, 1),
  ('sys-cat-sales-return-penalty', 'default', 'Sales Return Penalty', 'Income', TRUE, FALSE, FALSE, 1)
ON CONFLICT (id) DO NOTHING;
