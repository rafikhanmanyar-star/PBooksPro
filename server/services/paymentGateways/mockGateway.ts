// Mock payment gateway for testing and development
// Simulates payment gateway behavior without requiring real credentials
import crypto from 'crypto';
import { BaseGateway, PaymentSession, PaymentConfirmation, WebhookEvent } from './baseGateway.js';

interface MockPaymentRecord {
  paymentIntentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  amount: number;
  currency: string;
  createdAt: Date;
  completedAt?: Date;
}

export class MockGateway extends BaseGateway {
  private payments: Map<string, MockPaymentRecord> = new Map();
  private autoCompleteDelay: number; // milliseconds to wait before auto-completing
  private successRate: number; // 0.0 to 1.0 (e.g., 0.8 = 80% success rate)

  constructor(
    autoCompleteDelay: number = 3000, // 3 seconds default
    successRate: number = 1.0 // 100% success by default
  ) {
    super('mock', true); // Always in sandbox mode
    this.autoCompleteDelay = autoCompleteDelay;
    this.successRate = Math.max(0, Math.min(1, successRate)); // Clamp between 0 and 1
  }

  /**
   * Create a payment session with mock gateway
   */
  async createPaymentSession(params: {
    amount: number;
    currency: string;
    description: string;
    returnUrl?: string;
    cancelUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<PaymentSession> {
    const paymentIntentId = `mock_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    // Store payment record
    const paymentRecord: MockPaymentRecord = {
      paymentIntentId,
      status: 'pending',
      amount: params.amount,
      currency: params.currency,
      createdAt: new Date(),
    };

    this.payments.set(paymentIntentId, paymentRecord);

    // Simulate payment processing with auto-completion
    // Note: Webhook will be triggered automatically by the payment service
    setTimeout(() => {
      this.simulatePaymentCompletion(paymentIntentId);
    }, this.autoCompleteDelay);

    // Return checkout URL that simulates payment page
    const checkoutUrl = `/mock-payment?payment_intent=${paymentIntentId}&return_url=${encodeURIComponent(params.returnUrl || '')}`;

    return {
      paymentIntentId,
      checkoutUrl,
      clientSecret: `mock_secret_${paymentIntentId}`,
      metadata: {
        mockGateway: true,
        autoCompleteDelay: this.autoCompleteDelay,
      },
    };
  }

  /**
   * Simulate payment completion (success or failure based on success rate)
   */
  private async simulatePaymentCompletion(paymentIntentId: string): Promise<void> {
    const payment = this.payments.get(paymentIntentId);
    if (!payment || payment.status !== 'pending') {
      return;
    }

    // Update status to processing
    payment.status = 'processing';
    this.payments.set(paymentIntentId, payment);

    // Simulate success/failure based on success rate
    const shouldSucceed = Math.random() < this.successRate;

    setTimeout(() => {
      const updatedPayment = this.payments.get(paymentIntentId);
      if (updatedPayment) {
        updatedPayment.status = shouldSucceed ? 'completed' : 'failed';
        updatedPayment.completedAt = new Date();
        this.payments.set(paymentIntentId, updatedPayment);
      }
    }, 1000); // 1 second processing time
  }

  /**
   * Confirm payment (for mock gateway, just check status)
   */
  async confirmPayment(paymentIntentId: string, additionalData?: any): Promise<PaymentConfirmation> {
    const payment = this.payments.get(paymentIntentId);

    if (!payment) {
      return {
        success: false,
        status: 'failed',
        message: 'Payment not found',
      };
    }

    const success = payment.status === 'completed';
    return {
      success,
      transactionId: paymentIntentId.replace('mock_', 'txn_'),
      status: payment.status === 'completed' ? 'completed' : payment.status === 'failed' ? 'failed' : 'pending',
      message: success ? 'Payment successful' : payment.status === 'failed' ? 'Payment failed' : 'Payment pending',
    };
  }

  /**
   * Verify webhook signature (mock always returns true)
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    // Mock gateway always accepts signatures for testing
    return true;
  }

  /**
   * Parse webhook event from mock gateway
   */
  parseWebhookEvent(payload: any): WebhookEvent | null {
    try {
      const paymentIntentId = payload.payment_intent_id || payload.paymentIntentId || payload.m_payment_id;

      if (!paymentIntentId) {
        return null;
      }

      const payment = this.payments.get(paymentIntentId);
      if (!payment) {
        return null;
      }

      const status = payment.status === 'completed' ? 'completed' : payment.status === 'failed' ? 'failed' : 'pending';

      return {
        eventType: `payment.${status}`,
        transactionId: paymentIntentId.replace('mock_', 'txn_'),
        paymentIntentId,
        status,
        amount: payment.amount,
        currency: payment.currency,
        message: payment.status === 'completed' ? 'Mock payment successful' : payment.status === 'failed' ? 'Mock payment failed' : undefined,
        metadata: {
          mockGateway: true,
          simulatedAt: payment.completedAt || payment.createdAt,
        },
        rawPayload: payload,
      };
    } catch (error) {
      console.error('Mock gateway webhook parsing error:', error);
      return null;
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentIntentId: string): Promise<{
    status: string;
    transactionId?: string;
    amount?: number;
    currency?: string;
  }> {
    const payment = this.payments.get(paymentIntentId);

    if (!payment) {
      return {
        status: 'not_found',
      };
    }

    return {
      status: payment.status === 'completed' ? 'success' : payment.status === 'failed' ? 'failed' : 'pending',
      transactionId: paymentIntentId.replace('mock_', 'txn_'),
      amount: payment.amount,
      currency: payment.currency,
    };
  }

  /**
   * Manually trigger a webhook event (useful for testing)
   */
  async triggerWebhook(paymentIntentId: string, status: 'completed' | 'failed' = 'completed'): Promise<WebhookEvent> {
    const payment = this.payments.get(paymentIntentId);
    if (!payment) {
      throw new Error('Payment not found');
    }

    payment.status = status;
    payment.completedAt = new Date();
    this.payments.set(paymentIntentId, payment);

    return {
      eventType: `payment.${status}`,
      transactionId: paymentIntentId.replace('mock_', 'txn_'),
      paymentIntentId,
      status,
      amount: payment.amount,
      currency: payment.currency,
      message: status === 'completed' ? 'Mock payment successful' : 'Mock payment failed',
      metadata: {
        mockGateway: true,
        manuallyTriggered: true,
      },
      rawPayload: {
        payment_intent_id: paymentIntentId,
        status,
        amount: payment.amount,
        currency: payment.currency,
      },
    };
  }

  /**
   * Get all mock payments (for testing/debugging)
   */
  getAllPayments(): MockPaymentRecord[] {
    return Array.from(this.payments.values());
  }

  /**
   * Clear all mock payments (for testing)
   */
  clearPayments(): void {
    this.payments.clear();
  }
}

