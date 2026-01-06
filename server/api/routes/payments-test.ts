// Test routes for mock payment gateway
// These routes help test the payment flow without real gateway
import { Router, Request, Response } from 'express';
import { getDatabaseService } from '../../services/databaseService.js';
import { PaymentService } from '../../services/paymentService.js';
import { createGateway } from '../../services/paymentGateways/gatewayFactory.js';
import { MockGateway } from '../../services/paymentGateways/mockGateway.js';

const router = Router();
const getDb = () => getDatabaseService();

// Trigger a test webhook (for mock gateway testing)
router.post('/test-webhook/:paymentIntentId', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId } = req.params;
    const { status } = req.body; // 'completed' or 'failed'

    const gateway = createGateway();
    
    if (!(gateway instanceof MockGateway)) {
      return res.status(400).json({ 
        error: 'This endpoint only works with mock gateway',
        currentGateway: gateway.getName()
      });
    }

    const webhookEvent = await gateway.triggerWebhook(
      paymentIntentId,
      status || 'completed'
    );

    // Process the webhook through PaymentService
    const db = getDb();
    const paymentService = new PaymentService(db);
    
    // Manually trigger webhook processing
    await paymentService.handleWebhook(
      'mock',
      webhookEvent.rawPayload,
      'mock_signature'
    );

    res.json({
      success: true,
      message: 'Test webhook triggered',
      event: webhookEvent
    });
  } catch (error: any) {
    console.error('Test webhook error:', error);
    res.status(500).json({
      error: 'Failed to trigger test webhook',
      message: error.message
    });
  }
});

// Get mock gateway status (for testing)
router.get('/test-status', async (req: Request, res: Response) => {
  try {
    const gateway = createGateway();
    
    if (!(gateway instanceof MockGateway)) {
      return res.json({
        gateway: gateway.getName(),
        isMock: false,
        message: 'Using real payment gateway'
      });
    }

    const payments = gateway.getAllPayments();

    res.json({
      gateway: 'mock',
      isMock: true,
      paymentCount: payments.length,
      payments: payments.map(p => ({
        paymentIntentId: p.paymentIntentId,
        status: p.status,
        amount: p.amount,
        currency: p.currency,
        createdAt: p.createdAt,
        completedAt: p.completedAt
      }))
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get test status',
      message: error.message
    });
  }
});

// Clear mock payments (for testing)
router.post('/test-clear', async (req: Request, res: Response) => {
  try {
    const gateway = createGateway();
    
    if (!(gateway instanceof MockGateway)) {
      return res.status(400).json({ 
        error: 'This endpoint only works with mock gateway'
      });
    }

    gateway.clearPayments();

    res.json({
      success: true,
      message: 'Mock payments cleared'
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to clear payments',
      message: error.message
    });
  }
});

export default router;

