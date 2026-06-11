import type pg from 'pg';

export class TenantBackupRepository {
  async tableExists(client: pg.PoolClient, table: string): Promise<boolean> {
    const r = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
      [table]
    );
    return r.rows.length > 0;
  }

  async exportTenantTable(
    client: pg.PoolClient,
    table: string,
    tenantId: string
  ): Promise<unknown[]> {
    if (table === 'payroll_tenant_config') {
      const r = await client.query(`SELECT * FROM payroll_tenant_config WHERE tenant_id = $1`, [
        tenantId,
      ]);
      return r.rows;
    }
    const r = await client.query(`SELECT * FROM ${table} WHERE tenant_id = $1`, [tenantId]);
    return r.rows;
  }

  async getTenantById(
    client: pg.PoolClient,
    tenantId: string
  ): Promise<{ id: string; name: string } | null> {
    const r = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM tenants WHERE id = $1`,
      [tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getFirstTenantId(client: pg.PoolClient): Promise<string | null> {
    const r = await client.query<{ id: string }>(
      `SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1`
    );
    return r.rows[0]?.id ?? null;
  }
}
