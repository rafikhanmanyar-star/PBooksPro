/**
 * Legacy /payments/* routes — bridges frontend PaymentModal to Paddle billing.
 */

import { Router } from 'express';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requirePermission } from '../../../middleware/rbacMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { getPool } from '../../../db/pool.js';
import {
  createPaddleCheckout,
  mapLicenseTypeToBillingCycle,
  mapLicenseTypeToPlanCode,
} from '../../../services/billing/paddleBillingService.js';
import { confirmMockPayment } from '../../../services/billing/paddleWebhookService.js';
import { listInvoicesForTenant, getInvoiceById } from '../../../services/billing/subscriptionInvoiceService.js';
import { takeMockCheckoutSession } from '../../../services/billing/mockCheckoutSessions.js';

export const paymentsRouter = Router();

paymentsRouter.post(
  '/payments/create-session',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }

    const body = req.body ?? {};
    const licenseType = body.licenseType === 'monthly' ? 'monthly' : 'yearly';
    const moduleKey = typeof body.moduleKey === 'string' ? body.moduleKey : undefined;
    const currency = body.currency === 'PKR' ? 'PKR' : 'USD';

    const planCode = mapLicenseTypeToPlanCode(licenseType, moduleKey);
    const billingCycle = mapLicenseTypeToBillingCycle(licenseType);

    const pool = getPool();
    const client = await pool.connect();
    try {
      const checkout = await createPaddleCheckout(client, {
        tenantId,
        planCode,
        billingCycle,
        currency,
      });

      if (checkout.mock) {
        const { storeMockCheckoutSession } = await import('../../../services/billing/mockCheckoutSessions.js');
        storeMockCheckoutSession(checkout.transactionId, {
          tenantId,
          planCode,
          billingCycle,
          amount: checkout.amount,
          currency: checkout.currency,
        });
      }

      sendSuccess(res, {
        session: {
          paymentId: checkout.transactionId,
          paymentIntentId: checkout.transactionId,
          checkoutUrl: checkout.checkoutUrl,
          amount: checkout.amount,
          currency: checkout.currency,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /payments/create-session' });
    } finally {
      client.release();
    }
  }
);

paymentsRouter.post(
  '/payments/confirm',
  requirePermission('users.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }

    const body = req.body ?? {};
    const paymentId = typeof body.paymentId === 'string' ? body.paymentId : '';
    const paymentIntentId =
      typeof body.paymentIntentId === 'string' ? body.paymentIntentId : paymentId;

    if (!paymentId) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'paymentId is required.');
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      const mock = takeMockCheckoutSession(paymentIntentId);
      if (mock && mock.tenantId === tenantId) {
        await confirmMockPayment(client, {
          tenantId,
          transactionId: paymentIntentId,
          planCode: mock.planCode,
          billingCycle: mock.billingCycle,
          amount: mock.amount,
          currency: mock.currency,
        });
        sendSuccess(res, { success: true, status: 'paid' });
        return;
      }

      // Real Paddle: webhook handles activation; confirm is idempotent ack
      sendSuccess(res, { success: true, status: 'pending_webhook' });
    } catch (e) {
      handleRouteError(res, e, { route: 'POST /payments/confirm' });
    } finally {
      client.release();
    }
  }
);

paymentsRouter.get(
  '/payments/history',
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
      const invoices = await listInvoicesForTenant(client, tenantId);
      const payments = invoices.map((inv) => ({
        id: inv.id,
        tenant_id: inv.tenant_id,
        payment_intent_id: inv.paddle_transaction_id ?? inv.id,
        amount: Number(inv.amount),
        currency: inv.currency,
        status: inv.status,
        gateway: inv.paddle_transaction_id?.startsWith('txn_mock_') ? 'mock' : 'paddle',
        license_type: String(inv.metadata?.billingCycle ?? inv.metadata?.planCode ?? 'subscription'),
        created_at: inv.invoice_date,
      }));
      sendSuccess(res, { payments });
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /payments/history' });
    } finally {
      client.release();
    }
  }
);

paymentsRouter.get(
  '/payments/:paymentId/status',
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
      const invoice = await getInvoiceById(client, req.params.paymentId);
      if (!invoice || invoice.tenant_id !== tenantId) {
        sendFailure(res, 404, 'NOT_FOUND', 'Payment not found.');
        return;
      }
      sendSuccess(res, {
        payment: {
          id: invoice.id,
          status: invoice.status,
          amount: Number(invoice.amount),
          currency: invoice.currency,
          createdAt: invoice.invoice_date,
          paidAt: invoice.paid_date ?? undefined,
        },
      });
    } catch (e) {
      handleRouteError(res, e, { route: 'GET /payments/:paymentId/status' });
    } finally {
      client.release();
    }
  }
);
