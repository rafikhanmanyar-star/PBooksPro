import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { requireOrgUserAdmin } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import {
  acquireLock,
  forceLock,
  getActiveLock,
  parseRecordType,
  refreshLock,
  releaseLock,
  logLockForceTakeover,
  type RecordLockType,
} from '../services/recordLocksService.js';
import { emitLockEvent } from '../core/realtime.js';

export const locksRouter = Router();

type Res = import('express').Response;

function parseBody(req: { body?: unknown }): { recordType: RecordLockType; recordId: string } | null {
  const b = req.body as Record<string, unknown> | undefined;
  const recordType = parseRecordType(b?.recordType ?? b?.record_type);
  const recordId = typeof b?.recordId === 'string' ? b.recordId.trim() : typeof b?.record_id === 'string' ? b.record_id.trim() : '';
  if (!recordType || !recordId) return null;
  return { recordType, recordId };
}

locksRouter.post('/locks/acquire', async (req: AuthedRequest, res: Res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = parseBody(req);
  if (!parsed) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'recordType and recordId are required');
    return;
  }
  try {
    const result = await withTransaction((client) => acquireLock(client, tenantId, userId, parsed.recordType, parsed.recordId));
    if (result.locked) {
      sendSuccess(res, {
        locked: true,
        lockedBy: result.lockedBy,
        lockedByUserId: result.lockedByUserId,
      });
      return;
    }
    emitLockEvent(tenantId, 'lock_acquired', {
      recordType: parsed.recordType,
      recordId: parsed.recordId,
      lockedBy: result.lockedBy,
      lockedByUserId: userId,
      expiresAt: result.expiresAt,
    });
    sendSuccess(res, { locked: false, expiresAt: result.expiresAt });
  } catch (e) {
    handleRouteError(res, e);
  }
});

locksRouter.post('/locks/release', async (req: AuthedRequest, res: Res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = parseBody(req);
  if (!parsed) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'recordType and recordId are required');
    return;
  }
  try {
    const released = await withTransaction((client) =>
      releaseLock(client, tenantId, userId, parsed.recordType, parsed.recordId)
    );
    if (released) {
      emitLockEvent(tenantId, 'lock_released', {
        recordType: parsed.recordType,
        recordId: parsed.recordId,
        lockedByUserId: userId,
      });
    }
    sendSuccess(res, { released });
  } catch (e) {
    handleRouteError(res, e);
  }
});

locksRouter.post('/locks/refresh', async (req: AuthedRequest, res: Res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = parseBody(req);
  if (!parsed) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'recordType and recordId are required');
    return;
  }
  try {
    const result = await withTransaction((client) => refreshLock(client, tenantId, userId, parsed.recordType, parsed.recordId));
    if (!result.success) {
      // 200 (not 409): heartbeat callers treat this as normal when the lock TTL expired or was released — avoids noisy "Failed to load resource" in DevTools.
      sendFailure(res, 200, 'LOCK_LOST', 'Lock no longer held');
      return;
    }
    emitLockEvent(tenantId, 'lock_acquired', {
      recordType: parsed.recordType,
      recordId: parsed.recordId,
      lockedBy: result.lockedBy,
      lockedByUserId: userId,
      expiresAt: result.expiresAt,
    });
    sendSuccess(res, { expiresAt: result.expiresAt });
  } catch (e) {
    handleRouteError(res, e);
  }
});

locksRouter.post('/locks/force', requireOrgUserAdmin, async (req: AuthedRequest, res: Res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = parseBody(req);
  if (!parsed) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'recordType and recordId are required');
    return;
  }
  try {
    const result = await withTransaction(async (client) => {
      const r = await forceLock(client, tenantId, userId, parsed.recordType, parsed.recordId);
      await logLockForceTakeover(
        client,
        tenantId,
        userId,
        r.lockedBy,
        parsed.recordType,
        parsed.recordId,
        r.previousHolderId,
        r.previousHolderName
      );
      return r;
    });
    emitLockEvent(tenantId, 'lock_acquired', {
      recordType: parsed.recordType,
      recordId: parsed.recordId,
      lockedBy: result.lockedBy,
      lockedByUserId: userId,
      expiresAt: result.expiresAt,
    });
    sendSuccess(res, {
      expiresAt: result.expiresAt,
      previousHolderName: result.previousHolderName,
      previousHolderId: result.previousHolderId,
    });
  } catch (e) {
    handleRouteError(res, e);
  }
});

locksRouter.get('/locks/status', async (req: AuthedRequest, res: Res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const recordType = parseRecordType(req.query.recordType ?? req.query.record_type);
  const recordId =
    typeof req.query.recordId === 'string'
      ? req.query.recordId.trim()
      : typeof req.query.record_id === 'string'
        ? req.query.record_id.trim()
        : '';
  if (!recordType || !recordId) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'recordType and recordId are required');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const row = await getActiveLock(client, tenantId, recordType, recordId);
      if (!row) {
        sendSuccess(res, { locked: false });
        return;
      }
      sendSuccess(res, {
        locked: true,
        lockedBy: row.locked_by_name,
        lockedByUserId: row.locked_by,
        lockedAt: row.locked_at instanceof Date ? row.locked_at.toISOString() : row.locked_at,
        expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});
