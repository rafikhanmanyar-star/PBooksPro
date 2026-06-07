import { Router } from 'express';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import { getPool } from '../db/pool.js';
import { listBillingPlans } from '../services/billing/billingPlanService.js';
import {
  downgradeSubscription,
  getActiveSubscription,
  upgradeSubscription,
} from '../services/billing/subscriptionService.js';
import { listInvoicesForTenant } from '../services/billing/subscriptionInvoiceService.js';
import { listSubscriptionEvents } from '../services/billing/subscriptionEventService.js';
import {
  getTenantUsageStatus,
  listUsageHistory,
  recordUsageSnapshot,
} from '../services/billing/subscriptionUsageService.js';
import { getLicenseStatusForTenant, validateTenantLicense } from '../services/billing/licenseEnforcementService.js';
import { createOrSyncBillingCustomer, getBillingCustomerByTenant, updateBillingCustomerInfo } from '../services/billing/paddleCustomerService.js';
import {
  createCustomerPortalSession,
  getBillingPortalSummary,
  getUsageDashboard,
} from '../services/billing/billingPortalService.js';
import {
  changeSubscriptionPlan,
  cancelTenantSubscription,
  reactivateTenantSubscription,
} from '../services/billing/paddleSubscriptionService.js';
import {
  createPaddleCheckout,
  mapLicenseTypeToBillingCycle,
  mapLicenseTypeToPlanCode,
} from '../services/billing/paddleBillingService.js';
import { storeMockCheckoutSession } from '../services/billing/mockCheckoutSessions.js';
import { requireLegalAcceptances } from '../services/legal/legalAcceptanceService.js';

export const subscriptionBillingRouter = Router();

subscriptionBillingRouter.get('/billing/plans', requirePermission('users.read'), async (_req, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const plans = await listBillingPlans(client);
    sendSuccess(res, { items: plans, count: plans.length });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /billing/plans' });
  } finally {
    client.release();
  }
});

subscriptionBillingRouter.get(
  '/billing/enforcement',
  requirePermission('users.read'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      await recordUsageSnapshot(client, tenantId);
      const status = await validateTenantLicense(client, tenantId);
      sendSuccess(res, status);
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /billing/enforcement' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.get(
  '/billing/portal',
  requirePermission('users.read'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const summary = await getBillingPortalSummary(client, tenantId);
      sendSuccess(res, summary);
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /billing/portal' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.post(
  '/billing/portal/session',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const session = await createCustomerPortalSession(client, tenantId);
      sendSuccess(res, { session });
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /billing/portal/session' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.get(
  '/billing/information',
  requirePermission('users.read'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const customer = await getBillingCustomerByTenant(client, tenantId);
      sendSuccess(res, { customer });
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /billing/information' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.put(
  '/billing/information',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const body = req.body ?? {};
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    if (!email) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'email is required.');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const customer = await updateBillingCustomerInfo(client, {
        tenantId,
        email,
        name,
        userId: req.userId,
      });
      sendSuccess(res, { customer });
    } catch (e) {
      handleRouteError(res, e, { route: 'PUT /billing/information' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.get(
  '/billing/usage/dashboard',
  requirePermission('users.read'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const dashboard = await getUsageDashboard(client, tenantId);
      sendSuccess(res, dashboard);
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /billing/usage/dashboard' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.get(
  '/billing/subscription',
  requirePermission('users.read'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const [subscription, license] = await Promise.all([
        getActiveSubscription(client, tenantId),
        getLicenseStatusForTenant(client, tenantId),
      ]);
      sendSuccess(res, { subscription, license });
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /billing/subscription' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.post(
  '/billing/customer/create',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const body = req.body ?? {};
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    if (!email) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'email is required.');
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      const customer = await createOrSyncBillingCustomer(client, {
        tenantId,
        email,
        name,
        userId: req.userId,
      });
      sendSuccess(res, { customer });
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /billing/customer/create' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.post(
  '/billing/checkout',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const body = req.body ?? {};
    const planCode = typeof body.planCode === 'string' ? body.planCode : undefined;
    const billingCycle =
      body.billingCycle === 'annual' ? ('annual' as const) : ('monthly' as const);
    if (!planCode) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'planCode is required.');
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      const legalAcceptances = Array.isArray(body.legalAcceptances) ? body.legalAcceptances : [];
      if (legalAcceptances.length === 0) {
        sendFailure(res, 400, 'LEGAL_ACCEPTANCE_REQUIRED', 'Subscription checkout requires legal document acceptance.');
        return;
      }

      await requireLegalAcceptances(client, {
        acceptances: legalAcceptances,
        context: 'checkout',
        tenantId,
        userId: req.userId,
        req,
      });

      const email = typeof body.email === 'string' ? body.email : undefined;
      if (email) {
        await createOrSyncBillingCustomer(client, {
          tenantId,
          email,
          name: typeof body.name === 'string' ? body.name : undefined,
          userId: req.userId,
        });
      }

      const checkout = await createPaddleCheckout(client, {
        tenantId,
        planCode,
        billingCycle,
        customerEmail: email,
        currency: typeof body.currency === 'string' ? body.currency : 'USD',
      });

      if (checkout.mock) {
        storeMockCheckoutSession(checkout.transactionId, {
          tenantId,
          planCode,
          billingCycle,
          amount: checkout.amount,
          currency: checkout.currency,
        });
      }

      sendSuccess(res, { checkout });
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /billing/checkout' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.post(
  '/billing/subscription/change-plan',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const body = req.body ?? {};
    const planCode = typeof body.planCode === 'string' ? body.planCode : '';
    if (!planCode) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'planCode is required.');
      return;
    }
    const billingCycle =
      body.billingCycle === 'annual'
        ? ('annual' as const)
        : body.billingCycle === 'monthly'
          ? ('monthly' as const)
          : undefined;

    const pool = getPool();
    const client = await pool.connect();
    try {
      const sub = await changeSubscriptionPlan(client, {
        tenantId,
        planCode,
        billingCycle,
        atPeriodEnd: body.atPeriodEnd !== false,
        userId: req.userId,
      });
      sendSuccess(res, sub);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /billing/subscription/change-plan' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.post(
  '/billing/subscription/checkout',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const body = req.body ?? {};
    const planCode = typeof body.planCode === 'string' ? body.planCode : undefined;
    const billingCycle =
      body.billingCycle === 'annual' ? ('annual' as const) : ('monthly' as const);
    if (!planCode) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'planCode is required.');
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      const legalAcceptances = Array.isArray(body.legalAcceptances) ? body.legalAcceptances : [];
      if (legalAcceptances.length === 0) {
        sendFailure(res, 400, 'LEGAL_ACCEPTANCE_REQUIRED', 'Subscription checkout requires legal document acceptance.');
        return;
      }

      await requireLegalAcceptances(client, {
        acceptances: legalAcceptances,
        context: 'checkout',
        tenantId,
        userId: req.userId,
        req,
      });

      const checkout = await createPaddleCheckout(client, {
        tenantId,
        planCode,
        billingCycle,
        customerEmail: typeof body.email === 'string' ? body.email : undefined,
        currency: typeof body.currency === 'string' ? body.currency : 'USD',
      });
      if (checkout.mock) {
        storeMockCheckoutSession(checkout.transactionId, {
          tenantId,
          planCode,
          billingCycle,
          amount: checkout.amount,
          currency: checkout.currency,
        });
      }

      sendSuccess(res, { checkout });
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /billing/subscription/checkout' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.post(
  '/billing/subscription/upgrade',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const planCode = typeof (req.body as { planCode?: string })?.planCode === 'string'
      ? (req.body as { planCode: string }).planCode
      : '';
    if (!planCode) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'planCode is required.');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const sub = await upgradeSubscription(client, tenantId, planCode);
      sendSuccess(res, sub);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /billing/subscription/upgrade' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.post(
  '/billing/subscription/downgrade',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const body = req.body ?? {};
    const planCode = typeof body.planCode === 'string' ? body.planCode : '';
    const atPeriodEnd = body.atPeriodEnd !== false;
    if (!planCode) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'planCode is required.');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const sub = await downgradeSubscription(client, tenantId, planCode, atPeriodEnd);
      sendSuccess(res, sub);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /billing/subscription/downgrade' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.post(
  '/billing/subscription/cancel',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const atPeriodEnd = (req.body as { atPeriodEnd?: boolean })?.atPeriodEnd !== false;
    const pool = getPool();
    const client = await pool.connect();
    try {
      const sub = await cancelTenantSubscription(client, {
        tenantId,
        atPeriodEnd,
        userId: req.userId,
      });
      sendSuccess(res, sub);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /billing/subscription/cancel' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.post(
  '/billing/subscription/reactivate',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const sub = await reactivateTenantSubscription(client, {
        tenantId,
        userId: req.userId,
      });
      sendSuccess(res, sub);
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /billing/subscription/reactivate' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.get(
  '/billing/invoices',
  requirePermission('users.read'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const items = await listInvoicesForTenant(client, tenantId);
      sendSuccess(res, { items, count: items.length });
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /billing/invoices' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.get(
  '/billing/usage',
  requirePermission('users.read'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      await recordUsageSnapshot(client, tenantId);
      const [current, history] = await Promise.all([
        getTenantUsageStatus(client, tenantId),
        listUsageHistory(client, tenantId),
      ]);
      sendSuccess(res, { current, history });
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /billing/usage' });
    } finally {
      client.release();
    }
  }
);

subscriptionBillingRouter.get(
  '/billing/events',
  requirePermission('users.read'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      const items = await listSubscriptionEvents(client, tenantId);
      sendSuccess(res, { items, count: items.length });
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /billing/events' });
    } finally {
      client.release();
    }
  }
);

/** Legacy license checkout mapping for PaymentModal */
export { mapLicenseTypeToPlanCode, mapLicenseTypeToBillingCycle };
