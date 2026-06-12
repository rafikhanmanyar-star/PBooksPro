/**
 * Data privacy management API — exports, requests, anonymization.
 */

import { Router } from 'express';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requireOrgUserAdmin } from '../../../middleware/authMiddleware.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { getPool } from '../../../db/pool.js';
import {
  isPrivacyRequestType,
  mapExportScopeToRequestType,
  type PrivacyExportScope,
} from '../../../constants/privacyRequestTypes.js';
import {
  canUserAccessRequest,
  createPrivacyRequest,
  getPrivacyRequest,
  listPrivacyRequests,
  updatePrivacyRequestStatus,
} from '../../../services/privacy/privacyRequestService.js';
import {
  buildPrivacyExport,
  privacyExportFilename,
} from '../../../services/privacy/privacyDataExportService.js';
import {
  anonymizeUserData,
  buildAnonymizationMetadata,
} from '../../../services/privacy/privacyAnonymizationService.js';
import { appendAuditEvent } from '../../../services/enterpriseAuditService.js';

export const privacyRouter = Router();

function isAdmin(req: AuthedRequest): boolean {
  const role = (req.role ?? '').toLowerCase();
  return role === 'admin' || role === 'super_admin';
}

function parseExportScope(raw: unknown): PrivacyExportScope | null {
  if (raw === 'data' || raw === 'user' || raw === 'tenant') return raw;
  return null;
}

function clientIp(req: AuthedRequest): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  return req.ip ?? null;
}

/** List privacy requests for the tenant (users see own; admins see all). */
privacyRouter.get('/privacy/requests', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const items = await listPrivacyRequests(client, tenantId, {
      userId: isAdmin(req) ? undefined : userId,
      limit: 100,
    });
    sendSuccess(res, { items, count: items.length });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /privacy/requests' });
  } finally {
    client.release();
  }
});

/** Create a privacy request (deletion, correction, export request). */
privacyRouter.post('/privacy/requests', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const body = req.body ?? {};
  const requestType = typeof body.requestType === 'string' ? body.requestType : '';
  if (!isPrivacyRequestType(requestType)) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid requestType.');
    return;
  }

  if (requestType === 'tenant_data_export' && !isAdmin(req)) {
    sendFailure(res, 403, 'FORBIDDEN', 'Tenant export requests require administrator access.');
    return;
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  if ((requestType === 'deletion' || requestType === 'correction') && !notes) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'notes are required for deletion and correction requests.');
    return;
  }

  const targetUserId =
    typeof body.targetUserId === 'string' && body.targetUserId.trim()
      ? body.targetUserId.trim()
      : userId;

  if (targetUserId !== userId && !isAdmin(req)) {
    sendFailure(res, 403, 'FORBIDDEN', 'You can only submit requests for your own account.');
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const request = await createPrivacyRequest(client, {
      tenantId,
      requestedByUserId: userId,
      requestType,
      metadata: {
        notes: notes || undefined,
        targetUserId,
        ipAddress: clientIp(req),
      },
    });

    await appendAuditEvent(client, {
      tenantId,
      userId,
      module: 'privacy',
      action: 'create',
      entityType: 'privacy_request',
      entityId: request.id,
      summary: `Privacy request created: ${requestType}`,
      newValue: { requestType, status: request.status },
      ctx: { ipAddress: clientIp(req), userAgent: req.headers['user-agent'] ?? null },
    });

    sendSuccess(res, { request }, 201);
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /privacy/requests' });
  } finally {
    client.release();
  }
});

/** Get a single privacy request. */
privacyRouter.get('/privacy/requests/:id', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const request = await getPrivacyRequest(client, tenantId, req.params.id);
    if (!request) {
      sendFailure(res, 404, 'NOT_FOUND', 'Privacy request not found.');
      return;
    }
    if (!canUserAccessRequest(request, userId, isAdmin(req))) {
      sendFailure(res, 403, 'FORBIDDEN', 'Access denied.');
      return;
    }
    sendSuccess(res, { request });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /privacy/requests/:id' });
  } finally {
    client.release();
  }
});

/** Export data — creates a tracked request and returns JSON download. */
privacyRouter.post('/privacy/export', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }

  const body = req.body ?? {};
  const scope = parseExportScope(body.scope ?? 'data');
  if (!scope) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'scope must be data, user, or tenant.');
    return;
  }

  if (scope === 'tenant' && !isAdmin(req)) {
    sendFailure(res, 403, 'FORBIDDEN', 'Tenant data export requires administrator access.');
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const request = await createPrivacyRequest(client, {
      tenantId,
      requestedByUserId: userId,
      requestType: mapExportScopeToRequestType(scope),
      status: 'processing',
      metadata: { scope, ipAddress: clientIp(req) },
    });

    const payload = await buildPrivacyExport(client, tenantId, userId, scope);
    const json = JSON.stringify(payload, null, 2);
    const filename = privacyExportFilename(scope, tenantId, userId);

    await updatePrivacyRequestStatus(client, {
      tenantId,
      requestId: request.id,
      status: 'completed',
      metadataPatch: { scope, filename, sizeBytes: Buffer.byteLength(json, 'utf8') },
    });

    await appendAuditEvent(client, {
      tenantId,
      userId,
      module: 'privacy',
      action: 'create',
      entityType: 'privacy_export',
      entityId: request.id,
      summary: `Privacy data export (${scope})`,
      newValue: { scope, filename },
      ctx: { ipAddress: clientIp(req), userAgent: req.headers['user-agent'] ?? null },
    });

    await client.query('COMMIT');

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Privacy-Request-Id', request.id);
    res.status(200).send(json);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    handleRouteError(res, e, { route: 'POST /privacy/export' });
  } finally {
    client.release();
  }
});

/** Admin: process a pending deletion request via anonymization. */
privacyRouter.post(
  '/privacy/requests/:id/process-deletion',
  requireOrgUserAdmin,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await getPrivacyRequest(client, tenantId, req.params.id);
      if (!existing) {
        await client.query('ROLLBACK');
        sendFailure(res, 404, 'NOT_FOUND', 'Privacy request not found.');
        return;
      }
      if (existing.request_type !== 'deletion') {
        await client.query('ROLLBACK');
        sendFailure(res, 400, 'VALIDATION_ERROR', 'Request is not a deletion request.');
        return;
      }
      if (existing.status !== 'pending') {
        await client.query('ROLLBACK');
        sendFailure(res, 400, 'VALIDATION_ERROR', 'Request is not pending.');
        return;
      }

      const targetUserId =
        typeof existing.metadata.targetUserId === 'string'
          ? existing.metadata.targetUserId
          : existing.requested_by_user_id;
      if (!targetUserId) {
        await client.query('ROLLBACK');
        sendFailure(res, 400, 'VALIDATION_ERROR', 'No target user on this request.');
        return;
      }

      await updatePrivacyRequestStatus(client, {
        tenantId,
        requestId: existing.id,
        status: 'processing',
      });

      const result = await anonymizeUserData(client, tenantId, targetUserId);

      const updated = await updatePrivacyRequestStatus(client, {
        tenantId,
        requestId: existing.id,
        status: 'completed',
        metadataPatch: buildAnonymizationMetadata(result),
      });

      await appendAuditEvent(client, {
        tenantId,
        userId,
        module: 'privacy',
        action: 'delete',
        entityType: 'user',
        entityId: targetUserId,
        summary: 'Deletion request processed via anonymization',
        newValue: { privacyRequestId: existing.id, ...result },
        ctx: { ipAddress: clientIp(req), userAgent: req.headers['user-agent'] ?? null },
      });

      await client.query('COMMIT');
      sendSuccess(res, { request: updated, anonymization: result });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      handleRouteError(res, e, { route: 'POST /privacy/requests/:id/process-deletion' });
    } finally {
      client.release();
    }
  }
);

/** Admin: mark correction request completed or rejected. */
privacyRouter.post(
  '/privacy/requests/:id/resolve',
  requireOrgUserAdmin,
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }

    const body = req.body ?? {};
    const resolution = body.status === 'rejected' ? 'rejected' : 'completed';
    const adminNotes = typeof body.adminNotes === 'string' ? body.adminNotes.trim() : '';

    const pool = getPool();
    const client = await pool.connect();
    try {
      const existing = await getPrivacyRequest(client, tenantId, req.params.id);
      if (!existing) {
        sendFailure(res, 404, 'NOT_FOUND', 'Privacy request not found.');
        return;
      }
      if (existing.request_type !== 'correction') {
        sendFailure(res, 400, 'VALIDATION_ERROR', 'Request is not a correction request.');
        return;
      }
      if (existing.status !== 'pending') {
        sendFailure(res, 400, 'VALIDATION_ERROR', 'Request is not pending.');
        return;
      }

      const updated = await updatePrivacyRequestStatus(client, {
        tenantId,
        requestId: existing.id,
        status: resolution,
        metadataPatch: { adminNotes: adminNotes || undefined, resolvedByUserId: userId },
      });

      await appendAuditEvent(client, {
        tenantId,
        userId,
        module: 'privacy',
        action: 'edit',
        entityType: 'privacy_request',
        entityId: existing.id,
        summary: `Correction request ${resolution}`,
        newValue: { status: resolution, adminNotes },
        ctx: { ipAddress: clientIp(req), userAgent: req.headers['user-agent'] ?? null },
      });

      sendSuccess(res, { request: updated });
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /privacy/requests/:id/resolve' });
    } finally {
      client.release();
    }
  }
);

/** Admin: anonymize a user directly. */
privacyRouter.post(
  '/privacy/anonymize',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }

    const body = req.body ?? {};
    const targetUserId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!targetUserId) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'userId is required.');
      return;
    }
    if (targetUserId === userId) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'You cannot anonymize your own account via this endpoint.');
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const request = await createPrivacyRequest(client, {
        tenantId,
        requestedByUserId: userId,
        requestType: 'anonymization',
        status: 'processing',
        metadata: { targetUserId, ipAddress: clientIp(req) },
      });

      const result = await anonymizeUserData(client, tenantId, targetUserId);

      const updated = await updatePrivacyRequestStatus(client, {
        tenantId,
        requestId: request.id,
        status: 'completed',
        metadataPatch: buildAnonymizationMetadata(result),
      });

      await appendAuditEvent(client, {
        tenantId,
        userId,
        module: 'privacy',
        action: 'delete',
        entityType: 'user',
        entityId: targetUserId,
        summary: 'User data anonymized',
        newValue: { privacyRequestId: request.id, ...result },
        ctx: { ipAddress: clientIp(req), userAgent: req.headers['user-agent'] ?? null },
      });

      await client.query('COMMIT');
      sendSuccess(res, { request: updated, anonymization: result }, 201);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      handleRouteError(res, e, { route: 'POST /privacy/anonymize' });
    } finally {
      client.release();
    }
  }
);
