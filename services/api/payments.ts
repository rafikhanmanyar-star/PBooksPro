// Payments API service
import { apiClient } from './client.js';

export interface PaymentSession {
  paymentId: string;
  paymentIntentId: string;
  checkoutUrl?: string;
  clientSecret?: string;
  amount: number;
  currency: string;
  expiresAt?: Date;
}

export interface PaymentRecord {
  id: string;
  tenant_id: string;
  payment_intent_id: string;
  amount: number;
  currency: string;
  status: string;
  gateway: string;
  license_type: string;
  created_at: Date;
}

export interface CreatePaymentSessionRequest {
  licenseType: 'monthly' | 'yearly';
  currency?: 'PKR' | 'USD';
  moduleKey?: string;
}

export interface PaymentStatus {
  id: string;
  status: string;
  amount: number;
  currency: string;
  createdAt: Date;
  paidAt?: Date;
}

export const paymentsApi = {
  /**
   * Create a payment session for license renewal
   */
  async createPaymentSession(request: CreatePaymentSessionRequest): Promise<PaymentSession> {
    const response = await apiClient.post<{ success: boolean; session: PaymentSession }>(
      '/payments/create-session',
      request
    );
    return response.session;
  },

  /**
   * Confirm payment (for redirect-based flows)
   */
  async confirmPayment(paymentId: string, paymentIntentId: string): Promise<{ success: boolean; status: string }> {
    const response = await apiClient.post<{ success: boolean; status: string }>(
      '/payments/confirm',
      { paymentId, paymentIntentId }
    );
    return response;
  },

  /**
   * Get payment history for current tenant
   */
  async getPaymentHistory(): Promise<PaymentRecord[]> {
    const response = await apiClient.get<{ success: boolean; payments: PaymentRecord[] }>(
      '/payments/history'
    );
    return response.payments;
  },

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    const response = await apiClient.get<{ success: boolean; payment: PaymentStatus }>(
      `/payments/${paymentId}/status`
    );
    return response.payment;
  },
};

