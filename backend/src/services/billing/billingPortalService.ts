/**
 * Customer billing portal — aggregated subscription, usage, and Paddle portal data.
 */

import type pg from 'pg';
import { getActiveSubscription } from './subscriptionService.js';
import { getBillingPlanById, isUnlimited } from './billingPlanService.js';
import { validateTenantLicense } from './licenseEnforcementService.js';
import {
  getTenantUsageStatus,
  listUsageHistory,
  recordUsageSnapshot,
  type UsageStatus,
} from './subscriptionUsageService.js';
import { listInvoicesForTenant } from './subscriptionInvoiceService.js';
import { getBillingCustomerByTenant } from './paddleCustomerService.js';
import { createPaddleCustomerPortalSession } from './paddleService.js';

export type PaymentStatus = 'valid' | 'past_due' | 'canceled' | 'trialing' | 'none';

export type PortalUsage = {
  usersCount: number;
  projectsCount: number;
  storageGb: number;
  maxUsers: number;
  maxProjects: number;
  maxStorageGb: number;
  usersPercent: number;
  projectsPercent: number;
  storagePercent: number;
  withinLimits: boolean;
};

export type BillingPortalSummary = {
  currentPlan: {
    code: string;
    name: string;
    billingCycle: string;
    status: string;
  } | null;
  renewalDate: string | null;
  paymentStatus: PaymentStatus;
  paymentStatusLabel: string;
  daysRemaining: number;
  cancelAtPeriodEnd: boolean;
  paddleSubscriptionId: string | null;
  usage: PortalUsage | null;
  customer: {
    email: string;
    name: string | null;
    paddleCustomerId: string | null;
  } | null;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    amount: string;
    currency: string;
    status: string;
    invoiceDate: string;
  }>;
  warnings: Array<{ code: string; severity: string; message: string }>;
};

function usagePercent(current: number, max: number): number {
  if (isUnlimited(max) || max <= 0) return 0;
  return Math.min(100, Math.round((current / max) * 100));
}

export function mapSubscriptionToPaymentStatus(status: string | undefined): PaymentStatus {
  if (!status) return 'none';
  switch (status) {
    case 'active':
      return 'valid';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'expired':
      return 'canceled';
    default:
      return 'none';
  }
}

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'valid':
      return 'Paid & current';
    case 'trialing':
      return 'Trial active';
    case 'past_due':
      return 'Payment past due';
    case 'canceled':
      return 'Canceled';
    default:
      return 'No subscription';
  }
}

export function buildPortalUsage(usage: UsageStatus): PortalUsage {
  return {
    usersCount: usage.current.usersCount,
    projectsCount: usage.current.projectsCount,
    storageGb: Math.round(usage.current.storageGb * 100) / 100,
    maxUsers: usage.limits.maxUsers,
    maxProjects: usage.limits.maxProjects,
    maxStorageGb: usage.limits.maxStorageGb,
    usersPercent: usagePercent(usage.current.usersCount, usage.limits.maxUsers),
    projectsPercent: usagePercent(usage.current.projectsCount, usage.limits.maxProjects),
    storagePercent: usagePercent(usage.current.storageGb, usage.limits.maxStorageGb),
    withinLimits: usage.withinLimits,
  };
}

export async function getBillingPortalSummary(
  client: pg.PoolClient,
  tenantId: string
): Promise<BillingPortalSummary> {
  await recordUsageSnapshot(client, tenantId);

  const [sub, license, usageStatus, customer, invoices] = await Promise.all([
    getActiveSubscription(client, tenantId),
    validateTenantLicense(client, tenantId),
    getTenantUsageStatus(client, tenantId),
    getBillingCustomerByTenant(client, tenantId),
    listInvoicesForTenant(client, tenantId, 5),
  ]);

  const plan = sub ? await getBillingPlanById(client, sub.plan_id) : null;
  const paymentStatus = mapSubscriptionToPaymentStatus(sub?.status);

  return {
    currentPlan: sub
      ? {
          code: sub.plan_code ?? plan?.plan_code ?? '',
          name: sub.plan_name ?? plan?.name ?? '',
          billingCycle: sub.billing_cycle,
          status: sub.status,
        }
      : null,
    renewalDate:
      sub?.status === 'trialing' ? sub.trial_end_date : sub?.renewal_date ?? license.expiryDate,
    paymentStatus,
    paymentStatusLabel: paymentStatusLabel(paymentStatus),
    daysRemaining: license.daysRemaining,
    cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
    paddleSubscriptionId: sub?.paddle_subscription_id ?? null,
    usage: usageStatus ? buildPortalUsage(usageStatus) : null,
    customer: customer
      ? {
          email: customer.email,
          name: customer.name,
          paddleCustomerId: customer.paddle_customer_id,
        }
      : null,
    recentInvoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      amount: inv.amount,
      currency: inv.currency,
      status: inv.status,
      invoiceDate: inv.invoice_date,
    })),
    warnings: license.warnings.map((w) => ({
      code: w.code,
      severity: w.severity,
      message: w.message,
    })),
  };
}

export async function createCustomerPortalSession(
  client: pg.PoolClient,
  tenantId: string
): Promise<{
  overviewUrl: string;
  cancelSubscriptionUrl: string | null;
  updatePaymentMethodUrl: string | null;
  mock: boolean;
}> {
  const sub = await getActiveSubscription(client, tenantId);
  const customer = await getBillingCustomerByTenant(client, tenantId);

  if (!customer?.paddle_customer_id) {
    throw new Error('Billing customer not configured. Add billing information first.');
  }

  const session = await createPaddleCustomerPortalSession({
    paddleCustomerId: customer.paddle_customer_id,
    paddleSubscriptionId: sub?.paddle_subscription_id ?? null,
  });

  return {
    overviewUrl: session.overviewUrl,
    cancelSubscriptionUrl: session.cancelSubscriptionUrl,
    updatePaymentMethodUrl: session.updatePaymentMethodUrl,
    mock: session.mock,
  };
}

export async function getUsageDashboard(
  client: pg.PoolClient,
  tenantId: string
): Promise<{ current: PortalUsage | null; history: Awaited<ReturnType<typeof listUsageHistory>> }> {
  await recordUsageSnapshot(client, tenantId);
  const usageStatus = await getTenantUsageStatus(client, tenantId);
  const history = await listUsageHistory(client, tenantId);
  return {
    current: usageStatus ? buildPortalUsage(usageStatus) : null,
    history,
  };
}
