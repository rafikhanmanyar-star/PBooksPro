import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ContactRow } from '../services/contactsService.js';

const CONTACT_COLUMNS = `id, tenant_id, name, type, description, contact_no, company_name, address, user_id, version, deleted_at, created_at, updated_at`;
const CONTACT_COLUMNS_ALIASED = `c.id, c.tenant_id, c.name, c.type, c.description, c.contact_no, c.company_name, c.address, c.user_id, c.version, c.deleted_at, c.created_at, c.updated_at`;

export type ContactWriteFields = {
  name: string;
  type: string;
  description: string | null;
  contact_no: string | null;
  company_name: string | null;
  address: string | null;
};

function contactFieldParams(fields: ContactWriteFields): unknown[] {
  return [
    fields.name,
    fields.type,
    fields.description,
    fields.contact_no,
    fields.company_name,
    fields.address,
  ];
}

export class ContactRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<ContactRow | null> {
    const r = await client.query<ContactRow>(
      `SELECT ${CONTACT_COLUMNS}
       FROM contacts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<ContactRow[]> {
    const r = await client.query<ContactRow>(
      `SELECT ${CONTACT_COLUMNS}
       FROM contacts WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  /** Contact balance expression (matches client ContactsPage ledger sign rules). */
  private static readonly CONTACT_BALANCE_SQL = `COALESCE((
    SELECT SUM(
      CASE
        WHEN t.type = 'Income' THEN t.amount
        WHEN t.type = 'Expense' THEN -t.amount
        WHEN t.type = 'Loan' AND t.subtype IN ('Receive Loan', 'Collect Loan') THEN t.amount
        WHEN t.type = 'Loan' AND t.subtype IN ('Give Loan', 'Repay Loan') THEN -t.amount
        ELSE 0
      END
    )
    FROM transactions t
    WHERE t.tenant_id = c.tenant_id AND t.contact_id = c.id AND t.deleted_at IS NULL
  ), 0)`;

  async listPage(
    client: pg.PoolClient,
    opts: {
      limit: number;
      offset: number;
      typeGroup?: string;
      contactId?: string;
      search?: string;
      sortKey?: string;
      sortDir?: 'asc' | 'desc';
    }
  ): Promise<{ rows: ContactRow[]; total: number }> {
    const conditions: string[] = ['c.tenant_id = $1', 'c.deleted_at IS NULL'];
    const params: unknown[] = [this.tenantId];
    let paramIndex = 2;

    if (opts.contactId) {
      conditions.push(`c.id = $${paramIndex++}`);
      params.push(opts.contactId);
    } else {
      const typeGroup = (opts.typeGroup ?? 'all').toLowerCase();
      if (typeGroup === 'owners') {
        conditions.push(`c.type IN ('Owner', 'Client')`);
      } else if (typeGroup === 'tenants') {
        conditions.push(`c.type = 'Tenant'`);
      } else if (typeGroup === 'brokers') {
        conditions.push(`c.type IN ('Broker', 'Dealer')`);
      } else if (typeGroup === 'friends') {
        conditions.push(`c.type = 'Friend & Family'`);
      } else {
        conditions.push(`c.type <> 'Staff'`);
      }
    }

    const search = opts.search?.trim();
    if (search) {
      conditions.push(
        `(c.name ILIKE $${paramIndex} OR c.contact_no ILIKE $${paramIndex} OR c.company_name ILIKE $${paramIndex} OR c.address ILIKE $${paramIndex})`
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const sortColumns: Record<string, string> = {
      name: 'c.name',
      type: 'c.type',
      companyName: 'c.company_name',
      contactNo: 'c.contact_no',
      address: 'c.address',
      balance: ContactRepository.CONTACT_BALANCE_SQL,
    };
    const sortKey = opts.sortKey && sortColumns[opts.sortKey] ? opts.sortKey : 'name';
    const sortExpr = sortColumns[sortKey]!;
    const sortDir = opts.sortDir === 'desc' ? 'DESC' : 'ASC';
    const orderClause = `ORDER BY ${sortExpr} ${sortDir} NULLS LAST, c.name ASC`;

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM contacts c WHERE ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const dataResult = await client.query<ContactRow>(
      `SELECT ${CONTACT_COLUMNS_ALIASED}
       FROM contacts c
       WHERE ${whereClause}
       ${orderClause}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, opts.limit, opts.offset]
    );

    return { rows: dataResult.rows, total };
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<ContactRow[]> {
    const r = await client.query<ContactRow>(
      `SELECT ${CONTACT_COLUMNS}
       FROM contacts WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async insertContact(
    client: pg.PoolClient,
    id: string,
    fields: ContactWriteFields,
    userId: string | null
  ): Promise<ContactRow> {
    const r = await client.query<ContactRow>(
      `INSERT INTO contacts (id, tenant_id, name, type, description, contact_no, company_name, address, user_id, version, deleted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NULL, NOW(), NOW())
       RETURNING ${CONTACT_COLUMNS}`,
      [id, this.tenantId, ...contactFieldParams(fields), userId]
    );
    return r.rows[0]!;
  }

  /** Vendor-directory bridge: same id as vendors row, ON CONFLICT DO NOTHING. */
  async upsertVendorBridgeContact(
    client: pg.PoolClient,
    id: string,
    fields: ContactWriteFields,
    userId: string | null
  ): Promise<void> {
    await client.query(
      `INSERT INTO contacts (id, tenant_id, name, type, description, contact_no, company_name, address, user_id, version, deleted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NULL, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, this.tenantId, ...contactFieldParams(fields), userId]
    );
  }

  async reviveVendorBridgeContact(
    client: pg.PoolClient,
    id: string,
    fields: ContactWriteFields,
    userId: string | null
  ): Promise<string | null> {
    const r = await client.query<{ id: string }>(
      `UPDATE contacts SET
         deleted_at = NULL,
         name = $3,
         type = $4,
         description = COALESCE($5, description),
         contact_no = COALESCE($6, contact_no),
         company_name = COALESCE($7, company_name),
         address = COALESCE($8, address),
         user_id = COALESCE($9, user_id),
         version = version + 1,
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, this.tenantId, ...contactFieldParams(fields), userId]
    );
    return r.rows[0]?.id ?? null;
  }

  async updateActive(client: pg.PoolClient, id: string, fields: ContactWriteFields): Promise<ContactRow | null> {
    const r = await client.query<ContactRow>(
      `UPDATE contacts SET
         name = $3, type = $4, description = $5, contact_no = $6, company_name = $7, address = $8,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${CONTACT_COLUMNS}`,
      [id, this.tenantId, ...contactFieldParams(fields)]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(
    client: pg.PoolClient,
    id: string,
    expectedVersion?: number
  ): Promise<{ ok: boolean; row: ContactRow | null }> {
    const versionClause = expectedVersion !== undefined ? ' AND version = $3' : '';
    const params =
      expectedVersion !== undefined ? [id, this.tenantId, expectedVersion] : [id, this.tenantId];
    const r = await client.query<ContactRow>(
      `UPDATE contacts SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}
       RETURNING ${CONTACT_COLUMNS}`,
      params
    );
    return { ok: (r.rowCount ?? 0) > 0, row: r.rows[0] ?? null };
  }
}
