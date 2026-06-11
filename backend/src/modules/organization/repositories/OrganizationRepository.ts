import type pg from 'pg';
import type { PoolClient } from 'pg';
import type { OrganizationStatus } from '../../../constants/organizationStatus.js';

export class OrganizationRepository {
  async nextRegistrationReference(client: PoolClient): Promise<string> {
    const r = await client.query<{ n: string }>(
      `SELECT nextval('tenant_registration_ref_seq')::text AS n`
    );
    return r.rows[0]?.n ?? '1';
  }

  async getTenantStatus(
    client: PoolClient,
    tenantId: string
  ): Promise<{ status: string; rejection_reason: string | null } | null> {
    const r = await client.query<{ status: string; rejection_reason: string | null }>(
      `SELECT status, rejection_reason FROM tenants WHERE id = $1`,
      [tenantId]
    );
    return r.rows[0] ?? null;
  }

  async invalidateTenantSessions(client: PoolClient, tenantId: string): Promise<void> {
    try {
      await client.query('SAVEPOINT sp_invalidate_tenant_sessions');
      await client.query(`DELETE FROM user_sessions WHERE tenant_id = $1`, [tenantId]);
      await client.query('RELEASE SAVEPOINT sp_invalidate_tenant_sessions');
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT sp_invalidate_tenant_sessions');
    }
  }

  async countOrganizationRequests(
    client: PoolClient,
    where: string,
    params: unknown[]
  ): Promise<number> {
    const countR = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM tenants t ${where}`,
      params
    );
    return Number(countR.rows[0]?.count ?? 0);
  }

  async listOrganizationRequests(
    client: PoolClient,
    where: string,
    params: unknown[]
  ): Promise<
    Array<{
      id: string;
      name: string;
      company_name: string | null;
      email: string | null;
      phone: string | null;
      country: string | null;
      status: string;
      registration_reference: string | null;
      created_at: Date;
      owner_name: string | null;
      owner_email: string | null;
    }>
  > {
    const listR = await client.query(
      `SELECT t.id, t.name, t.company_name, t.email, t.phone, t.country, t.status,
              t.registration_reference, t.created_at,
              u.name AS owner_name, u.email AS owner_email
       FROM tenants t
       LEFT JOIN LATERAL (
         SELECT name, email FROM users
         WHERE tenant_id = t.id AND role IN ('Admin', 'admin', 'SUPER_ADMIN', 'super_admin')
         ORDER BY created_at ASC
         LIMIT 1
       ) u ON TRUE
       ${where}
       ORDER BY t.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return listR.rows as Array<{
      id: string;
      name: string;
      company_name: string | null;
      email: string | null;
      phone: string | null;
      country: string | null;
      status: string;
      registration_reference: string | null;
      created_at: Date;
      owner_name: string | null;
      owner_email: string | null;
    }>;
  }

  async getOrganizationDetail(client: PoolClient, tenantId: string): Promise<pg.QueryResultRow | null> {
    const r = await client.query(
      `SELECT t.id, t.name, t.company_name, t.email, t.phone, t.country, t.address, t.status,
              t.registration_reference, t.created_at, t.approved_at, t.approved_by,
              t.rejected_at, t.rejected_by, t.rejection_reason,
              u.name AS owner_name, u.email AS owner_email
       FROM tenants t
       LEFT JOIN LATERAL (
         SELECT name, email FROM users
         WHERE tenant_id = t.id AND role IN ('Admin', 'admin', 'SUPER_ADMIN', 'super_admin')
         ORDER BY created_at ASC
         LIMIT 1
       ) u ON TRUE
       WHERE t.id = $1`,
      [tenantId]
    );
    return r.rows[0] ?? null;
  }

  async approve(client: PoolClient, tenantId: string, adminUserId: string): Promise<void> {
    await client.query(
      `UPDATE tenants
       SET status = 'ACTIVE',
           approved_by = $2,
           approved_at = NOW(),
           rejected_by = NULL,
           rejected_at = NULL,
           rejection_reason = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [tenantId, adminUserId]
    );
  }

  async reject(
    client: PoolClient,
    tenantId: string,
    adminUserId: string,
    reason: string
  ): Promise<void> {
    await client.query(
      `UPDATE tenants
       SET status = 'REJECTED',
           rejected_by = $2,
           rejected_at = NOW(),
           rejection_reason = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [tenantId, adminUserId, reason]
    );
  }

  async suspend(client: PoolClient, tenantId: string): Promise<void> {
    await client.query(`UPDATE tenants SET status = 'SUSPENDED', updated_at = NOW() WHERE id = $1`, [
      tenantId,
    ]);
  }

  async activate(client: PoolClient, tenantId: string, adminUserId: string): Promise<void> {
    await client.query(
      `UPDATE tenants
       SET status = 'ACTIVE',
           approved_by = COALESCE(approved_by, $2),
           approved_at = COALESCE(approved_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [tenantId, adminUserId]
    );
  }

  async countTenantsByStatus(client: PoolClient, status: string): Promise<number> {
    const r = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM tenants WHERE status = $1`,
      [status]
    );
    return Number(r.rows[0]?.count ?? 0);
  }

  async insertPendingOrganization(
    client: PoolClient,
    input: {
      tenantId: string;
      companyName: string;
      email: string;
      phone: string | null;
      address: string | null;
      country: string | null;
      status: OrganizationStatus;
      registrationReference: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO tenants (
         id, name, company_name, email, phone, address, country, status, registration_reference
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.tenantId,
        input.companyName,
        input.companyName,
        input.email,
        input.phone,
        input.address,
        input.country,
        input.status,
        input.registrationReference,
      ]
    );
  }
}
