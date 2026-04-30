-- Remove co-ownership / property ownership segments after rollback of multi-owner + transfer features.
-- Must run before any code assumes property_ownership is absent.

DROP INDEX IF EXISTS idx_property_ownership_tenant_property_active_dates;

DROP TABLE IF EXISTS property_ownership CASCADE;
