import type pg from 'pg';
import type { LegalAcceptanceRow } from '../../../services/legal/legalAcceptanceService.js';

function mapRow(row: pg.QueryResultRow): LegalAcceptanceRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    user_id: row.user_id,
    document_type: row.document_type,
    document_version: row.document_version,
    accepted_at: row.accepted_at,
    ip_address: row.ip_address,
    context: row.context,
  };
}

export class LegalAcceptanceRepository {
  async insert(
    client: pg.PoolClient,
    input: {
      id: string;
      tenantId: string | null;
      userId: string | null;
      documentType: string;
      documentVersion: string;
      ipAddress: string | null;
      context: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO legal_acceptance (
         id, tenant_id, user_id, document_type, document_version, ip_address, context
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.id,
        input.tenantId,
        input.userId,
        input.documentType,
        input.documentVersion,
        input.ipAddress,
        input.context,
      ]
    );
  }

  async listForTenant(
    client: pg.PoolClient,
    tenantId: string,
    limit: number
  ): Promise<LegalAcceptanceRow[]> {
    const r = await client.query(
      `SELECT * FROM legal_acceptance WHERE tenant_id = $1 ORDER BY accepted_at DESC LIMIT $2`,
      [tenantId, limit]
    );
    return r.rows.map(mapRow);
  }

  async hasAcceptedVersion(
    client: pg.PoolClient,
    input: {
      tenantId: string;
      userId: string | null;
      documentType: string;
      documentVersion: string;
    }
  ): Promise<boolean> {
    const r = await client.query(
      `SELECT 1 FROM legal_acceptance
       WHERE tenant_id = $1
         AND document_type = $2
         AND document_version = $3
         AND ($4::text IS NULL OR user_id = $4)
       LIMIT 1`,
      [input.tenantId, input.documentType, input.documentVersion, input.userId]
    );
    return r.rows.length > 0;
  }
}
