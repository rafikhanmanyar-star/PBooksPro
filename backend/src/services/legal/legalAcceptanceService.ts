/**
 * Legal document acceptance recording and queries.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Request } from 'express';
import {
  getLegalDocumentByType,
  validateAcceptancePayload,
  type LegalAcceptanceContext,
  type LegalDocumentType,
} from '../../constants/legalDocuments.js';

export type LegalAcceptanceRow = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  document_type: string;
  document_version: string;
  accepted_at: string;
  ip_address: string | null;
  context: string;
};

export type AcceptanceInput = {
  documentType: string;
  documentVersion: string;
};

function clientIp(req?: Request): string | null {
  if (!req) return null;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  return req.ip ?? null;
}

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

export async function recordLegalAcceptances(
  client: pg.PoolClient,
  input: {
    tenantId?: string | null;
    userId?: string | null;
    acceptances: AcceptanceInput[];
    context: LegalAcceptanceContext;
    ipAddress?: string | null;
  }
): Promise<LegalAcceptanceRow[]> {
  const rows: LegalAcceptanceRow[] = [];

  for (const a of input.acceptances) {
    const doc = getLegalDocumentByType(a.documentType);
    if (!doc) {
      throw new Error(`Unknown legal document type: ${a.documentType}`);
    }
    if (doc.version !== a.documentVersion) {
      throw new Error(
        `Document version mismatch for ${a.documentType}. Expected ${doc.version}.`
      );
    }

    const id = randomUUID();
    await client.query(
      `INSERT INTO legal_acceptance (
         id, tenant_id, user_id, document_type, document_version, ip_address, context
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        input.tenantId ?? null,
        input.userId ?? null,
        a.documentType,
        a.documentVersion,
        input.ipAddress ?? null,
        input.context,
      ]
    );

    rows.push({
      id,
      tenant_id: input.tenantId ?? null,
      user_id: input.userId ?? null,
      document_type: a.documentType,
      document_version: a.documentVersion,
      accepted_at: new Date().toISOString(),
      ip_address: input.ipAddress ?? null,
      context: input.context,
    });
  }

  return rows;
}

export async function requireLegalAcceptances(
  client: pg.PoolClient,
  input: {
    acceptances: AcceptanceInput[];
    context: LegalAcceptanceContext;
    tenantId?: string | null;
    userId?: string | null;
    req?: Request;
  }
): Promise<LegalAcceptanceRow[]> {
  const check = validateAcceptancePayload(input.acceptances, input.context);
  if (!check.valid) {
    const parts: string[] = [];
    if (check.missing.length) parts.push(`Missing: ${check.missing.join(', ')}`);
    if (check.invalid.length) parts.push(`Invalid version: ${check.invalid.join(', ')}`);
    throw new Error(`Legal acceptance required. ${parts.join('. ')}`);
  }

  return recordLegalAcceptances(client, {
    tenantId: input.tenantId,
    userId: input.userId,
    acceptances: input.acceptances,
    context: input.context,
    ipAddress: clientIp(input.req),
  });
}

export async function listAcceptancesForTenant(
  client: pg.PoolClient,
  tenantId: string,
  limit = 50
): Promise<LegalAcceptanceRow[]> {
  const { rows } = await client.query(
    `SELECT * FROM legal_acceptance WHERE tenant_id = $1 ORDER BY accepted_at DESC LIMIT $2`,
    [tenantId, limit]
  );
  return rows.map(mapRow);
}

export async function hasAcceptedCurrentVersion(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    userId?: string | null;
    documentType: LegalDocumentType;
  }
): Promise<boolean> {
  const doc = getLegalDocumentByType(input.documentType);
  if (!doc) return false;

  const { rows } = await client.query(
    `SELECT 1 FROM legal_acceptance
     WHERE tenant_id = $1
       AND document_type = $2
       AND document_version = $3
       AND ($4::text IS NULL OR user_id = $4)
     LIMIT 1`,
    [input.tenantId, input.documentType, doc.version, input.userId ?? null]
  );
  return rows.length > 0;
}

export { validateAcceptancePayload, clientIp };
