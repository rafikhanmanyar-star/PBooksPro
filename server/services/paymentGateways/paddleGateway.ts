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
    // Declare requestBody outside try block so it's accessible in catch
    let requestBody: any;
    
    try {
      // Convert amount to smallest currency unit (cents/paisa)
      const amountInCents = Math.round(params.amount * 100);
      
      // Build items array - use price_id if provided, otherwise use unit_price
      const priceId = params.metadata?.priceId;
      const items: any[] = [
        {
          description: params.description,
          quantity: 1,
        },
      ];

      // Paddle requires either price_id OR unit_price, not both
      if (priceId) {
        // Use pre-configured price from Paddle
        items[0].price_id = priceId;
      } else {
        // Use ad-hoc pricing
        items[0].unit_price = {
          amount: amountInCents.toString(),
          currency_code: params.currency,
        };
      }

      // Build request body
      requestBody = {
        items,
      };

      // Paddle may require customer information
      // Try to create or use customer if email is available
      if (params.metadata?.customerEmail) {
        // Use customer email - Paddle can create customer on the fly
        requestBody.customer_email = params.metadata.customerEmail;
      } else if (params.metadata?.customerId) {
        // Use existing Paddle customer ID
        requestBody.customer_id = params.metadata.customerId;
      }
      
      // Add customer name if available
      if (params.metadata?.customerName) {
        requestBody.customer_name = params.metadata.customerName;
      }

      // Add custom_data only if we have data
      const customData: any = {};
      if (params.metadata?.paymentId) customData.payment_id = params.metadata.paymentId;
      if (params.metadata?.tenantId) customData.tenant_id = params.metadata.tenantId;
      if (params.metadata?.licenseType) customData.license_type = params.metadata.licenseType;
      
      if (Object.keys(customData).length > 0) {
        requestBody.custom_data = customData;
      }

      // Add checkout redirect URLs only if provided
      // Use success_url/cancel_url so Paddle returns a hosted checkout URL
      if (params.returnUrl || params.cancelUrl) {
        requestBody.checkout = {};
        if (params.returnUrl) requestBody.checkout.success_url = params.returnUrl;
        if (params.cancelUrl) requestBody.checkout.cancel_url = params.cancelUrl;
      }

      // Create transaction using Paddle API
      const transactionResponse = await axios.post(
        `${this.apiUrl}/transactions`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const transaction = transactionResponse.data.data;
      console.log('✅ Paddle transaction created:', {
        id: transaction?.id,
        status: transaction?.status,
        checkoutUrl: transaction?.checkout?.url,
      });

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
      // Enhanced error logging - capture full response
      const errorResponse = error.response;
      const errorDetails = errorResponse?.data || {};
      const errorMessage = errorDetails.error?.detail || 
                          errorDetails.error?.message || 
                          errorDetails.message ||
                          error.message || 
                          'Unknown error';
      
      // Log full error details for debugging
      console.error('Paddle payment session creation error - FULL DETAILS:', {
        message: errorMessage,
        status: errorResponse?.status,
        statusText: errorResponse?.statusText,
        statusCode: errorResponse?.status,
        fullErrorData: JSON.stringify(errorDetails, null, 2),
        errorType: errorDetails.error?.type,
        errorCode: errorDetails.error?.code,
        errorDetail: errorDetails.error?.detail,
        documentationUrl: errorDetails.error?.documentation_url,
        requestId: errorDetails.meta?.request_id,
        url: `${this.apiUrl}/transactions`,
        requestBody: JSON.stringify(requestBody, null, 2),
        headers: {
          hasAuth: !!this.config.apiKey,
          authPrefix: this.config.apiKey?.substring(0, 10) + '...',
        },
      });
      
      // Provide more helpful error message
      let userMessage = `Failed to create Paddle payment session: ${errorMessage}`;
      
      if (errorResponse?.status === 400) {
        // Try to extract more specific error information
        const specificError = errorDetails.error?.detail || errorDetails.error?.message || errorMessage;
        userMessage = `Invalid request to Paddle: ${specificError}. `;
        
        // Add specific guidance based on error code
        if (errorDetails.error?.code === 'invalid_field') {
          userMessage += `Field '${errorDetails.error?.field || 'unknown'}' is invalid. `;
        }
        
        userMessage += `Please check that products and prices are configured correctly in Paddle dashboard. Full error: ${JSON.stringify(errorDetails)}`;
      } else if (errorResponse?.status === 401) {
        userMessage = `Paddle authentication failed. Please verify API key is correct.`;
      } else if (errorResponse?.status === 404) {
        userMessage = `Paddle API endpoint not found. Please verify API URL is correct.`;
      }
      
      throw new Error(userMessage);
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
