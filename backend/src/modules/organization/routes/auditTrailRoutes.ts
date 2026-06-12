import { Router } from 'express';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { getPool } from '../../../db/pool.js';
import {
  filterUnifiedAuditRowsForTenant,
  listAuditActions,
  listAuditModules,
  listUnifiedAuditTrail,
} from '../../../services/enterpriseAuditService.js';

export const auditTrailRouter = Router();

auditTrailRouter.get('/audit/events', requirePermission('audit_logs.read'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const q = req.query;
  const limitRaw = q.limit;
  const offsetRaw = q.offset;
  const limit = typeof limitRaw === 'string' && limitRaw !== '' ? Number(limitRaw) : undefined;
  const offset = typeof offsetRaw === 'string' && offsetRaw !== '' ? Number(offsetRaw) : undefined;

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rawRows = await listUnifiedAuditTrail(client, tenantId, {
        userId: typeof q.userId === 'string' ? q.userId : undefined,
        startDate: typeof q.startDate === 'string' ? q.startDate.slice(0, 10) : undefined,
        endDate: typeof q.endDate === 'string' ? q.endDate.slice(0, 10) : undefined,
        module: typeof q.module === 'string' ? q.module : undefined,
        action: typeof q.action === 'string' ? q.action : undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      });
      const rows = filterUnifiedAuditRowsForTenant(rawRows, tenantId);
      if (rows.length !== rawRows.length) {
        const { logger } = await import('../../../utils/logger.js');
        logger.warn('[audit] Dropped cross-tenant audit rows', {
          tenantId,
          rawCount: rawRows.length,
          keptCount: rows.length,
        });
      }
      sendSuccess(res, { items: rows, count: rows.length, tenantId });
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

auditTrailRouter.get('/audit/filters', requirePermission('audit_logs.read'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const [modules, actions] = await Promise.all([
        listAuditModules(client, tenantId),
        listAuditActions(client, tenantId),
      ]);
      sendSuccess(res, { modules, actions });
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});
