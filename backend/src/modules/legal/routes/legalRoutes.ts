/**
 * Public legal document APIs.
 */

import { Router } from 'express';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { optionalAuthMiddleware } from '../../../middleware/authMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { getPool } from '../../../db/pool.js';
import {
  getLegalDocumentBySlug,
  getLegalDocumentByType,
  listLegalDocumentsPublic,
  type LegalAcceptanceContext,
} from '../../../constants/legalDocuments.js';
import {
  listAcceptancesForTenant,
  recordLegalAcceptances,
  requireLegalAcceptances,
  clientIp,
} from '../../../services/legal/legalAcceptanceService.js';

export const legalRouter = Router();

function parseContext(raw: unknown): LegalAcceptanceContext | undefined {
  if (raw === 'registration' || raw === 'checkout' || raw === 'general') return raw;
  return undefined;
}

legalRouter.get('/legal/documents', (req, res) => {
  const context = parseContext(req.query.context);
  const items = listLegalDocumentsPublic(context);
  sendSuccess(res, { items, count: items.length, context: context ?? 'all' });
});

legalRouter.get('/legal/documents/:slug', (req, res) => {
  const doc = getLegalDocumentBySlug(req.params.slug);
  if (!doc) {
    sendFailure(res, 404, 'NOT_FOUND', 'Legal document not found.');
    return;
  }
  sendSuccess(res, {
    type: doc.type,
    slug: doc.slug,
    title: doc.title,
    version: doc.version,
    effectiveDate: doc.effectiveDate,
    summary: doc.summary,
    content: doc.content,
    requiredFor: doc.requiredFor,
  });
});

legalRouter.post('/legal/accept', optionalAuthMiddleware, async (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  const context = parseContext(body.context) ?? 'general';
  const acceptances = Array.isArray(body.acceptances) ? body.acceptances : [];

  const normalized = acceptances
    .filter((a: unknown) => a && typeof a === 'object')
    .map((a: { documentType?: string; documentVersion?: string }) => ({
      documentType: typeof a.documentType === 'string' ? a.documentType : '',
      documentVersion: typeof a.documentVersion === 'string' ? a.documentVersion : '',
    }))
    .filter((a: { documentType: string; documentVersion: string }) => a.documentType && a.documentVersion);

  if (normalized.length === 0) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'acceptances array is required.');
    return;
  }

  const tenantId = req.tenantId ?? (typeof body.tenantId === 'string' ? body.tenantId : null);
  const userId = req.userId ?? null;

  if ((context === 'checkout' || context === 'general') && !tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Authentication required to record acceptance.');
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const recorded = await requireLegalAcceptances(client, {
      acceptances: normalized,
      context,
      tenantId,
      userId,
      req,
    });
    sendSuccess(res, { recorded, count: recorded.length }, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'LEGAL_ACCEPTANCE_REQUIRED', msg);
  } finally {
    client.release();
  }
});

legalRouter.get('/legal/acceptances', optionalAuthMiddleware, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    const items = await listAcceptancesForTenant(client, tenantId);
    sendSuccess(res, { items, count: items.length });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /legal/acceptances' });
  } finally {
    client.release();
  }
});

export { getLegalDocumentByType, recordLegalAcceptances, requireLegalAcceptances, clientIp };
