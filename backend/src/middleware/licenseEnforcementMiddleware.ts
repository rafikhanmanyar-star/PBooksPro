/**
 * Server-side subscription & quota enforcement (cannot be bypassed from the client).
 */

import type { RequestHandler, Response, NextFunction } from 'express';
import type { AuthedRequest } from './authMiddleware.js';
import { sendFailure } from '../utils/apiResponse.js';
import { getPool } from '../db/pool.js';
import {
  assertCanCreateResource,
  assertModuleEnabled,
  LicenseEnforcementError,
  requireActiveSubscription as assertActiveSubscriptionInDb,
  validateTenantLicense,
  type EnforcedResource,
} from '../services/billing/licenseEnforcementService.js';
import { DemoMutationLimitError } from '../services/demo/demoLicenseService.js';

const SKIP_PATH_PREFIXES = [
  '/payments/',
  '/billing/',
  '/tenants/license-status',
  '/tenants/enforcement',
  '/auth/heartbeat',
  '/auth/login',
  '/auth/register-tenant',
  '/auth/mfa/',
  '/trial/signup',
  '/webhooks/',
  '/legal/',
  '/database/backup',
];

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isSubscriptionEnforcementEnabled(): boolean {
  if (process.env.DISABLE_SUBSCRIPTION_ENFORCEMENT === 'true') return false;
  if (process.env.ENABLE_SUBSCRIPTION_ENFORCEMENT === 'false') return false;
  /** Packaged PBooks Pro Staging API Server (Electron) — LAN test orgs skip Paddle gates. */
  if (process.env.PBOOKS_API_SERVER_STAGING === '1') return false;
  return process.env.ENABLE_SUBSCRIPTION_ENFORCEMENT === 'true' || process.env.NODE_ENV === 'production';
}

function shouldSkipGlobalEnforcement(path: string, method: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return true;
  return SKIP_PATH_PREFIXES.some((p) => path.includes(p));
}

function handleEnforcementError(res: Response, err: unknown): void {
  if (err instanceof LicenseEnforcementError) {
    sendFailure(res, err.statusCode, err.code, err.message);
    return;
  }
  if (err instanceof DemoMutationLimitError) {
    sendFailure(res, 403, err.code, err.message);
    return;
  }
  sendFailure(res, 402, 'SUBSCRIPTION_REQUIRED', 'Subscription validation failed.');
}

/**
 * Blocks mutating API requests when subscription is invalid (trial expired, past due, tenant inactive).
 */
export function requireActiveSubscription(): RequestHandler {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!isSubscriptionEnforcementEnabled()) {
      next();
      return;
    }

    const tenantId = req.tenantId;
    if (!tenantId) {
      next();
      return;
    }

    const path = req.path ?? req.originalUrl ?? '';
    if (shouldSkipGlobalEnforcement(path, req.method)) {
      next();
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await assertActiveSubscriptionInDb(client, tenantId);
      next();
    } catch (err) {
      handleEnforcementError(res, err);
    } finally {
      client.release();
    }
  };
}

/**
 * Blocks resource creation when plan quotas are exceeded.
 */
export function requireResourceQuota(resource: EnforcedResource): RequestHandler {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!isSubscriptionEnforcementEnabled()) {
      next();
      return;
    }

    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await assertCanCreateResource(client, tenantId, resource);
      next();
    } catch (err) {
      handleEnforcementError(res, err);
    } finally {
      client.release();
    }
  };
}

/** Blocks routes when the tenant plan does not include a module (e.g. rental, real_estate). */
export function requireSubscriptionModule(moduleKey: string): RequestHandler {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!isSubscriptionEnforcementEnabled()) {
      next();
      return;
    }

    const tenantId = req.tenantId;
    if (!tenantId) {
      next();
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await assertModuleEnabled(client, tenantId, moduleKey);
      next();
    } catch (err) {
      handleEnforcementError(res, err);
    } finally {
      client.release();
    }
  };
}

/** @deprecated alias — use requireActiveSubscription() */
export const subscriptionEnforcementMiddleware = requireActiveSubscription();

export { validateTenantLicense };
