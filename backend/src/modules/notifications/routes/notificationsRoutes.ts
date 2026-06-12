import { Router } from 'express';
import { getPool } from '../../../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import {
  dismissUserNotification,
  listUserNotifications,
  markUserNotificationRead,
} from '../services/userNotificationService.js';

export const notificationsRouter = Router();

async function withClient<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

notificationsRouter.get('/notifications', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const items = await withClient((client) => listUserNotifications(client, tenantId, userId));
    sendSuccess(res, items);
  } catch (e) {
    handleRouteError(res, e);
  }
});

notificationsRouter.post('/notifications/:id/dismiss', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const ok = await withClient((client) =>
      dismissUserNotification(client, tenantId, userId, req.params.id)
    );
    if (!ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Notification not found');
      return;
    }
    sendSuccess(res, { dismissed: true });
  } catch (e) {
    handleRouteError(res, e);
  }
});

notificationsRouter.post('/notifications/:id/read', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const ok = await withClient((client) =>
      markUserNotificationRead(client, tenantId, userId, req.params.id)
    );
    if (!ok) {
      sendFailure(res, 404, 'NOT_FOUND', 'Notification not found');
      return;
    }
    sendSuccess(res, { read: true });
  } catch (e) {
    handleRouteError(res, e);
  }
});
