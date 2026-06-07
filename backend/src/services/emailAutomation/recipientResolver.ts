import type pg from 'pg';

export type AutomationRecipient = {
  email: string;
  name: string | null;
  tenantName: string | null;
};

/** Primary billing contact: first Admin with email, else any user with email. */
export async function resolveTenantRecipient(
  client: pg.PoolClient,
  tenantId: string
): Promise<AutomationRecipient | null> {
  const { rows } = await client.query<{ email: string; name: string; role: string }>(
    `SELECT email, name, role FROM users
     WHERE tenant_id = $1 AND is_active = TRUE AND email IS NOT NULL AND TRIM(email) <> ''
     ORDER BY CASE WHEN role = 'Admin' THEN 0 WHEN role = 'super_admin' THEN 0 ELSE 1 END, created_at ASC
     LIMIT 1`,
    [tenantId]
  );
  const user = rows[0];
  if (!user?.email) return null;

  const tenantRow = await client.query<{ name: string }>(
    `SELECT name FROM tenants WHERE id = $1`,
    [tenantId]
  );

  return {
    email: user.email.trim().toLowerCase(),
    name: user.name?.trim() || null,
    tenantName: tenantRow.rows[0]?.name?.trim() || null,
  };
}
