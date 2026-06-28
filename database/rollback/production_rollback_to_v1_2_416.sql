-- Production schema rollback helper — align PostgreSQL with app v1.2.416
-- Target: undo migrations applied after v1.2.416 while production was on v1.2.417–v1.2.437
--
-- ⚠️  DESTRUCTIVE — take a Render Postgres backup/snapshot BEFORE running.
-- ⚠️  Run once against production DATABASE_URL only after backup verified.
-- ⚠️  Does NOT restore business data deleted after backup date (use Render PITR if needed).
--
-- Migrations reversed (schema_migrations rows removed):
--   138_rbac_roles_is_archived.sql
--   137_rbac_approval_matrix_seed.sql  (data only; tables dropped in 136 reverse)
--   136_rbac_approval_matrix.sql
--   135_rbac_data_scopes.sql
--   134_break_glass_sessions.sql
--   133_rbac_v2_role_management.sql
-- Indexes from 131/132 are optional to drop (harmless if left); included at bottom.
--
-- After run: set all RBAC_V2_* and VITE_RBAC_V2_* env vars to false on Render (see doc in chat).

BEGIN;

-- ── 138: is_archived on rbac_roles ─────────────────────────────────────────
DROP INDEX IF EXISTS idx_rbac_roles_tenant_is_archived;
ALTER TABLE rbac_roles DROP COLUMN IF EXISTS is_archived;

-- ── 136 + 137: approval matrix (137 is seed data in these tables) ───────────
DROP TABLE IF EXISTS rbac_journal_approval_drafts CASCADE;
DROP TABLE IF EXISTS rbac_approval_assignments CASCADE;
DROP TABLE IF EXISTS rbac_approval_rules CASCADE;
DROP TABLE IF EXISTS rbac_approval_capabilities CASCADE;
DROP TABLE IF EXISTS rbac_approval_matrix CASCADE;

-- ── 135: data scopes ───────────────────────────────────────────────────────
DROP TABLE IF EXISTS rbac_user_data_scopes CASCADE;
DROP TABLE IF EXISTS rbac_role_data_scopes CASCADE;

-- ── 134: break-glass ───────────────────────────────────────────────────────
DROP TABLE IF EXISTS break_glass_sessions CASCADE;
DROP TABLE IF EXISTS platform_break_glass_capabilities CASCADE;

-- ── 133: RBAC v2 role management extensions ────────────────────────────────
DROP TABLE IF EXISTS rbac_audit_log CASCADE;
DROP TABLE IF EXISTS rbac_role_templates CASCADE;

DROP INDEX IF EXISTS idx_rbac_user_roles_active;
ALTER TABLE rbac_user_roles DROP COLUMN IF EXISTS expires_at;
ALTER TABLE rbac_user_roles DROP COLUMN IF EXISTS is_active;

ALTER TABLE tenants DROP COLUMN IF EXISTS rbac_global_version;
ALTER TABLE users DROP COLUMN IF EXISTS access_version;

DROP INDEX IF EXISTS idx_rbac_roles_tenant_archived;
ALTER TABLE rbac_roles DROP COLUMN IF EXISTS template_id;
ALTER TABLE rbac_roles DROP COLUMN IF EXISTS role_version_hash;
ALTER TABLE rbac_roles DROP COLUMN IF EXISTS archived_at;
ALTER TABLE rbac_roles DROP COLUMN IF EXISTS role_type;

-- Normalize archived roles before restoring v1 constraint
UPDATE rbac_roles SET status = 'inactive' WHERE status = 'archived';

ALTER TABLE rbac_roles DROP CONSTRAINT IF EXISTS rbac_roles_status_check;
ALTER TABLE rbac_roles ADD CONSTRAINT rbac_roles_status_check
  CHECK (status IN ('active', 'inactive'));

-- ── schema_migrations bookkeeping ───────────────────────────────────────────
DELETE FROM schema_migrations WHERE filename IN (
  '138_rbac_roles_is_archived.sql',
  '137_rbac_approval_matrix_seed.sql',
  '136_rbac_approval_matrix.sql',
  '135_rbac_data_scopes.sql',
  '134_break_glass_sessions.sql',
  '133_rbac_v2_role_management.sql',
  '132_procurement_entity_search_trigram_indexes.sql',
  '131_entity_search_trigram_indexes.sql'
);

-- ── Optional: drop perf indexes from 131/132 (safe to skip) ─────────────────
DROP INDEX IF EXISTS idx_contacts_search_name_trgm;
DROP INDEX IF EXISTS idx_contacts_search_company_trgm;
DROP INDEX IF EXISTS idx_vendors_search_name_trgm;
DROP INDEX IF EXISTS idx_vendors_search_company_trgm;
DROP INDEX IF EXISTS idx_transactions_search_desc_trgm;
DROP INDEX IF EXISTS idx_transactions_search_ref_trgm;
DROP INDEX IF EXISTS idx_payroll_employees_search_name_trgm;
DROP INDEX IF EXISTS idx_payroll_employees_search_code_trgm;
DROP INDEX IF EXISTS idx_properties_search_name_trgm;
DROP INDEX IF EXISTS idx_units_search_number_trgm;
DROP INDEX IF EXISTS idx_units_search_desc_trgm;
DROP INDEX IF EXISTS idx_invoices_search_number_trgm;
DROP INDEX IF EXISTS idx_bills_search_number_trgm;
DROP INDEX IF EXISTS idx_bills_search_desc_trgm;
DROP INDEX IF EXISTS idx_purchase_orders_search_po_number_trgm;
DROP INDEX IF EXISTS idx_purchase_orders_search_desc_trgm;
DROP INDEX IF EXISTS idx_pol_search_item_name_trgm;
DROP INDEX IF EXISTS idx_goods_receipts_search_grn_trgm;
DROP INDEX IF EXISTS idx_grl_search_item_name_trgm;
DROP INDEX IF EXISTS idx_quotations_search_name_trgm;
DROP INDEX IF EXISTS idx_quotations_search_number_trgm;
DROP INDEX IF EXISTS idx_quotation_items_search_item_trgm;

COMMIT;

-- Verify: highest applied migration should end at 131_rbac_enhancement.sql / 131_fix_empty_goods_receipt_ids.sql
-- SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 10;
