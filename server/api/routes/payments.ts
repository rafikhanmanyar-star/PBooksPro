// Payment API routes for license renewal
import { Router, Request, Response, NextFunction } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { PaymentService } from '../../services/paymentService.js';

const router = Router();
const getDb = () => getDatabaseService();

// Create payment session for license renewal
router.post('/create-session', async (req: TenantRequest, res: Response) => {
  try {
    const { licenseType, currency } = req.body;
    const tenantId = req.tenantId!;

    if (!['monthly', 'yearly'].includes(licenseType)) {
      return res.status(400).json({ error: 'Invalid license type. Must be "monthly" or "yearly"' });
    }

    if (currency && !['PKR', 'USD'].includes(currency)) {
      return res.status(400).json({ error: 'Invalid currency. Must be "PKR" or "USD"' });
    }

    const db = getDb();
    const paymentService = new PaymentService(db);

    // Get base URL for return/cancel URLs
    const baseUrl = req.headers.origin || process.env.CLIENT_URL || 'http://localhost:5173';
    const returnUrl = `${baseUrl}/license/payment-success`;
    const cancelUrl = `${baseUrl}/license/payment-cancel`;

    const session = await paymentService.createPaymentSession({
      tenantId,
      licenseType,
      currency: currency || 'PKR',
      returnUrl,
      cancelUrl,
    });

    res.json({
      success: true,
      session,
    });
  } catch (error: any) {
    console.error('Payment session creation error:', error);
    res.status(500).json({
      error: 'Failed to create payment session',
      message: error.message,
    });
  }
});

// Confirm payment (for redirect-based flows)
router.post('/confirm', async (req: TenantRequest, res: Response) => {
  try {
    const { paymentId, paymentIntentId } = req.body;
    const tenantId = req.tenantId!;

    if (!paymentId || !paymentIntentId) {
      return res.status(400).json({ error: 'paymentId and paymentIntentId are required' });
    }

    const db = getDb();
    const paymentService = new PaymentService(db);

    // Verify payment belongs to tenant
    const paymentStatus = await paymentService.getPaymentStatus(paymentId);
    const payments = await db.query(
      'SELECT tenant_id FROM payments WHERE id = $1',
      [paymentId]
    );

    if (payments.length === 0 || payments[0].tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Payment not found or access denied' });
    }

    const result = await paymentService.confirmPayment(paymentId, paymentIntentId);

    res.json({
      success: result.success,
      status: result.status,
    });
  } catch (error: any) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({
      error: 'Failed to confirm payment',
      message: error.message,
    });
  }
});

// Webhook endpoint for payment gateway callbacks
// Exported separately for direct access before middleware
export async function handleWebhookRoute(req: Request, res: Response, next: NextFunction) {
  try {
    const { gateway } = req.params;
    
    // Get signature based on gateway type
    let signature: string | undefined;
    if (gateway === 'paddle') {
      // Paddle uses Paddle-Signature header with format: ts=timestamp;h1=signature
      signature = req.headers['paddle-signature'] as string;
    } else if (gateway === 'payfast') {
      signature = req.headers['x-payfast-signature'] as string || req.query.signature as string;
    } else {
      signature = req.headers['x-signature'] as string || req.query.signature as string;
    }

    // Get raw body for signature verification
    // Note: body-parser may have already parsed it, so we might need raw body
    const payload = req.body;

    const db = getDb();
    const paymentService = new PaymentService(db);

    // Handle webhook asynchronously
    paymentService.handleWebhook(
      gateway,
      payload,
      typeof signature === 'string' ? signature : undefined
    ).catch((error) => {
      console.error('Webhook processing error:', error);
    });

    // Return success immediately to gateway
    res.status(200).send('OK');
  } catch (error: any) {
    console.error('Webhook error:', error);
    // Still return 200 to prevent gateway from retrying invalid requests
    res.status(200).send('OK');
  }
}

router.post('/webhook/:gateway', handleWebhookRoute);

// Get payment history for tenant
router.get('/history', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const db = getDb();
    const paymentService = new PaymentService(db);

    const history = await paymentService.getPaymentHistory(tenantId);

    res.json({
      success: true,
      payments: history,
    });
  } catch (error: any) {
    console.error('Payment history error:', error);
    res.status(500).json({
      error: 'Failed to fetch payment history',
      message: error.message,
    });
  }
});

// Get payment status
router.get('/:paymentId/status', async (req: TenantRequest, res: Response) => {
  try {
    const { paymentId } = req.params;
    const tenantId = req.tenantId!;

    const db = getDb();
    const paymentService = new PaymentService(db);

    // Verify payment belongs to tenant
    const payments = await db.query(
      'SELECT tenant_id FROM payments WHERE id = $1',
      [paymentId]
    );

    if (payments.length === 0 || payments[0].tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Payment not found or access denied' });
    }

    const status = await paymentService.getPaymentStatus(paymentId);

    res.json({
      success: true,
      payment: status,
    });
  } catch (error: any) {
    console.error('Payment status error:', error);
    res.status(500).json({
      error: 'Failed to fetch payment status',
      message: error.message,
    });
  }
});

export default router;

