-- Fix: system income/expense categories were seeded with tenant_id = 'default' in migration 012.
-- The listCategories query filters WHERE tenant_id = $tenant OR tenant_id = '__system__', so
-- categories under 'default' are invisible to every tenant other than 'default'.
-- This migration re-homes them to '__system__' so all tenants can see them.

INSERT INTO tenants (id, name) VALUES ('__system__', 'Shared system chart') ON CONFLICT (id) DO NOTHING;

UPDATE categories
SET tenant_id = '__system__', updated_at = NOW()
WHERE tenant_id = 'default'
  AND id LIKE 'sys-cat-%'
  AND deleted_at IS NULL;
