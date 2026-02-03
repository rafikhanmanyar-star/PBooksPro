import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDatabaseService } from '../../services/databaseService.js';
import { getWhatsAppApiService } from '../../services/whatsappApiService.js';

const router = Router();
const getDb = () => getDatabaseService();

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
    
    // Log the token Meta sent (first 10 chars for security)
    console.log(`[Webhook Verification] Meta sent token: ${token ? token.substring(0, 10) + '...' : 'MISSING'}`);
    
    const configs = await db.query<{ tenant_id: string; verify_token: string }>(
      'SELECT tenant_id, verify_token FROM whatsapp_configs WHERE verify_token = $1 AND is_active = TRUE',
      [token]
    );

    if (configs.length === 0) {
      // Check if any configs exist at all
      const allConfigs = await db.query<{ tenant_id: string; verify_token: string }>(
        'SELECT tenant_id, verify_token FROM whatsapp_configs WHERE is_active = TRUE'
      );
      
      if (allConfigs.length === 0) {
        console.log('[Webhook Verification] No active WhatsApp configurations found in database');
      } else {
        console.log(`[Webhook Verification] Token mismatch. Database has ${allConfigs.length} active config(s) with different token(s)`);
        // Log first 10 chars of stored tokens for debugging (without exposing full tokens)
        allConfigs.forEach((config, idx) => {
          console.log(`[Webhook Verification] Config ${idx + 1} token: ${config.verify_token.substring(0, 10)}... (tenant: ${config.tenant_id})`);
        });
      }
      return res.status(403).send('Forbidden');
    }

    // Return challenge to verify webhook
    console.log('Webhook verified successfully for tenant:', configs[0].tenant_id);
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
    // Log every incoming webhook (helps debug "test sent but no logs")
    const payload = req.body;
    const payloadKeys = payload && typeof payload === 'object' ? Object.keys(payload) : [];
    console.log('[WhatsApp Webhook] POST received', {
      at: new Date().toISOString(),
      hasPayload: !!payload,
      payloadKeys,
      hasEntry: !!(payload && payload.entry),
      entryLength: payload?.entry?.length ?? 0,
    });

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
      console.log('[WhatsApp Webhook] Processing entries', {
        entryCount: payload.entry.length,
      });

      for (const entry of payload.entry) {
        console.log('[WhatsApp Webhook] Processing entry', {
          id: entry.id,
          hasChanges: !!(entry.changes && Array.isArray(entry.changes)),
          changeCount: entry.changes?.length || 0,
        });

        if (entry.changes && Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            console.log('[WhatsApp Webhook] Processing change', {
              field: change.field,
              hasValue: !!change.value,
              hasMetadata: !!(change.value && change.value.metadata),
              hasMessages: !!(change.value && change.value.messages),
              hasStatuses: !!(change.value && change.value.statuses),
            });

            if (change.value && change.value.metadata) {
              const phoneNumberId = change.value.metadata.phone_number_id;
              
              console.log('[WhatsApp Webhook] Found phone number ID in metadata', {
                phoneNumberId,
              });
              
              // Find tenant by phone number ID
              const db = getDb();
              const configs = await db.query<{ tenant_id: string }>(
                'SELECT tenant_id FROM whatsapp_configs WHERE phone_number_id = $1 AND is_active = TRUE',
                [phoneNumberId]
              );

              console.log('[WhatsApp Webhook] Config lookup result', {
                phoneNumberId,
                configCount: configs.length,
                tenantId: configs.length > 0 ? configs[0].tenant_id : null,
              });

              if (configs.length > 0) {
                tenantId = configs[0].tenant_id;
                console.log('[WhatsApp Webhook] Tenant ID found', {
                  tenantId,
                });
                break;
              }
            }

            // Log status updates if present
            if (change.value && change.value.statuses && Array.isArray(change.value.statuses)) {
              console.log('[WhatsApp Webhook] Found status updates', {
                statusCount: change.value.statuses.length,
                statuses: change.value.statuses.map((s: any) => ({
                  id: s.id,
                  status: s.status,
                  recipientId: s.recipient_id ? s.recipient_id.substring(0, 5) + '***' : null,
                })),
              });
            }

            // Log incoming messages if present
            if (change.value && change.value.messages && Array.isArray(change.value.messages)) {
              console.log('[WhatsApp Webhook] Found incoming messages', {
                messageCount: change.value.messages.length,
                messages: change.value.messages.map((m: any) => ({
                  id: m.id,
                  from: m.from ? m.from.substring(0, 5) + '***' : null,
                  type: m.type,
                })),
              });
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

    console.log('[WhatsApp Webhook] Processing for tenant:', tenantId, {
      payloadSummary: {
        entryCount: payload?.entry?.length || 0,
        hasMessages: !!(payload?.entry?.[0]?.changes?.[0]?.value?.messages),
        hasStatuses: !!(payload?.entry?.[0]?.changes?.[0]?.value?.statuses),
      },
    });

    // Process webhook
    const whatsappService = getWhatsAppApiService();
    const processStartTime = Date.now();
    
    try {
      await whatsappService.processWebhook(tenantId, payload);
      const processDuration = Date.now() - processStartTime;
      
      console.log('[WhatsApp Webhook] Processed successfully for tenant:', tenantId, {
        duration: `${processDuration}ms`,
        timestamp: new Date().toISOString(),
      });
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
