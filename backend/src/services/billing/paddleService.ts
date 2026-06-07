/**
 * Paddle Billing API client (transactions, customers, subscriptions).
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { BillingPlanRow } from './billingPlanService.js';

export type PaddleCheckoutResult = {
  transactionId: string;
  checkoutUrl: string;
  amount: number;
  currency: string;
  mock: boolean;
};

export type PaddleCustomerResult = {
  paddleCustomerId: string;
  email: string;
  name: string | null;
  mock: boolean;
};

export function isPaddleConfigured(): boolean {
  return !!process.env.PADDLE_API_KEY?.trim();
}

export function paddleApiBase(): string {
  const env = (process.env.PADDLE_ENV ?? 'sandbox').trim().toLowerCase();
  return env === 'live' || env === 'production'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com';
}

export function resolvePriceId(planCode: string, billingCycle: 'monthly' | 'annual'): string | null {
  const key = `PADDLE_PRICE_${planCode.toUpperCase()}_${billingCycle.toUpperCase()}`;
  const direct = process.env[key]?.trim();
  if (direct) return direct;
  const genericKey =
    billingCycle === 'annual' ? 'PADDLE_PRICE_ANNUAL' : 'PADDLE_PRICE_MONTHLY';
  return process.env[genericKey]?.trim() ?? null;
}

export function resolvePlanPrice(plan: BillingPlanRow, billingCycle: 'monthly' | 'annual'): number {
  return billingCycle === 'annual' ? Number(plan.annual_price) : Number(plan.monthly_price);
}

export function mapLicenseTypeToPlanCode(
  licenseType: 'monthly' | 'yearly',
  moduleKey?: string
): string {
  if (moduleKey === 'real_estate' || moduleKey === 'rental') return 'starter';
  return licenseType === 'yearly' ? 'enterprise' : 'professional';
}

export function mapLicenseTypeToBillingCycle(
  licenseType: 'monthly' | 'yearly'
): 'monthly' | 'annual' {
  return licenseType === 'yearly' ? 'annual' : 'monthly';
}

type PaddleApiJson = {
  data?: Record<string, unknown>;
  error?: { detail?: string; message?: string };
};

async function paddleRequest<T extends Record<string, unknown>>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  if (!apiKey) throw new Error('PADDLE_API_KEY is not configured.');

  const res = await fetch(`${paddleApiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as PaddleApiJson & T;
  if (!res.ok) {
    const msg = json.error?.detail ?? json.error?.message ?? `Paddle API error (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

export async function createPaddleCustomer(input: {
  tenantId: string;
  email: string;
  name?: string;
}): Promise<PaddleCustomerResult> {
  if (!isPaddleConfigured()) {
    return {
      paddleCustomerId: `ctm_mock_${randomUUID().slice(0, 12)}`,
      email: input.email,
      name: input.name ?? null,
      mock: true,
    };
  }

  const json = await paddleRequest<PaddleApiJson>('POST', '/customers', {
    email: input.email,
    name: input.name,
    custom_data: { tenant_id: input.tenantId },
  });

  const id = typeof json.data?.id === 'string' ? json.data.id : null;
  if (!id) throw new Error('Paddle did not return a customer ID.');

  return {
    paddleCustomerId: id,
    email: input.email,
    name: input.name ?? null,
    mock: false,
  };
}

export async function createPaddleCheckout(input: {
  tenantId: string;
  plan: BillingPlanRow;
  billingCycle: 'monthly' | 'annual';
  customerEmail?: string;
  paddleCustomerId?: string | null;
  currency?: string;
}): Promise<PaddleCheckoutResult> {
  const amount = resolvePlanPrice(input.plan, input.billingCycle);
  const currency = input.currency ?? 'USD';

  if (!isPaddleConfigured()) {
    const mockTxnId = `txn_mock_${Date.now()}`;
    const checkoutUrl = `/billing/checkout?_ptxn=${encodeURIComponent(mockTxnId)}&mock=1&tenant=${encodeURIComponent(input.tenantId)}&plan=${encodeURIComponent(input.plan.plan_code)}&cycle=${input.billingCycle}&amount=${amount}`;
    return { transactionId: mockTxnId, checkoutUrl, amount, currency, mock: true };
  }

  const priceId = resolvePriceId(input.plan.plan_code, input.billingCycle);
  if (!priceId) {
    throw new Error(
      `Paddle price ID not configured for ${input.plan.plan_code}/${input.billingCycle}.`
    );
  }

  const body: Record<string, unknown> = {
    items: [{ price_id: priceId, quantity: 1 }],
    custom_data: {
      tenant_id: input.tenantId,
      plan_code: input.plan.plan_code,
      billing_cycle: input.billingCycle,
    },
  };

  if (input.paddleCustomerId) {
    body.customer_id = input.paddleCustomerId;
  } else if (input.customerEmail) {
    body.customer = { email: input.customerEmail };
  }

  const json = await paddleRequest<PaddleApiJson>('POST', '/transactions', body);
  const transactionId = typeof json.data?.id === 'string' ? json.data.id : null;
  if (!transactionId) throw new Error('Paddle did not return a transaction ID.');

  return {
    transactionId,
    checkoutUrl: `/billing/checkout?_ptxn=${encodeURIComponent(transactionId)}`,
    amount,
    currency,
    mock: false,
  };
}

export async function getPaddleTransaction(transactionId: string): Promise<Record<string, unknown>> {
  if (!isPaddleConfigured() || transactionId.startsWith('txn_mock_')) {
    return { id: transactionId, status: 'completed', mock: true };
  }
  const json = await paddleRequest<PaddleApiJson>('GET', `/transactions/${transactionId}`);
  return (json.data ?? {}) as Record<string, unknown>;
}

export async function changePaddleSubscriptionPlan(input: {
  paddleSubscriptionId: string;
  planCode: string;
  billingCycle: 'monthly' | 'annual';
  proration?: 'prorated_immediately' | 'full_immediately' | 'do_not_bill';
}): Promise<void> {
  if (!isPaddleConfigured() || input.paddleSubscriptionId.startsWith('sub_mock_')) return;

  const priceId = resolvePriceId(input.planCode, input.billingCycle);
  if (!priceId) throw new Error('Paddle price ID not configured for plan change.');

  await paddleRequest('PATCH', `/subscriptions/${input.paddleSubscriptionId}`, {
    items: [{ price_id: priceId, quantity: 1 }],
    proration_billing_mode: input.proration ?? 'prorated_immediately',
  });
}

export async function cancelPaddleSubscription(
  paddleSubscriptionId: string,
  effectiveFrom: 'immediately' | 'next_billing_period' = 'next_billing_period'
): Promise<void> {
  if (!isPaddleConfigured() || paddleSubscriptionId.startsWith('sub_mock_')) return;

  await paddleRequest('POST', `/subscriptions/${paddleSubscriptionId}/cancel`, {
    effective_from: effectiveFrom,
  });
}

export async function resumePaddleSubscription(paddleSubscriptionId: string): Promise<void> {
  if (!isPaddleConfigured() || paddleSubscriptionId.startsWith('sub_mock_')) return;
  await paddleRequest('POST', `/subscriptions/${paddleSubscriptionId}/resume`, {});
}

export type PaddlePortalSession = {
  sessionId: string;
  overviewUrl: string;
  cancelSubscriptionUrl: string | null;
  updatePaymentMethodUrl: string | null;
  mock: boolean;
};

export async function createPaddleCustomerPortalSession(input: {
  paddleCustomerId: string;
  paddleSubscriptionId?: string | null;
}): Promise<PaddlePortalSession> {
  if (!isPaddleConfigured() || input.paddleCustomerId.startsWith('ctm_mock_')) {
    return {
      sessionId: `cpls_mock_${randomUUID().slice(0, 12)}`,
      overviewUrl: 'https://sandbox-customer-portal.paddle.com/mock/overview',
      cancelSubscriptionUrl: input.paddleSubscriptionId
        ? 'https://sandbox-customer-portal.paddle.com/mock/cancel'
        : null,
      updatePaymentMethodUrl: input.paddleSubscriptionId
        ? 'https://sandbox-customer-portal.paddle.com/mock/payment-method'
        : null,
      mock: true,
    };
  }

  const body: Record<string, unknown> = {};
  if (input.paddleSubscriptionId) {
    body.subscription_ids = [input.paddleSubscriptionId];
  }

  const json = await paddleRequest<PaddleApiJson>(
    'POST',
    `/customers/${input.paddleCustomerId}/portal-sessions`,
    body
  );

  const data = json.data ?? {};
  const sessionId = typeof data.id === 'string' ? data.id : '';
  const urls = data.urls && typeof data.urls === 'object' ? (data.urls as Record<string, unknown>) : {};
  const general =
    urls.general && typeof urls.general === 'object'
      ? (urls.general as Record<string, unknown>)
      : {};
  const overview = typeof general.overview === 'string' ? general.overview : '';

  let cancelUrl: string | null = null;
  let paymentUrl: string | null = null;
  const subs = urls.subscriptions;
  if (Array.isArray(subs) && subs.length > 0) {
    const first = subs[0];
    if (first && typeof first === 'object') {
      const s = first as Record<string, unknown>;
      cancelUrl = typeof s.cancel_subscription === 'string' ? s.cancel_subscription : null;
      paymentUrl =
        typeof s.update_subscription_payment_method === 'string'
          ? s.update_subscription_payment_method
          : null;
    }
  }

  if (!overview) throw new Error('Paddle did not return a customer portal URL.');

  return {
    sessionId,
    overviewUrl: overview,
    cancelSubscriptionUrl: cancelUrl,
    updatePaymentMethodUrl: paymentUrl,
    mock: false,
  };
}

export async function updatePaddleCustomer(
  paddleCustomerId: string,
  input: { email?: string; name?: string }
): Promise<void> {
  if (!isPaddleConfigured() || paddleCustomerId.startsWith('ctm_mock_')) return;
  await paddleRequest('PATCH', `/customers/${paddleCustomerId}`, input);
}

export function verifyPaddleWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined
): boolean {
  const secret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  if (!secret || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(';').map((p) => {
      const [k, v] = p.split('=');
      return [k?.trim(), v?.trim()];
    })
  );
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;

  const payload = `${ts}:${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');

  try {
    const a = Buffer.from(h1, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type PaddleWebhookEvent = {
  event_id: string;
  event_type: string;
  occurred_at?: string;
  data: Record<string, unknown>;
};

export function parsePaddleWebhook(body: unknown): PaddleWebhookEvent | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const eventType =
    typeof o.event_type === 'string'
      ? o.event_type
      : typeof o.eventType === 'string'
        ? o.eventType
        : null;
  const eventId =
    typeof o.event_id === 'string'
      ? o.event_id
      : typeof o.notification_id === 'string'
        ? o.notification_id
        : null;
  const data = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : {};
  if (!eventType || !eventId) return null;
  return {
    event_id: eventId,
    event_type: eventType,
    occurred_at: typeof o.occurred_at === 'string' ? o.occurred_at : undefined,
    data,
  };
}

/** @deprecated use paddleService exports directly */
export {};
