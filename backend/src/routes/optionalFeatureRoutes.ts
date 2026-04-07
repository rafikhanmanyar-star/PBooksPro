import { Router } from 'express';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { getPool } from '../db/pool.js';
import { getOnlineUserIds, recordPresence } from '../services/presenceService.js';

/**
 * Stubs + LAN presence: heartbeat + online user counts (in-memory per process).
 */
export const optionalFeatureRouter = Router();

optionalFeatureRouter.post('/auth/heartbeat', (req: AuthedRequest, res) => {
  const tid = req.tenantId;
  const uid = req.userId;
  if (tid && uid) recordPresence(tid, uid);
  sendSuccess(res, { ok: true });
});

optionalFeatureRouter.get('/tenants/license-status', (_req: AuthedRequest, res) => {
  res.json({
    isValid: true,
    daysRemaining: 999,
    licenseType: 'development',
    licenseStatus: 'active',
    isExpired: false,
    expiryDate: null,
    modules: ['real_estate', 'rental', 'shop'],
  });
});

optionalFeatureRouter.get('/tenants/online-users-count', (req: AuthedRequest, res) => {
  const tid = req.tenantId;
  const uid = req.userId;
  if (tid && uid) recordPresence(tid, uid);
  if (!tid) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const onlineUsers = getOnlineUserIds(tid).length;
  res.json({ onlineUsers });
});

optionalFeatureRouter.get('/tenants/online-users', async (req: AuthedRequest, res) => {
  const tid = req.tenantId;
  const uid = req.userId;
  if (tid && uid) recordPresence(tid, uid);
  if (!tid) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const ids = getOnlineUserIds(tid);
  if (ids.length === 0) {
    res.json([]);
    return;
  }
  try {
    const pool = getPool();
    const r = await pool.query<{ id: string; username: string; name: string; role: string; email: string | null }>(
      `SELECT id, username, name, role, email
       FROM users
       WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [tid, ids]
    );
    const byId = new Map(r.rows.map((row) => [row.id, row]));
    const list = ids
      .map((id) => {
        const row = byId.get(id);
        if (row) {
          return {
            id: row.id,
            username: row.username,
            name: row.name,
            role: row.role,
            ...(row.email ? { email: row.email } : {}),
          };
        }
        return { id, username: id, name: 'User', role: '' };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    res.json(list);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[online-users]', msg);
    const fallback = ids.map((id) => ({ id, username: id, name: 'User', role: '' }));
    res.json(fallback);
  }
});

optionalFeatureRouter.get('/whatsapp/unread-count', (_req: AuthedRequest, res) => {
  res.json({ count: 0 });
});

optionalFeatureRouter.get('/whatsapp/unread-conversations', (_req: AuthedRequest, res) => {
  res.json([]);
});
