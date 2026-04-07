import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool, withTransaction } from '../db/pool.js';
import {
  bulkUpsertSettings,
  deleteSetting,
  getSettingByKey,
  listAllSettings,
  upsertSetting,
} from '../services/appSettingsService.js';
import { emitEntityEvent } from '../core/realtime.js';

export const appSettingsRouter = Router();

appSettingsRouter.get('/app-settings', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const data = await listAllSettings(client, tenantId);
      sendSuccess(res, data);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

appSettingsRouter.get('/app-settings/:key', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { key } = req.params;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const value = await getSettingByKey(client, tenantId, decodeURIComponent(key));
      if (value === null) {
        sendFailure(res, 404, 'NOT_FOUND', 'Setting not found');
        return;
      }
      sendSuccess(res, { key: decodeURIComponent(key), value });
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

appSettingsRouter.post('/app-settings', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const body = req.body as { key?: string; value?: unknown };
  if (!body.key || typeof body.key !== 'string') {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'key is required');
    return;
  }
  const settingKey = body.key;
  try {
    await withTransaction((client) => upsertSetting(client, tenantId, settingKey, body.value));
    emitEntityEvent(tenantId, 'updated', 'settings', {
      data: { key: settingKey },
      sourceUserId: req.userId,
    });
    sendSuccess(res, { key: settingKey }, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

appSettingsRouter.post('/app-settings/bulk', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const body = req.body as { settings?: Record<string, unknown> };
  if (!body.settings || typeof body.settings !== 'object') {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'settings object is required');
    return;
  }
  const settings = body.settings;
  try {
    await withTransaction((client) => bulkUpsertSettings(client, tenantId, settings));
    emitEntityEvent(tenantId, 'updated', 'settings', { data: { keys: Object.keys(settings) }, sourceUserId: req.userId });
    sendSuccess(res, { ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
  }
});

appSettingsRouter.delete('/app-settings/:key', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const { key } = req.params;
  try {
    const ok = await withTransaction((client) =>
      deleteSetting(client, tenantId, decodeURIComponent(key))
    );
    if (!ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Setting not found');
      return;
    }
    const decodedKey = decodeURIComponent(key);
    emitEntityEvent(tenantId, 'deleted', 'settings', { data: { key: decodedKey }, id: decodedKey, sourceUserId: req.userId });
    sendSuccess(res, { key: decodedKey });
  } catch (e) {
    handleRouteError(res, e);
  }
});
