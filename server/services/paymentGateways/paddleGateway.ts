// Paddle payment gateway implementation
import crypto from 'crypto';
import axios from 'axios';
import { BaseGateway, PaymentSession, PaymentConfirmation, WebhookEvent } from './baseGateway.js';

interface PaddleConfig {
  vendorId: string;
  apiKey: string;
  publicKey?: string; // Optional: Only needed for client-side Paddle.js integration
  webhookSecret: string;
  sandbox: boolean;
}

interface PaddleTransaction {
  id: string;
  status: string;
  customer_id?: string;
  currency_code: string;
  totals: {
    total: string;
    subtotal: string;
    tax: string;
    balance: string;
    discount: string;
    grand_total: string;
  };
  items: Array<{
    price_id: string;
    quantity: number;
    price: {
      id: string;
      description: string;
      unit_price: {
        amount: string;
        currency_code: string;
      };
    };
  }>;
  created_at: string;
  updated_at: string;
}

interface PaddleWebhookPayload {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: any;
}

export class PaddleGateway extends BaseGateway {
  private config: PaddleConfig;
  private baseUrl: string;
  private apiUrl: string;

  constructor(config: PaddleConfig) {
    super('paddle', config.sandbox);
    this.config = config;
    this.baseUrl = config.sandbox
      ? 'https://sandbox-vendors.paddle.com'
      : 'https://vendors.paddle.com';
    this.apiUrl = config.sandbox
      ? 'https://sandbox-api.paddle.com'
      : 'https://api.paddle.com';
  }

  /**
   * Create payment session with Paddle
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
      // Paddle uses transaction creation API
      // First, create a price if needed, or use existing price
      // For simplicity, we'll create a transaction directly
      
      const paymentIntentId = `paddle_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
      
      // Convert amount to smallest currency unit (cents/paisa)
      const amountInCents = Math.round(params.amount * 100);
      
      // Create transaction using Paddle API
      const transactionResponse = await axios.post(
        `${this.apiUrl}/transactions`,
        {
          items: [
            {
              price_id: params.metadata?.priceId || null, // If you have pre-configured prices
              description: params.description,
              quantity: 1,
              unit_price: {
                amount: amountInCents.toString(),
                currency_code: params.currency,
              },
            },
          ],
          customer_id: params.metadata?.customerId || null,
          custom_data: {
            payment_id: params.metadata?.paymentId,
            tenant_id: params.metadata?.tenantId,
            license_type: params.metadata?.licenseType,
          },
          checkout: {
            url: params.returnUrl || '',
            cancel_url: params.cancelUrl || '',
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const transaction = transactionResponse.data.data;

      // Get checkout URL
      const checkoutUrl = transaction.checkout?.url || 
                         `${this.baseUrl}/checkout?transaction_id=${transaction.id}`;

      return {
        paymentIntentId: transaction.id,
        checkoutUrl,
        metadata: {
          transactionId: transaction.id,
          paddleTransaction: transaction,
        },
      };
    } catch (error: any) {
      console.error('Paddle payment session creation error:', error.response?.data || error.message);
      
      // Fallback: Create a simple checkout URL
      // In production, you should handle this better
      const paymentIntentId = `paddle_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
      
      // For Paddle, you typically need to create a product/price first
      // This is a simplified version - you may need to adjust based on your Paddle setup
      throw new Error(`Failed to create Paddle payment session: ${error.response?.data?.error?.detail || error.message}`);
    }
  }

  /**
   * Confirm payment (Paddle uses webhook-based flow primarily)
   */
  async confirmPayment(paymentIntentId: string, additionalData?: any): Promise<PaymentConfirmation> {
    try {
      const status = await this.getPaymentStatus(paymentIntentId);
      
      return {
        success: status.status === 'completed',
        transactionId: paymentIntentId,
        status: status.status === 'completed' ? 'completed' : 
                status.status === 'failed' ? 'failed' : 'pending',
        metadata: {
          amount: status.amount,
          currency: status.currency,
        },
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
   * Verify webhook signature from Paddle
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    try {
      // Paddle uses Paddle-Signature header with timestamp and signature
      // Format: ts=timestamp;h1=signature
      const signatureParts = signature.split(';').reduce((acc, part) => {
        const [key, value] = part.split('=');
        if (key && value) {
          acc[key.trim()] = value.trim();
        }
        return acc;
      }, {} as Record<string, string>);

      const timestamp = signatureParts.ts;
      const receivedSignature = signatureParts.h1;

      if (!timestamp || !receivedSignature) {
        return false;
      }

      // Create signed payload
      const payloadString = typeof payload === 'string' ? payload : payload.toString();
      const signedPayload = `${timestamp}:${payloadString}`;

      // Calculate expected signature
      const expectedSignature = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(signedPayload)
        .digest('hex');

      // Constant-time comparison
      return crypto.timingSafeEqual(
        Buffer.from(receivedSignature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('Paddle signature verification error:', error);
      return false;
    }
  }

  /**
   * Parse webhook event from Paddle
   */
  parseWebhookEvent(payload: any): WebhookEvent | null {
    try {
      const event: PaddleWebhookPayload = typeof payload === 'string' 
        ? JSON.parse(payload) 
        : payload;

      if (!event.event_type || !event.data) {
        return null;
      }

      // Map Paddle event types to our status
      let eventStatus = 'pending';
      let paymentIntentId: string | undefined;
      let transactionId: string | undefined;
      let amount: number | undefined;
      let currency: string | undefined;

      // Handle different Paddle event types
      switch (event.event_type) {
        case 'transaction.completed':
          eventStatus = 'completed';
          if (event.data.id) {
            paymentIntentId = event.data.id;
            transactionId = event.data.id;
          }
          if (event.data.totals?.total) {
            amount = parseFloat(event.data.totals.total) / 100; // Convert from cents
          }
          if (event.data.currency_code) {
            currency = event.data.currency_code;
          }
          break;

        case 'transaction.payment_failed':
        case 'transaction.payment_declined':
          eventStatus = 'failed';
          if (event.data.id) {
            paymentIntentId = event.data.id;
            transactionId = event.data.id;
          }
          break;

        case 'transaction.refunded':
          eventStatus = 'completed'; // Refund is a completed action
          if (event.data.id) {
            paymentIntentId = event.data.id;
            transactionId = event.data.id;
          }
          break;

        case 'transaction.created':
        case 'transaction.updated':
          eventStatus = 'pending';
          if (event.data.id) {
            paymentIntentId = event.data.id;
            transactionId = event.data.id;
          }
          if (event.data.status === 'completed') {
            eventStatus = 'completed';
          } else if (event.data.status === 'failed' || event.data.status === 'declined') {
            eventStatus = 'failed';
          }
          if (event.data.totals?.total) {
            amount = parseFloat(event.data.totals.total) / 100;
          }
          if (event.data.currency_code) {
            currency = event.data.currency_code;
          }
          break;

        default:
          // Unknown event type
          return {
            eventType: event.event_type,
            status: 'pending',
            rawPayload: event,
          };
      }

      return {
        eventType: event.event_type,
        transactionId,
        paymentIntentId,
        status: eventStatus,
        amount,
        currency,
        metadata: {
          paddleEventId: event.event_id,
          occurredAt: event.occurred_at,
          rawData: event.data,
        },
        rawPayload: event,
      };
    } catch (error) {
      console.error('Paddle webhook parsing error:', error);
      return null;
    }
  }

  /**
   * Get payment status from Paddle API
   */
  async getPaymentStatus(paymentIntentId: string): Promise<{
    status: string;
    transactionId?: string;
    amount?: number;
    currency?: string;
  }> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/transactions/${paymentIntentId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const transaction: PaddleTransaction = response.data.data;

      // Map Paddle status to our status
      let status = 'pending';
      if (transaction.status === 'completed') {
        status = 'completed';
      } else if (transaction.status === 'failed' || transaction.status === 'declined') {
        status = 'failed';
      }

      return {
        status,
        transactionId: transaction.id,
        amount: parseFloat(transaction.totals.total) / 100, // Convert from cents
        currency: transaction.currency_code,
      };
    } catch (error: any) {
      console.error('Paddle payment status error:', error.response?.data || error.message);
      throw new Error(`Failed to get payment status: ${error.response?.data?.error?.detail || error.message}`);
    }
  }
}
