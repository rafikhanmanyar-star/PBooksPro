// Paymob payment gateway implementation
import crypto from 'crypto';
import { BaseGateway, PaymentSession, PaymentConfirmation, WebhookEvent } from './baseGateway.js';

interface PaymobConfig {
  apiKey: string;
  integrationId: string;
  sandbox: boolean;
}

interface PaymobAuthResponse {
  token: string;
}

interface PaymobOrderResponse {
  id: number;
  created_at: string;
  delivery_needed: boolean;
  merchant: {
    id: number;
    created_at: string;
    emails: string[];
    company_emails: string[];
    company_name: string;
    country: string;
    state: string;
    city: string;
    postal_code: string;
    street: string;
  };
  collector: any;
  amount_cents: number;
  shipping_data: any;
  currency: string;
  is_payment_locked: boolean;
  is_return: boolean;
  is_cancel: boolean;
  is_returned: boolean;
  is_canceled: boolean;
  merchant_order_id: string;
  wallet_notification: any;
  paid_amount_cents: number;
  notify_user_with_email: boolean;
  items: any[];
  order_url: string;
  commission_fees: number;
  delivery_fees: number;
  delivery_vat_cents: number;
  payment_method: string;
  merchant_staff_tag: any;
  api_source: string;
  shipping_details: any;
}

interface PaymobPaymentKeyResponse {
  token: string;
}

export class PaymobGateway extends BaseGateway {
  private config: PaymobConfig;
  private baseUrl: string;
  private authToken: string | null = null;
  private authTokenExpiry: number = 0;

  constructor(config: PaymobConfig) {
    super('paymob', config.sandbox);
    this.config = config;
    this.baseUrl = config.sandbox
      ? 'https://accept.paymob.com/api'
      : 'https://accept.paymob.com/api';
  }

  /**
   * Authenticate with Paymob API and get auth token
   */
  private async authenticate(): Promise<string> {
    // Check if token is still valid (cache for 24 hours)
    if (this.authToken && Date.now() < this.authTokenExpiry) {
      return this.authToken;
    }

    try {
      const response = await fetch(`${this.baseUrl}/auth/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.config.apiKey,
        }),
      });

      if (!response.ok) {
        throw new Error(`Paymob authentication failed: ${response.statusText}`);
      }

      const data: PaymobAuthResponse = await response.json();
      this.authToken = data.token;
      this.authTokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      return this.authToken;
    } catch (error) {
      console.error('Paymob authentication error:', error);
      throw new Error('Failed to authenticate with Paymob');
    }
  }

  /**
   * Create payment session with Paymob
   */
  async createPaymentSession(params: {
    amount: number;
    currency: string;
    description: string;
    returnUrl?: string;
    cancelUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<PaymentSession> {
    try {
      const token = await this.authenticate();
      const paymentIntentId = `pm_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

      // Convert amount to cents (Paymob uses cents)
      const amountCents = Math.round(
        (params.currency === 'USD' ? params.amount : params.amount) * 100
      );

      // Create order
      const orderResponse = await fetch(`${this.baseUrl}/ecommerce/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          auth_token: token,
          delivery_needed: false,
          amount_cents: amountCents,
          currency: params.currency === 'USD' ? 'USD' : 'EGP', // Paymob uses EGP, but we'll handle PKR conversion
          merchant_order_id: paymentIntentId,
          items: [
            {
              name: params.description,
              amount_cents: amountCents,
              description: params.description,
              quantity: 1,
            },
          ],
        }),
      });

      if (!orderResponse.ok) {
        throw new Error(`Paymob order creation failed: ${orderResponse.statusText}`);
      }

      const order: PaymobOrderResponse = await orderResponse.json();

      // Create payment key
      const paymentKeyResponse = await fetch(`${this.baseUrl}/acceptance/payment_keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          auth_token: token,
          amount_cents: amountCents,
          expiration: 3600, // 1 hour
          order_id: order.id,
          billing_data: {
            apartment: 'NA',
            email: params.metadata?.customerEmail || '',
            floor: 'NA',
            first_name: params.metadata?.customerName?.split(' ')[0] || 'Customer',
            street: 'NA',
            building: 'NA',
            phone_number: params.metadata?.customerPhone || '+923000000000',
            shipping_method: 'NA',
            postal_code: 'NA',
            city: 'NA',
            country: 'PK',
            last_name: params.metadata?.customerName?.split(' ').slice(1).join(' ') || '',
            state: 'NA',
          },
          currency: params.currency === 'USD' ? 'USD' : 'EGP',
          integration_id: parseInt(this.config.integrationId),
        }),
      });

      if (!paymentKeyResponse.ok) {
        throw new Error(`Paymob payment key creation failed: ${paymentKeyResponse.statusText}`);
      }

      const paymentKey: PaymobPaymentKeyResponse = await paymentKeyResponse.json();

      // Build checkout URL
      const checkoutUrl = `https://accept.paymob.com/api/acceptance/iframes/${this.config.integrationId}?payment_token=${paymentKey.token}`;

      return {
        paymentIntentId,
        checkoutUrl,
        clientSecret: paymentKey.token,
        metadata: {
          orderId: order.id.toString(),
          amountCents,
        },
      };
    } catch (error) {
      console.error('Paymob payment session creation error:', error);
      throw error;
    }
  }

  /**
   * Confirm payment
   */
  async confirmPayment(paymentIntentId: string, additionalData?: any): Promise<PaymentConfirmation> {
    try {
      const status = await this.getPaymentStatus(paymentIntentId);
      return {
        success: status.status === 'success',
        transactionId: status.transactionId,
        status: status.status === 'success' ? 'completed' : 'pending',
      };
    } catch (error) {
      return {
        success: false,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Payment confirmation failed',
      };
    }
  }

  /**
   * Verify webhook signature from Paymob
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    try {
      // Paymob sends HMAC signature in 'hmac' field
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      const receivedHmac = data.hmac || signature;

      // Generate expected HMAC
      // Paymob uses SHA512 HMAC of the order data
      // This is a simplified version - actual implementation depends on Paymob's documentation
      const dataString = JSON.stringify(data);
      const expectedHmac = crypto
        .createHmac('sha512', this.config.apiKey)
        .update(dataString)
        .digest('hex');

      return expectedHmac.toLowerCase() === receivedHmac.toLowerCase();
    } catch (error) {
      console.error('Paymob signature verification error:', error);
      return false;
    }
  }

  /**
   * Parse webhook event from Paymob
   */
  parseWebhookEvent(payload: any): WebhookEvent | null {
    try {
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;

      // Paymob webhook structure
      const transactionId = data.obj?.id?.toString();
      const orderId = data.obj?.order?.id?.toString();
      const amount = data.obj?.amount_cents ? data.obj.amount_cents / 100 : 0;
      const status = data.obj?.success ? 'completed' : 'failed';

      return {
        eventType: `payment.${status}`,
        transactionId,
        paymentIntentId: orderId,
        status,
        amount,
        currency: data.obj?.currency || 'PKR',
        metadata: {
          paymob_order_id: orderId,
          paymob_transaction_id: transactionId,
          payment_method: data.obj?.source_data?.type,
        },
        rawPayload: data,
      };
    } catch (error) {
      console.error('Paymob webhook parsing error:', error);
      return null;
    }
  }

  /**
   * Get payment status from Paymob
   */
  async getPaymentStatus(paymentIntentId: string): Promise<{
    status: string;
    transactionId?: string;
    amount?: number;
    currency?: string;
  }> {
    try {
      const token = await this.authenticate();
      
      // Extract order ID from payment intent ID
      // This assumes paymentIntentId format contains order ID
      const orderId = paymentIntentId.split('_')[1];

      const response = await fetch(`${this.baseUrl}/ecommerce/orders/${orderId}/transactions`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Paymob status check failed: ${response.statusText}`);
      }

      const transactions = await response.json();

      if (transactions.length > 0) {
        const transaction = transactions[0];
        return {
          status: transaction.success ? 'success' : 'failed',
          transactionId: transaction.id?.toString(),
          amount: transaction.amount_cents ? transaction.amount_cents / 100 : undefined,
          currency: transaction.currency || 'PKR',
        };
      }

      return {
        status: 'pending',
      };
    } catch (error) {
      console.error('Paymob status check error:', error);
      throw error;
    }
  }
}

