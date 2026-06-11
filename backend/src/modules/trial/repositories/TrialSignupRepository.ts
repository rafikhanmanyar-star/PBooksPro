import type pg from 'pg';

export class TrialSignupRepository {
  async usernameExistsGlobally(client: pg.PoolClient, username: string): Promise<boolean> {
    const r = await client.query(
      `SELECT 1 FROM users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1))`,
      [username]
    );
    return r.rows.length > 0;
  }

  async tenantIdExists(client: pg.PoolClient, tenantId: string): Promise<boolean> {
    const r = await client.query(`SELECT 1 FROM tenants WHERE id = $1`, [tenantId]);
    return r.rows.length > 0;
  }

  async insertTenant(
    client: pg.PoolClient,
    input: {
      tenantId: string;
      company: string;
      email: string;
      mobile: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO tenants (id, name, company_name, email, phone)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.tenantId, input.company, input.company, input.email, input.mobile]
    );
  }

  async insertAdminUser(
    client: pg.PoolClient,
    input: {
      userId: string;
      tenantId: string;
      username: string;
      name: string;
      passwordHash: string;
      email: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO users (id, tenant_id, username, name, role, password_hash, email, is_active, last_tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $2)`,
      [
        input.userId,
        input.tenantId,
        input.username,
        input.name,
        'Admin',
        input.passwordHash,
        input.email,
      ]
    );
  }
}
