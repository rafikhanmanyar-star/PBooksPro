/**

 * Returns 503 CONFIGURATION_ERROR when RBAC_V2_DATA_SCOPE is on without the authorization engine.

 */

import type { Request, Response, NextFunction } from 'express';

import { assertRbacV2DataScopeConfiguration } from '../auth/rbacDataScopeFeatureFlag.js';

import { sendFailure } from '../utils/apiResponse.js';



export function requireRbacDataScopeConfiguration(_req: Request, res: Response, next: NextFunction): void {

  const check = assertRbacV2DataScopeConfiguration();

  if (!check.ok) {

    sendFailure(res, 503, check.code, check.message);

    return;

  }

  next();

}


