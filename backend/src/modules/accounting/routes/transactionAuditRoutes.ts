import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../../../db/pool.js';
import {
  appendTransactionLog,
  listTransactionLogs,
  rowToTransactionLogApi,
} from '../services/transactionLogService.js';
import { requireFinancialWriteRole, requirePermission } from '../../../middleware/rbacMiddleware.js';

export const transactionAuditRouter = Router();

transactionAuditRouter.get('/transaction-audit', requirePermission('audit_logs.read'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const q = req.query;
  const limitRaw = q.limit;
  const offsetRaw = q.offset;
  const limit =
    typeof limitRaw === 'string' && limitRaw !== '' ? Number(limitRaw) : undefined;
  const offset =
    typeof offsetRaw === 'string' && offsetRaw !== '' ? Number(offsetRaw) : undefined;

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const rows = await listTransactionLogs(client, tenantId, {
        startDate: typeof q.startDate === 'string' ? q.startDate : undefined,
        endDate: typeof q.endDate === 'string' ? q.endDate : undefined,
        userId: typeof q.userId === 'string' ? q.userId : undefined,
        transactionId: typeof q.transactionId === 'string' ? q.transactionId : undefined,
        action: typeof q.action === 'string' ? q.action : undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      });
      sendSuccess(res, rows.map((r) => rowToTransactionLogApi(r)));
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

transactionAuditRouter.get('/transaction-audit/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  sendFailure(res, 404, 'NOT_FOUND', 'Not found');
});

transactionAuditRouter.post('/transaction-audit', requireFinancialWriteRole, async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const row = await withTransaction((client) =>
      appendTransactionLog(client, tenantId, req.body as Record<string, unknown>, req.userId ?? null)
    );
    if (!row) {
      sendSuccess(res, { id: (req.body as { id?: string }).id, skipped: true });
      return;
    }
    sendSuccess(res, rowToTransactionLogApi(row), 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});
