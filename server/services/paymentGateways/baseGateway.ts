// Base abstract class for payment gateway implementations

export interface PaymentSession {
  paymentIntentId: string;
  checkoutUrl?: string;
  clientSecret?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface PaymentConfirmation {
  success: boolean;
  transactionId?: string;
  status: 'completed' | 'failed' | 'pending';
  message?: string;
  metadata?: Record<string, any>;
}

export interface WebhookEvent {
  eventType: string;
  transactionId?: string;
  paymentIntentId?: string;
  status: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, any>;
  rawPayload: any;
}

export abstract class BaseGateway {
  protected gatewayName: string;
  protected sandbox: boolean;

  constructor(gatewayName: string, sandbox: boolean = false) {
    this.gatewayName = gatewayName;
    this.sandbox = sandbox;
  }

  /**
   * Create a payment session/intent
   */
  abstract createPaymentSession(params: {
    amount: number;
    currency: string;
    description: string;
    returnUrl?: string;
    cancelUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<PaymentSession>;

  /**
   * Confirm a payment (for redirect-based flows)
   */
  abstract confirmPayment(paymentIntentId: string, additionalData?: any): Promise<PaymentConfirmation>;

  /**
   * Verify webhook signature
   */
  abstract verifyWebhookSignature(payload: string | Buffer, signature: string): boolean;

  /**
   * Parse webhook event
   */
  abstract parseWebhookEvent(payload: any): WebhookEvent | null;

  /**
   * Get payment status
   */
  abstract getPaymentStatus(paymentIntentId: string): Promise<{
    status: string;
    transactionId?: string;
    amount?: number;
    currency?: string;
  }>;

  /**
   * Get gateway name
   */
  getName(): string {
    return this.gatewayName;
  }

  /**
   * Check if in sandbox mode
   */
  isSandbox(): boolean {
    return this.sandbox;
  }
}

