-- A5.1.6C pre-cutover: approval engine expects rbac_roles.is_archived (approvalEngine.ts).
-- Migration 133 added archived_at; this adds the boolean flag used at query time.

ALTER TABLE rbac_roles
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE rbac_roles
SET is_archived = TRUE
WHERE archived_at IS NOT NULL OR status = 'archived';

CREATE INDEX IF NOT EXISTS idx_rbac_roles_tenant_is_archived
  ON rbac_roles(tenant_id, is_archived)
  WHERE is_archived IS TRUE;
