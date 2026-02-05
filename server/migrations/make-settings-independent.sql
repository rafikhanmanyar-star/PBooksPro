-- Migration to make app_settings tenant-independent
ALTER TABLE app_settings ALTER COLUMN tenant_id DROP NOT NULL;

-- Already handled in previous DO block if I included it, but for safety:
DROP POLICY IF EXISTS tenant_isolation ON app_settings;
CREATE POLICY tenant_isolation ON app_settings FOR ALL USING (tenant_id = get_current_tenant_id() OR tenant_id IS NULL) WITH CHECK (tenant_id = get_current_tenant_id() OR tenant_id IS NULL);
