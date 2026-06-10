import { Router } from 'express';
import { z } from 'zod';
import { getPool, withTransaction } from '../db/pool.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { ORGANIZATION_STATUSES } from '../constants/organizationStatus.js';
import {
  approveOrganization,
  activateOrganization,
  getOrganizationRequestDetail,
  listOrganizationRequests,
  rejectOrganization,
  suspendOrganization,
} from '../services/organization/organizationApprovalService.js';

export const adminOrganizationRequestsRouter = Router();

const listQuerySchema = z.object({
  status: z.enum(ORGANIZATION_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const rejectBodySchema = z.object({
  reason: z.string().min(1).max(2000),
});

adminOrganizationRequestsRouter.get('/admin/organization-requests', async (req: AuthedRequest, res) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid query parameters');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const result = await listOrganizationRequests(client, {
        status: parsed.data.status,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
      sendSuccess(res, result);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/organization-requests' });
  }
});

adminOrganizationRequestsRouter.get('/admin/organization-requests/:id', async (req, res) => {
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const detail = await getOrganizationRequestDetail(client, req.params.id);
      if (!detail) {
        sendFailure(res, 404, 'NOT_FOUND', 'Organization not found');
        return;
      }
      sendSuccess(res, detail);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/organization-requests/:id' });
  }
});

adminOrganizationRequestsRouter.post(
  '/admin/organization-requests/:id/approve',
  async (req: AuthedRequest, res) => {
    try {
      const pool = getPool();
      const detail = await withTransaction((client) =>
        approveOrganization(client, req.params.id, req.userId!, req.body?.adminEmail)
      );
      sendSuccess(res, detail);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'Organization not found') {
        sendFailure(res, 404, 'NOT_FOUND', msg);
        return;
      }
      handleRouteError(res, e, { route: 'POST /admin/organization-requests/:id/approve' });
    }
  }
);

adminOrganizationRequestsRouter.post(
  '/admin/organization-requests/:id/reject',
  async (req: AuthedRequest, res) => {
    const parsed = rejectBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'Rejection reason is required');
      return;
    }
    try {
      const detail = await withTransaction((client) =>
        rejectOrganization(client, req.params.id, req.userId!, parsed.data.reason, req.body?.adminEmail)
      );
      sendSuccess(res, detail);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'Organization not found') {
        sendFailure(res, 404, 'NOT_FOUND', msg);
        return;
      }
      if (msg === 'Rejection reason is required') {
        sendFailure(res, 400, 'VALIDATION_ERROR', msg);
        return;
      }
      handleRouteError(res, e, { route: 'POST /admin/organization-requests/:id/reject' });
    }
  }
);

adminOrganizationRequestsRouter.post(
  '/admin/organization-requests/:id/suspend',
  async (req: AuthedRequest, res) => {
    try {
      const detail = await withTransaction((client) =>
        suspendOrganization(client, req.params.id, req.userId!)
      );
      sendSuccess(res, detail);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'Organization not found') {
        sendFailure(res, 404, 'NOT_FOUND', msg);
        return;
      }
      handleRouteError(res, e, { route: 'POST /admin/organization-requests/:id/suspend' });
    }
  }
);

adminOrganizationRequestsRouter.post(
  '/admin/organization-requests/:id/activate',
  async (req: AuthedRequest, res) => {
    try {
      const detail = await withTransaction((client) =>
        activateOrganization(client, req.params.id, req.userId!)
      );
      sendSuccess(res, detail);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'Organization not found') {
        sendFailure(res, 404, 'NOT_FOUND', msg);
        return;
      }
      handleRouteError(res, e, { route: 'POST /admin/organization-requests/:id/activate' });
    }
  }
);
