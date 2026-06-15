import { Router } from 'express';
import { z } from 'zod';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { getPool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import {
  getApprovalRequest,
  listApprovalQueue,
  performApprovalAction,
  submitEntityForApproval,
} from '../services/workflowEngineService.js';
import { listWorkflowEntityTypes } from '../services/workflowEntityAdapters.js';

export const workflowApprovalRouter = Router();

const submitSchema = z.object({
  entityType: z.enum([
    'purchase_order',
    'contract',
    'bill',
    'payment',
    'retention_release',
    'variation_order',
  ]),
  entityId: z.string().min(1),
  comments: z.string().optional(),
});

const actionSchema = z.object({
  action: z.enum(['approve', 'reject', 'return', 'delegate', 'escalate']),
  comments: z.string().optional(),
  delegateToUserId: z.string().optional(),
});

workflowApprovalRouter.get('/workflow/entity-types', requirePermission('workflow.view'), (_req, res) => {
  sendSuccess(res, listWorkflowEntityTypes());
});

workflowApprovalRouter.get('/workflow/queue', requirePermission('workflow.view'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const mine = req.query.mine === 'true';
      const rows = await listApprovalQueue(client, tenantId, {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        entityType: typeof req.query.entityType === 'string' ? req.query.entityType : undefined,
        assignedToMe: mine && req.userId ? req.userId : undefined,
      });
      sendSuccess(res, rows);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

workflowApprovalRouter.get('/workflow/requests/:id', requirePermission('workflow.view'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const row = await getApprovalRequest(client, tenantId, req.params.id);
      if (!row) {
        sendFailure(res, 404, 'NOT_FOUND', 'Approval request not found');
        return;
      }
      sendSuccess(res, row);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

workflowApprovalRouter.post('/workflow/submit', requirePermission('workflow.view'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await submitEntityForApproval(client, tenantId, {
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        requesterId: req.userId ?? null,
        requesterRole: req.role ?? null,
        comments: parsed.data.comments,
      });
      await client.query('COMMIT');
      sendSuccess(res, result);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

workflowApprovalRouter.post(
  '/workflow/requests/:id/action',
  requirePermission('workflow.approve'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
      return;
    }
    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await performApprovalAction(client, tenantId, {
          requestId: req.params.id,
          action: parsed.data.action,
          actorId: req.userId ?? null,
          comments: parsed.data.comments,
          delegateToUserId: parsed.data.delegateToUserId,
        });
        await client.query('COMMIT');
        sendSuccess(res, result);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);
