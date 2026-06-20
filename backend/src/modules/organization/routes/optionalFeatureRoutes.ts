import { Router } from 'express';
import { sendFailure, sendSuccess } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool } from '../../../db/pool.js';
import {
  getOnlineUserIds,
  getOnlineUsersFromPresence,
  recordPresence,
  type PresenceProfile,
} from '../services/presenceService.js';
import { touchUserSession } from '../../../services/auth/userSessionService.js';
import { getLicenseStatusForTenant, validateTenantLicense } from '../../../services/billing/licenseEnforcementService.js';

/**
 * Stubs + LAN presence: heartbeat + online user counts (in-memory per process).
 */
export const optionalFeatureRouter = Router();

function presenceProfileFromRequest(req: AuthedRequest): PresenceProfile | undefined {
  if (!req.userId) return undefined;
  return {
    username: req.username,
    name: req.name,
    role: req.role,
  };
}

function touchPresence(req: AuthedRequest): void {
  const tid = req.tenantId;
  const uid = req.userId;
  if (tid && uid) recordPresence(tid, uid, presenceProfileFromRequest(req));
}

optionalFeatureRouter.post('/auth/heartbeat', (req: AuthedRequest, res) => {
  const tid = req.tenantId;
  const uid = req.userId;
  if (tid && uid) {
    touchPresence(req);
    void touchUserSession(uid, tid).catch((err) => {
      console.warn('[heartbeat] Failed to persist session activity:', err instanceof Error ? err.message : err);
    });
  }
  sendSuccess(res, { ok: true });
});

// PERF-A6.5: runSubscriptionMaintenance removed from both endpoints.
// Subscription lifecycle maintenance (trial expiry, pending plan changes,
// past-due grace, webhook retries) runs on the billingSchedulerService
// every 15 minutes. Inlining it here caused every license-status poll
// (every 5 min per user from the Sidebar) to hold a DB connection for
// an unbounded duration while retrying all failed Paddle webhooks serially.

optionalFeatureRouter.get('/tenants/enforcement', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  let status: Awaited<ReturnType<typeof validateTenantLicense>>;
  try {
    status = await validateTenantLicense(client, tenantId);
  } finally {
    client.release();
  }
  sendSuccess(res, status);
});

optionalFeatureRouter.get('/tenants/license-status', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const pool = getPool();
  const client = await pool.connect();
  let status: Awaited<ReturnType<typeof getLicenseStatusForTenant>>;
  try {
    status = await getLicenseStatusForTenant(client, tenantId);
  } finally {
    client.release();
  }
  res.json(status);
});

optionalFeatureRouter.get('/tenants/online-users-count', (req: AuthedRequest, res) => {
  touchPresence(req);
  const tid = req.tenantId;
  if (!tid) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const onlineUsers = getOnlineUserIds(tid).length;
  res.json({ onlineUsers });
});

optionalFeatureRouter.get('/tenants/online-users', (req: AuthedRequest, res) => {
  touchPresence(req);
  const tid = req.tenantId;
  if (!tid) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  res.json(getOnlineUsersFromPresence(tid));
});
