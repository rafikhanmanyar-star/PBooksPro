import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requirePermissionV2 } from '../../../auth/authorizeV2.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import {
  isRbacV2ApprovalMatrixEnabled,
  assertRbacV2ApprovalMatrixConfiguration,
} from '../../../auth/rbacApprovalFeatureFlag.js';
import {
  createApprovalAssignment,
  createAssignmentSchema,
  getApprovalMatrixSummary,
  getUserApprovalCapabilities,
  removeApprovalAssignment,
  upsertApprovalRule,
  upsertRuleSchema,
} from '../services/rbacApprovalMatrixService.js';

export const approvalMatrixRouter = Router();

function requireApprovalMatrixFeature(
  _req: AuthedRequest,
  res: import('express').Response,
  next: import('express').NextFunction
) {
  const config = assertRbacV2ApprovalMatrixConfiguration();
  if (!config.ok) {
    sendFailure(res, 503, config.code, config.message);
    return;
  }
  if (!isRbacV2ApprovalMatrixEnabled()) {
    sendFailure(res, 503, 'FEATURE_DISABLED', 'RBAC v2 approval matrix is not enabled');
    return;
  }
  next();
}

approvalMatrixRouter.use(requireApprovalMatrixFeature);

approvalMatrixRouter.get(
  '/rbac/approval-matrix',
  requirePermissionV2('administration.approvals.final', 'users.read'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const summary = await getApprovalMatrixSummary(tenantId);
      sendSuccess(res, summary);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

approvalMatrixRouter.get(
  '/rbac/approval-matrix/users/:userId/capabilities',
  requirePermissionV2('administration.approvals.final', 'users.read'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const { userId } = req.params;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const data = await getUserApprovalCapabilities(tenantId, userId);
      sendSuccess(res, data);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

approvalMatrixRouter.put(
  '/rbac/approval-matrix/rules',
  requirePermissionV2('administration.approvals.final'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const actorId = req.userId;
    if (!tenantId || !actorId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = upsertRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
      return;
    }
    try {
      const summary = await upsertApprovalRule(req, tenantId, actorId, parsed.data);
      sendSuccess(res, summary);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

approvalMatrixRouter.post(
  '/rbac/approval-matrix/assignments',
  requirePermissionV2('administration.approvals.final'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const actorId = req.userId;
    if (!tenantId || !actorId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = createAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
      return;
    }
    try {
      const summary = await createApprovalAssignment(req, tenantId, actorId, parsed.data);
      sendSuccess(res, summary, 201);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

approvalMatrixRouter.delete(
  '/rbac/approval-matrix/assignments/:assignmentId',
  requirePermissionV2('administration.approvals.final'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const actorId = req.userId;
    const { assignmentId } = req.params;
    if (!tenantId || !actorId || !assignmentId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const reason =
      typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    try {
      const summary = await removeApprovalAssignment(req, tenantId, actorId, assignmentId, reason);
      sendSuccess(res, summary);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);
