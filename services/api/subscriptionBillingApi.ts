import { apiClient } from './client';

export type BillingPlan = {
  id: string;
  plan_code: string;
  name: string;
  description: string;
  monthly_price: string;
  annual_price: string;
  max_users: number;
  max_projects: number;
  max_storage_gb: number;
  features_json: Record<string, unknown>;
  is_active: boolean;
};

export type Subscription = {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: string;
  billing_cycle: string;
  start_date: string;
  renewal_date: string | null;
  trial_end_date: string | null;
  plan_code?: string;
  plan_name?: string;
  cancel_at_period_end?: boolean;
};

export type SubscriptionInvoice = {
  id: string;
  invoice_number: string;
  amount: string;
  currency: string;
  status: string;
  invoice_date: string;
  paid_date: string | null;
};

export type BillingCustomer = {
  id: string;
  tenant_id: string;
  paddle_customer_id: string | null;
  email: string;
  name: string | null;
};

export type CheckoutResult = {
  checkout: {
    transactionId: string;
    checkoutUrl: string;
    amount: number;
    currency: string;
    mock: boolean;
  };
};

export type LicenseWarning = {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
};

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
  paymentStatus: 'valid' | 'past_due' | 'canceled' | 'trialing' | 'none';
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
  warnings: LicenseWarning[];
};

export type PaddlePortalSession = {
  overviewUrl: string;
  cancelSubscriptionUrl: string | null;
  updatePaymentMethodUrl: string | null;
  mock: boolean;
};

export type LicenseEnforcement = {
  allowed: boolean;
  isValid: boolean;
  daysRemaining: number;
  licenseType: string;
  licenseStatus: string;
  isExpired: boolean;
  expiryDate: string | null;
  tenantActive: boolean;
  paymentValid: boolean;
  modules: string[];
  warnings: LicenseWarning[];
  blockReasons: string[];
  gracePeriodDays?: number;
  gracePeriodEndsAt?: string | null;
  inGracePeriod?: boolean;
  subscription?: {
    id: string;
    planCode: string;
    planName: string;
    billingCycle: string;
    status: string;
    renewalDate: string | null;
    trialEndDate: string | null;
    cancelAtPeriodEnd: boolean;
  };
  usage?: {
    current: { usersCount: number; projectsCount: number; storageGb: number };
    limits: { maxUsers: number; maxProjects: number; maxStorageGb: number };
    withinLimits: boolean;
    violations: string[];
    usersPercent: number;
    projectsPercent: number;
  };
};

export const subscriptionBillingApi = {
  async getPortal(): Promise<BillingPortalSummary> {
    return apiClient.get('/billing/portal');
  },

  async createPortalSession(): Promise<{ session: PaddlePortalSession }> {
    return apiClient.post('/billing/portal/session', {});
  },

  async getBillingInformation(): Promise<{ customer: BillingCustomer | null }> {
    return apiClient.get('/billing/information');
  },

  async updateBillingInformation(email: string, name?: string): Promise<{ customer: BillingCustomer }> {
    return apiClient.put('/billing/information', { email, name });
  },

  async getUsageDashboard(): Promise<{
    current: PortalUsage | null;
    history: Array<{
      metric_date: string;
      users_count: number;
      projects_count: number;
      storage_bytes: string;
    }>;
  }> {
    return apiClient.get('/billing/usage/dashboard');
  },

  async getEnforcement(): Promise<LicenseEnforcement> {
    return apiClient.get('/billing/enforcement');
  },

  async listPlans(): Promise<{ items: BillingPlan[]; count: number }> {
    return apiClient.get('/billing/plans');
  },

  async createCustomer(email: string, name?: string): Promise<{ customer: BillingCustomer }> {
    return apiClient.post('/billing/customer/create', { email, name });
  },

  async getSubscription(): Promise<{ subscription: Subscription | null; license: unknown }> {
    return apiClient.get('/billing/subscription');
  },

  async checkout(
    planCode: string,
    billingCycle: 'monthly' | 'annual',
    options?: {
      email?: string;
      name?: string;
      legalAcceptances?: Array<{ documentType: string; documentVersion: string }>;
    }
  ): Promise<CheckoutResult> {
    return apiClient.post('/billing/checkout', {
      planCode,
      billingCycle,
      email: options?.email,
      name: options?.name,
      legalAcceptances: options?.legalAcceptances,
    });
  },

  async changePlan(
    planCode: string,
    options?: { billingCycle?: 'monthly' | 'annual'; atPeriodEnd?: boolean }
  ): Promise<Subscription> {
    return apiClient.post('/billing/subscription/change-plan', {
      planCode,
      billingCycle: options?.billingCycle,
      atPeriodEnd: options?.atPeriodEnd,
    });
  },

  async cancel(atPeriodEnd = true): Promise<Subscription> {
    return apiClient.post('/billing/subscription/cancel', { atPeriodEnd });
  },

  async reactivate(): Promise<Subscription> {
    return apiClient.post('/billing/subscription/reactivate', {});
  },

  async listInvoices(): Promise<{ items: SubscriptionInvoice[]; count: number }> {
    return apiClient.get('/billing/invoices');
  },

  async getUsage(): Promise<{ current: unknown; history: unknown[] }> {
    return apiClient.get('/billing/usage');
  },

  async listEvents(): Promise<{ items: unknown[]; count: number }> {
    return apiClient.get('/billing/events');
  },
};
