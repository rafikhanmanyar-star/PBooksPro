import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDatabaseService } from '../../services/databaseService.js';
import { getWhatsAppApiService } from '../../services/whatsappApiService.js';

const router = Router();
const getDb = () => getDatabaseService();
const DEBUG_WHATSAPP = process.env.DEBUG_WHATSAPP === 'true';

/**
 * GET /api/whatsapp/webhook
 * Webhook verification (Meta requirement)
 * This endpoint is called by Meta to verify the webhook URL
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;

    if (mode !== 'subscribe') {
      return res.status(403).send('Forbidden');
    }

    if (!token || !challenge) {
      return res.status(400).send('Missing verify_token or challenge');
    }

    // Find tenant by verify token
    // Note: This is a simplified approach - in production, you might want to
    // include tenant ID in the webhook URL path or use a different method
    const db = getDb();
    
    const configs = await db.query<{ tenant_id: string; verify_token: string }>(
      'SELECT tenant_id, verify_token FROM whatsapp_configs WHERE verify_token = $1 AND is_active = TRUE',
      [token]
    );

    if (configs.length === 0) {
      // Check if any configs exist at all
      const allConfigs = await db.query<{ tenant_id: string; verify_token: string }>(
        'SELECT tenant_id, verify_token FROM whatsapp_configs WHERE is_active = TRUE'
      );
      
      return res.status(403).send('Forbidden');
    }

    res.status(200).send(challenge);
  } catch (error: any) {
    console.error('Error verifying webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * POST /api/whatsapp/webhook
 * Receive webhook events from Meta
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    // Verify webhook signature (if provided)
    const signature = req.headers['x-hub-signature-256'] as string;
    if (signature) {
      // Note: For production, verify the signature using the app secret
      // For now, we'll skip signature verification as it requires the app secret
      // which may not be available in all configurations
    }

    // Extract tenant ID from payload or webhook URL
    // Meta sends webhook events with phone number ID
    // We need to map phone number ID to tenant ID
    let tenantId: string | null = null;

    if (payload && payload.entry && Array.isArray(payload.entry)) {
      for (const entry of payload.entry) {
        if (entry.changes && Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            if (change.value && change.value.metadata) {
              const phoneNumberId = change.value.metadata.phone_number_id;
              
              if (DEBUG_WHATSAPP) console.log('[WhatsApp Webhook] Found phone number ID in metadata', { phoneNumberId });
              
              // Find tenant by phone number ID
              const db = getDb();
              const configs = await db.query<{ tenant_id: string }>(
                'SELECT tenant_id FROM whatsapp_configs WHERE phone_number_id = $1 AND is_active = TRUE',
                [phoneNumberId]
              );


              if (configs.length > 0) {
                tenantId = configs[0].tenant_id;
                break;
              }
            }

          }
          if (tenantId) break;
        }
        if (tenantId) break;
      }
    }

    if (!tenantId) {
      console.warn('[WhatsApp Webhook] Received but tenant ID not found. Payload may be a non-WhatsApp test (e.g. "about" field). Subscribe to "messages" and "message_status" under WhatsApp → Configuration.');
      // Return 200 to prevent Meta from retrying
      return res.status(200).json({ received: true });
    }

    // Process webhook
    const whatsappService = getWhatsAppApiService();
    const processStartTime = Date.now();
    
    try {
      await whatsappService.processWebhook(tenantId, payload);
    } catch (processError: any) {
      const processDuration = Date.now() - processStartTime;
      console.error('[WhatsApp Webhook] Error processing webhook for tenant:', tenantId, {
        error: processError.message,
        errorStack: processError.stack?.substring(0, 500),
        duration: `${processDuration}ms`,
        timestamp: new Date().toISOString(),
      });
      throw processError;
    }
    // Return 200 OK to acknowledge receipt
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    // Return 200 to prevent Meta from retrying (will log error instead)
    res.status(200).json({ received: true, error: error.message });
  }
});

export default router;
