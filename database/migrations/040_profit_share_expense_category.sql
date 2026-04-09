-- Canonical expense category for investor profit-distribution clearing legs (paired with equity TRANSFER credits).
-- Matches services/database/mandatorySystemCategories.ts (sys-cat-profit-share).

INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, is_hidden, version)
VALUES ('sys-cat-profit-share', '__system__', 'Profit Share', 'Expense', TRUE, FALSE, FALSE, 1)
ON CONFLICT (id) DO NOTHING;
