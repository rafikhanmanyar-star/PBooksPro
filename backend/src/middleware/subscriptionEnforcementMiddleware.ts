/**
 * @deprecated Use licenseEnforcementMiddleware.ts
 */
export {
  isSubscriptionEnforcementEnabled,
  requireActiveSubscription,
  requireResourceQuota,
  subscriptionEnforcementMiddleware,
  validateTenantLicense,
} from './licenseEnforcementMiddleware.js';
