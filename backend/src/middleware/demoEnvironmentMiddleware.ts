import type { RequestHandler, Response, NextFunction } from 'express';
import type { AuthedRequest } from './authMiddleware.js';
import { sendFailure } from '../utils/apiResponse.js';
import {
  DEMO_MASTER_TENANT_ID,
  DEMO_PUBLIC_TENANT_ID,
  isDemoMasterTenant,
  isDemoPublicTenant,
  isDemoEnvironmentEnabled,
} from '../constants/demoEnvironment.js';

/**
 * Blocks all API access to the internal master template tenant.
 * Public demo sandbox (pbooks-demo) remains writable; it resets daily from code template.
 */
export const blockDemoMasterTenant: RequestHandler = (req: AuthedRequest, res: Response, next: NextFunction) => {
  if (!isDemoEnvironmentEnabled()) {
    next();
    return;
  }
  if (isDemoMasterTenant(req.tenantId)) {
    sendFailure(res, 403, 'DEMO_MASTER_PROTECTED', 'This organization is not available for interactive access.');
    return;
  }
  next();
};

/** Tags demo sessions for client analytics and optional read-only enforcement. */
export const tagDemoSession: RequestHandler = (req: AuthedRequest, res: Response, next: NextFunction) => {
  if (isDemoPublicTenant(req.tenantId)) {
    res.setHeader('X-PBooks-Demo-Session', 'true');
    if (process.env.DEMO_READ_ONLY === 'true' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      sendFailure(
        res,
        403,
        'DEMO_READ_ONLY',
        'The live demo is view-only. Changes reset daily and do not affect the master template.'
      );
      return;
    }
  }
  next();
};

export function isInternalDemoTenantId(tenantId: string): boolean {
  return tenantId === DEMO_MASTER_TENANT_ID || tenantId.startsWith('__');
}
