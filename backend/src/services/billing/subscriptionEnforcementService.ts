/**

 * License / subscription enforcement for tenant access.

 * @deprecated Import from licenseEnforcementService.js

 */



export {

  assertCanCreateResource,

  getLicenseStatusForTenant,

  LicenseEnforcementError,

  requireActiveSubscription,

  validateTenantLicense,

  type EnforcedResource,

  type LicenseEnforcementPayload,

  type LicenseWarning,

} from './licenseEnforcementService.js';



export type LicenseStatusPayload = Awaited<

  ReturnType<typeof import('./licenseEnforcementService.js').getLicenseStatusForTenant>

>;


