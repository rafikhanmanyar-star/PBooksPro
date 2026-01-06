// Payment service for handling license renewal payments
import crypto from 'crypto';
import { DatabaseService } from './databaseService.js';
import { LicenseService } from './licenseService.js';
import { createGateway, BaseGateway } from './paymentGateways/gatewayFactory.js';
import { getPricing, getLicenseDurationMonths } from '../config/pricing.js';

export interface PaymentSessionRequest {
  tenantId: string;
  licenseType: 'monthly' | 'yearly';
  currency?: 'PKR' | 'USD';
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PaymentSessionResponse {
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

export class PaymentService {
  private db: DatabaseService;
  private licenseService: LicenseService;
  private gateway: BaseGateway;

  constructor(db: DatabaseService) {
    this.db = db;
    this.licenseService = new LicenseService(db);
    this.gateway = createGateway();
  }

  /**
   * Create a payment session for license renewal
   */
  async createPaymentSession(request: PaymentSessionRequest): Promise<PaymentSessionResponse> {
    // Get tenant info
    const tenants = await this.db.query(
      'SELECT id, name, email, subscription_tier FROM tenants WHERE id = $1',
      [request.tenantId]
    );

    if (tenants.length === 0) {
      throw new Error('Tenant not found');
    }

    const tenant = tenants[0];
    const currency = request.currency || 'PKR';
    const subscriptionTier = tenant.subscription_tier || 'free';

    // Calculate amount
    const amount = getPricing(subscriptionTier, request.licenseType, currency);
    const durationMonths = getLicenseDurationMonths(request.licenseType);

    // Generate payment ID
    const paymentId = `payment_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    // Get server URL for gateway (needed for mock gateway to construct full URLs)
    const serverUrl = process.env.API_URL || 
                     process.env.SERVER_URL || 
                     process.env.API_BASE_URL || 
                     'http://localhost:3000';

    // Create payment session with gateway
    const session = await this.gateway.createPaymentSession({
      amount,
      currency,
      description: `License Renewal - ${request.licenseType} (${durationMonths} month${durationMonths > 1 ? 's' : ''})`,
      returnUrl: request.returnUrl,
      cancelUrl: request.cancelUrl,
      metadata: {
        paymentId,
        tenantId: request.tenantId,
        licenseType: request.licenseType,
        customerName: tenant.name,
        customerEmail: tenant.email,
        serverUrl, // Pass server URL for mock gateway
        webhookUrl: `${serverUrl}/api/payments/webhook/${this.gateway.getName()}`,
      },
    });

    // Create payment record in database
    await this.db.query(
      `INSERT INTO payments (
        id, tenant_id, payment_intent_id, amount, currency, status,
        gateway, license_type, license_duration_months, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        paymentId,
        request.tenantId,
        session.paymentIntentId,
        amount,
        currency,
        'pending',
        this.gateway.getName(),
        request.licenseType,
        durationMonths,
        JSON.stringify(session.metadata || {}),
      ]
    );

    return {
      paymentId,
      paymentIntentId: session.paymentIntentId,
      checkoutUrl: session.checkoutUrl,
      clientSecret: session.clientSecret,
      amount,
      currency,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Process successful payment and renew license
   */
  async processSuccessfulPayment(paymentId: string): Promise<void> {
    // Get payment record
    const payments = await this.db.query(
      'SELECT * FROM payments WHERE id = $1',
      [paymentId]
    );

    if (payments.length === 0) {
      throw new Error('Payment not found');
    }

    const payment = payments[0];

    // Check if already processed
    if (payment.status === 'completed') {
      console.log(`Payment ${paymentId} already processed`);
      return;
    }

    // Update payment status
    await this.db.query(
      `UPDATE payments 
       SET status = 'completed', paid_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [paymentId]
    );

    // Renew license with payment tracking
    const success = await this.licenseService.renewLicenseWithPayment(
      payment.tenant_id,
      payment.license_type as 'monthly' | 'yearly',
      paymentId
    );

    if (!success) {
      throw new Error('License renewal failed');
    }

    console.log(`Payment ${paymentId} processed successfully, license renewed for tenant ${payment.tenant_id}`);
  }

  /**
   * Process failed payment
   */
  async processFailedPayment(paymentId: string, reason?: string): Promise<void> {
    await this.db.query(
      `UPDATE payments 
       SET status = 'failed', updated_at = NOW(),
       metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [paymentId, JSON.stringify({ failureReason: reason || 'Payment failed' })]
    );
  }

  /**
   * Handle webhook event from payment gateway
   */
  async handleWebhook(gateway: string, payload: any, signature?: string): Promise<void> {
    const webhookId = `webhook_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    // Log webhook
    await this.db.query(
      `INSERT INTO payment_webhooks (id, gateway, event_type, payload, signature, processed)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        webhookId,
        gateway,
        payload.type || 'unknown',
        JSON.stringify(payload),
        signature || null,
        false,
      ]
    );

    // Verify signature
    if (signature) {
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      if (!this.gateway.verifyWebhookSignature(payloadString, signature)) {
        console.error(`Invalid webhook signature for ${webhookId}`);
        await this.db.query(
          `UPDATE payment_webhooks SET processed = true, error_message = $1 WHERE id = $2`,
          ['Invalid signature', webhookId]
        );
        return;
      }
    }

    // Parse webhook event
    const event = this.gateway.parseWebhookEvent(payload);
    if (!event) {
      console.error(`Failed to parse webhook event for ${webhookId}`);
      await this.db.query(
        `UPDATE payment_webhooks SET processed = true, error_message = $1 WHERE id = $2`,
        ['Failed to parse event', webhookId]
      );
      return;
    }

    // Find payment by payment intent ID
    const payments = await this.db.query(
      'SELECT * FROM payments WHERE payment_intent_id = $1',
      [event.paymentIntentId]
    );

    if (payments.length === 0) {
      console.error(`Payment not found for intent ID: ${event.paymentIntentId}`);
      await this.db.query(
        `UPDATE payment_webhooks SET processed = true, error_message = $1 WHERE id = $2`,
        ['Payment not found', webhookId]
      );
      return;
    }

    const payment = payments[0];

    // Process based on event type
    if (event.status === 'completed') {
      await this.processSuccessfulPayment(payment.id);
    } else if (event.status === 'failed') {
      await this.processFailedPayment(payment.id, event.message || 'Payment failed');
    } else {
      // Update status for pending/processing
      await this.db.query(
        `UPDATE payments 
         SET status = $1, gateway_transaction_id = COALESCE($2, gateway_transaction_id), updated_at = NOW()
         WHERE id = $3`,
        [event.status === 'pending' ? 'pending' : 'processing', event.transactionId, payment.id]
      );
    }

    // Mark webhook as processed
    await this.db.query(
      `UPDATE payment_webhooks SET processed = true WHERE id = $1`,
      [webhookId]
    );
  }

  /**
   * Get payment history for a tenant
   */
  async getPaymentHistory(tenantId: string): Promise<PaymentRecord[]> {
    const payments = await this.db.query(
      `SELECT id, tenant_id, payment_intent_id, amount, currency, status,
              gateway, license_type, created_at, paid_at
       FROM payments 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC
       LIMIT 100`,
      [tenantId]
    );

    return payments.map((p: any) => ({
      id: p.id,
      tenant_id: p.tenant_id,
      payment_intent_id: p.payment_intent_id,
      amount: parseFloat(p.amount),
      currency: p.currency,
      status: p.status,
      gateway: p.gateway,
      license_type: p.license_type,
      created_at: p.created_at,
    }));
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId: string): Promise<{
    id: string;
    status: string;
    amount: number;
    currency: string;
    createdAt: Date;
    paidAt?: Date;
  }> {
    const payments = await this.db.query(
      'SELECT * FROM payments WHERE id = $1',
      [paymentId]
    );

    if (payments.length === 0) {
      throw new Error('Payment not found');
    }

    const payment = payments[0];
    return {
      id: payment.id,
      status: payment.status,
      amount: parseFloat(payment.amount),
      currency: payment.currency,
      createdAt: payment.created_at,
      paidAt: payment.paid_at,
    };
  }

  /**
   * Confirm payment (for redirect-based flows)
   */
  async confirmPayment(paymentId: string, paymentIntentId: string): Promise<{
    success: boolean;
    status: string;
  }> {
    const payments = await this.db.query(
      'SELECT * FROM payments WHERE id = $1 AND payment_intent_id = $2',
      [paymentId, paymentIntentId]
    );

    if (payments.length === 0) {
      throw new Error('Payment not found');
    }

    const payment = payments[0];

    // Check status with gateway
    const confirmation = await this.gateway.confirmPayment(paymentIntentId);

    if (confirmation.success) {
      await this.processSuccessfulPayment(paymentId);
    } else if (confirmation.status === 'failed') {
      await this.processFailedPayment(paymentId, confirmation.message);
    }

    return {
      success: confirmation.success,
      status: payment.status,
    };
  }
}

