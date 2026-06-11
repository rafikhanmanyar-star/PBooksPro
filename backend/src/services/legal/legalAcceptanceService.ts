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
import { LegalAcceptanceRepository } from '../../modules/legal/repositories/LegalAcceptanceRepository.js';

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

const legalRepo = new LegalAcceptanceRepository();

function clientIp(req?: Request): string | null {
  if (!req) return null;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  return req.ip ?? null;
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
    await legalRepo.insert(client, {
      id,
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      documentType: a.documentType,
      documentVersion: a.documentVersion,
      ipAddress: input.ipAddress ?? null,
      context: input.context,
    });

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
  return legalRepo.listForTenant(client, tenantId, limit);
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

  return legalRepo.hasAcceptedVersion(client, {
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    documentType: input.documentType,
    documentVersion: doc.version,
  });
}

export { validateAcceptancePayload, clientIp };
