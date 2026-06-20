/**
 * Returns 503 CONFIGURATION_ERROR when RBAC_V2_APPROVAL_MATRIX is on without the authorization engine.
 */
import type { Request, Response, NextFunction } from 'express';
import { assertRbacV2ApprovalMatrixConfiguration } from '../auth/rbacApprovalFeatureFlag.js';
import { sendFailure } from '../utils/apiResponse.js';

export function requireRbacApprovalMatrixConfiguration(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  const check = assertRbacV2ApprovalMatrixConfiguration();
  if (!check.ok) {
    sendFailure(res, 503, check.code, check.message);
    return;
  }
  next();
}
