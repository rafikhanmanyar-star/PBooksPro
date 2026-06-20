/**

 * RBAC 2.0 Phase 4 — repository data scope enforcement gate.

 * Requires RBAC_V2_AUTHORIZATION_ENGINE when data scope is enabled (M1).

 */

import { isRbacV2AuthorizationEngineEnabled } from './rbacAuthorizationFeatureFlag.js';



export function isRbacV2DataScopeEnabled(): boolean {

  return process.env.RBAC_V2_DATA_SCOPE === 'true';

}



export function isRbacV2DataScopeUiEnabled(): boolean {

  return process.env.VITE_RBAC_V2_DATA_SCOPE === 'true';

}



/** True only when both data scope and authorization engine flags are on. */

export function isRbacV2DataScopeEffectivelyEnabled(): boolean {

  return isRbacV2DataScopeEnabled() && isRbacV2AuthorizationEngineEnabled();

}



export type RbacDataScopeConfigurationResult =

  | { ok: true }

  | { ok: false; code: 'CONFIGURATION_ERROR'; message: string };



export function assertRbacV2DataScopeConfiguration(): RbacDataScopeConfigurationResult {

  if (isRbacV2DataScopeEnabled() && !isRbacV2AuthorizationEngineEnabled()) {

    return {

      ok: false,

      code: 'CONFIGURATION_ERROR',

      message: 'RBAC_V2_DATA_SCOPE requires RBAC_V2_AUTHORIZATION_ENGINE=true',

    };

  }

  return { ok: true };

}


