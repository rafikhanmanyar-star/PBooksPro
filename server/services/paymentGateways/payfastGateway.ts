// PayFast payment gateway implementation
import crypto from 'crypto';
import { BaseGateway, PaymentSession, PaymentConfirmation, WebhookEvent } from './baseGateway.js';

interface PayFastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  sandbox: boolean;
}

interface PayFastPaymentRequest {
  merchant_id: string;
  merchant_key: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  name_first: string;
  name_last: string;
  email_address: string;
  cell_number?: string;
  m_payment_id: string;
  amount: string;
  item_name: string;
  custom_str1?: string;
  custom_str2?: string;
  custom_str3?: string;
  custom_str4?: string;
  custom_str5?: string;
  signature?: string;
}

interface PayFastPaymentResponse {
  status: string;
  payment_id: string;
  amount_gross: string;
  amount_fee: string;
  amount_net: string;
  item_name: string;
  item_description?: string;
  custom_str1?: string;
  m_payment_id: string;
  email_address: string;
  name_first: string;
  name_last: string;
  signature?: string;
}

export class PayFastGateway extends BaseGateway {
  private config: PayFastConfig;
  private baseUrl: string;

  constructor(config: PayFastConfig) {
    super('payfast', config.sandbox);
    this.config = config;
    this.baseUrl = config.sandbox
      ? 'https://sandbox.payfast.co.za'
      : 'https://www.payfast.co.za';
  }

  /**
   * Generate PayFast signature
   */
  private generateSignature(params: Record<string, string | undefined>): string {
    // Remove signature and empty values
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (key !== 'signature' && value !== undefined && value !== null && value !== '') {
        filtered[key] = value;
      }
    }

    // Sort alphabetically
    const sortedKeys = Object.keys(filtered).sort();
    const stringToHash = sortedKeys
      .map(key => `${key}=${encodeURIComponent(filtered[key]).replace(/%20/g, '+')}`)
      .join('&');

    // Add passphrase if provided
    const fullString = this.config.passphrase
      ? `${stringToHash}&passphrase=${encodeURIComponent(this.config.passphrase)}`
      : stringToHash;

    return crypto.createHash('md5').update(fullString).digest('hex');
  }

  /**
   * Create payment session with PayFast
   */
  async createPaymentSession(params: {
    amount: number;
    currency: string;
    description: string;
    returnUrl?: string;
    cancelUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<PaymentSession> {
    const paymentIntentId = `pf_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const amount = params.currency === 'USD' ? params.amount : params.amount.toFixed(2);

    // PayFast payment request parameters
    const payfastParams: PayFastPaymentRequest = {
      merchant_id: this.config.merchantId,
      merchant_key: this.config.merchantKey,
      return_url: params.returnUrl || '',
      cancel_url: params.cancelUrl || '',
      notify_url: params.metadata?.webhookUrl || '',
      name_first: params.metadata?.customerName?.split(' ')[0] || 'Customer',
      name_last: params.metadata?.customerName?.split(' ').slice(1).join(' ') || '',
      email_address: params.metadata?.customerEmail || '',
      cell_number: params.metadata?.customerPhone || '',
      m_payment_id: paymentIntentId,
      amount: amount,
      item_name: params.description,
      custom_str1: JSON.stringify(params.metadata || {}),
    };

    // Generate signature
    payfastParams.signature = this.generateSignature(payfastParams);

    // Build form data for redirect
    const formFields = Object.entries(payfastParams)
      .filter(([_, value]) => value !== undefined && value !== '')
      .map(([key, value]) => {
        const encodedValue = encodeURIComponent(value).replace(/%20/g, '+');
        return `<input type="hidden" name="${key}" value="${encodedValue}">`;
      })
      .join('\n');

    // Return payment session with form HTML for redirect
    return {
      paymentIntentId,
      checkoutUrl: this.baseUrl + '/eng/process',
      metadata: {
        formHtml: `<form action="${this.baseUrl}/eng/process" method="post">${formFields}</form>`,
        payfastParams,
      },
    };
  }

  /**
   * Confirm payment (PayFast uses redirect-based flow)
   */
  async confirmPayment(paymentIntentId: string, additionalData?: any): Promise<PaymentConfirmation> {
    // PayFast confirmation happens via webhook, so we just check status
    try {
      const status = await this.getPaymentStatus(paymentIntentId);
      return {
        success: status.status === 'COMPLETE',
        transactionId: status.transactionId,
        status: status.status === 'COMPLETE' ? 'completed' : 'pending',
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
   * Verify webhook signature from PayFast
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    try {
      // PayFast sends ITN (Instant Transaction Notification) with signature in payload
      // Parse the payload and verify signature
      const params: Record<string, string> = {};
      const bodyString = typeof payload === 'string' ? payload : payload.toString();

      // Parse query string format
      const pairs = bodyString.split('&');
      for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key && value) {
          params[key] = decodeURIComponent(value.replace(/\+/g, ' '));
        }
      }

      // Generate expected signature
      const expectedSignature = this.generateSignature(params);
      const receivedSignature = params.signature || signature;

      return expectedSignature.toLowerCase() === receivedSignature.toLowerCase();
    } catch (error) {
      console.error('PayFast signature verification error:', error);
      return false;
    }
  }

  /**
   * Parse webhook event from PayFast
   */
  parseWebhookEvent(payload: any): WebhookEvent | null {
    try {
      // PayFast sends ITN as form-encoded data
      const params = typeof payload === 'string' ? this.parseQueryString(payload) : payload;

      const paymentId = params.payment_id || params.m_payment_id;
      const status = params.payment_status?.toUpperCase() || 'UNKNOWN';

      // Map PayFast status to our status
      let eventStatus = 'pending';
      if (status === 'COMPLETE') {
        eventStatus = 'completed';
      } else if (status === 'FAILED' || status === 'CANCELLED') {
        eventStatus = 'failed';
      }

      return {
        eventType: 'payment.' + eventStatus,
        transactionId: paymentId,
        paymentIntentId: params.m_payment_id,
        status: eventStatus,
        amount: parseFloat(params.amount_gross || params.amount || '0'),
        currency: params.currency || 'PKR',
        metadata: {
          payfast_status: status,
          amount_fee: params.amount_fee,
          amount_net: params.amount_net,
          item_name: params.item_name,
          email_address: params.email_address,
        },
        rawPayload: params,
      };
    } catch (error) {
      console.error('PayFast webhook parsing error:', error);
      return null;
    }
  }

  /**
   * Get payment status from PayFast
   */
  async getPaymentStatus(paymentIntentId: string): Promise<{
    status: string;
    transactionId?: string;
    amount?: number;
    currency?: string;
  }> {
    // PayFast doesn't have a direct status check API for ITN
    // Status is typically received via webhooks
    // This is a placeholder - in production, you'd query your database
    // that was updated by webhooks
    throw new Error('PayFast payment status must be retrieved via webhook callbacks');
  }

  /**
   * Parse query string to object
   */
  private parseQueryString(query: string): Record<string, string> {
    const params: Record<string, string> = {};
    const pairs = query.split('&');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        params[key] = decodeURIComponent(value.replace(/\+/g, ' '));
      }
    }
    return params;
  }
}

