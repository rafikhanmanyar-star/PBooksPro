import { Router, type Request, type Response } from 'express';
import { getPool } from '../../../db/pool.js';
import { getWhatsAppApiService } from '../../../services/whatsapp/whatsappApiService.js';

export const whatsappWebhookRouter = Router();
const DEBUG_WHATSAPP = process.env.DEBUG_WHATSAPP === 'true';

/**
 * GET /api/whatsapp/webhook — Meta webhook verification
 */
whatsappWebhookRouter.get('/', async (req: Request, res: Response) => {
  try {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;

    if (mode !== 'subscribe') {
      res.status(403).send('Forbidden');
      return;
    }

    if (!token || !challenge) {
      res.status(400).send('Missing verify_token or challenge');
      return;
    }

    const pool = getPool();
    const configs = await pool.query<{ tenant_id: string; verify_token: string }>(
      'SELECT tenant_id, verify_token FROM whatsapp_configs WHERE verify_token = $1 AND is_active = TRUE',
      [token]
    );

    if (configs.rows.length === 0) {
      res.status(403).send('Forbidden');
      return;
    }

    res.status(200).send(challenge);
  } catch (error) {
    console.error('Error verifying WhatsApp webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * POST /api/whatsapp/webhook — receive Meta webhook events
 */
whatsappWebhookRouter.post('/', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    let tenantId: string | null = null;

    if (payload?.entry && Array.isArray(payload.entry)) {
      for (const entry of payload.entry) {
        if (!entry.changes || !Array.isArray(entry.changes)) continue;
        for (const change of entry.changes) {
          const phoneNumberId = change.value?.metadata?.phone_number_id;
          if (!phoneNumberId) continue;

          if (DEBUG_WHATSAPP) {
            console.log('[WhatsApp Webhook] Found phone number ID in metadata', { phoneNumberId });
          }

          const pool = getPool();
          const configs = await pool.query<{ tenant_id: string }>(
            'SELECT tenant_id FROM whatsapp_configs WHERE phone_number_id = $1 AND is_active = TRUE',
            [phoneNumberId]
          );

          if (configs.rows.length > 0) {
            tenantId = configs.rows[0].tenant_id;
            break;
          }
        }
        if (tenantId) break;
      }
    }

    if (!tenantId) {
      console.warn(
        '[WhatsApp Webhook] Tenant not found for payload (may be a non-WhatsApp test event).'
      );
      res.status(200).json({ received: true });
      return;
    }

    const whatsappService = getWhatsAppApiService();
    await whatsappService.processWebhook(tenantId, payload);
    res.status(200).json({ received: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error processing WhatsApp webhook:', message);
    res.status(200).json({ received: true, error: message });
  }
});
