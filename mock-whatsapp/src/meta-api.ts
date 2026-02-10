/**
 * Meta WhatsApp Cloud API–compatible routes.
 * Same paths and request/response shapes as https://graph.facebook.com/{version}/
 */

import { Router, Request, Response } from 'express';
import { getConfig } from './config.js';
import { addMessage } from './store.js';
import axios from 'axios';

const router = Router();
const apiVersion = () => getConfig().apiVersion;

/**
 * Auth: accept Bearer token. If acceptAnyToken, any token is valid.
 */
function authMiddleware(req: Request, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  const cfg = getConfig();
  if (cfg.acceptAnyToken) {
    next();
    return;
  }
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190 } });
    return;
  }
  next();
}

router.use(authMiddleware);

/**
 * GET /:phoneNumberId
 * Get phone number info (used by main app for test-connection)
 */
router.get('/:phoneNumberId', (req: Request, res: Response) => {
  const cfg = getConfig();
  if (req.params.phoneNumberId !== cfg.phoneNumberId) {
    return res.status(400).json({
      error: {
        message: 'Invalid phone number ID',
        type: 'OAuthException',
        code: 100,
      },
    });
  }
  res.json({
    id: cfg.phoneNumberId,
    display_phone_number: cfg.displayPhoneNumber,
    quality_rating: 'GREEN',
    verified_name: 'Mock WhatsApp Business',
  });
});

/**
 * POST /:phoneNumberId/messages
 * Send message (same request/response as Meta)
 */
router.post('/:phoneNumberId/messages', async (req: Request, res: Response) => {
  const cfg = getConfig();
  const { phoneNumberId } = req.params;
  if (phoneNumberId !== cfg.phoneNumberId) {
    return res.status(400).json({
      error: {
        message: 'Invalid phone number ID',
        type: 'OAuthException',
        code: 100,
      },
    });
  }

  const body = req.body as {
    messaging_product?: string;
    recipient_type?: string;
    to?: string;
    type?: string;
    text?: { preview_url?: boolean; body?: string };
  };

  const to = String(body?.to || '').replace(/\D/g, '') || 'unknown';
  const messageText = body?.text?.body ?? body?.text ?? '';

  const wamId = `wamid.${Date.now()}.${Math.random().toString(36).slice(2, 15)}`;

  addMessage({
    direction: 'out',
    from: cfg.displayPhoneNumber,
    to: to,
    text: messageText,
    wamId,
    status: 'sent',
    meta: { body },
  });

  const response: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    contacts: [{ input: to, wa_id: to }],
    messages: [
      {
        id: wamId,
        message_status: 'accepted',
      },
    ],
  };

  res.json(response);

  // Optionally push status update to main app webhook (sent)
  if (cfg.webhookUrl) {
    const statusPayload = buildWebhookPayload(cfg, {
      type: 'status',
      messageId: wamId,
      status: 'sent',
      recipientId: to,
      timestamp: Math.floor(Date.now() / 1000),
    });
    axios.post(cfg.webhookUrl, statusPayload, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }).catch((err) => {
      console.warn('[Mock WhatsApp] Failed to POST status to webhook:', err.message);
    });
  }
});

/**
 * Build Meta-style webhook payload for one entry/change
 */
export function buildWebhookPayload(
  cfg: { phoneNumberId: string; displayPhoneNumber: string },
  options:
    | { type: 'message'; from: string; messageId: string; text: string; timestamp: number }
    | { type: 'status'; messageId: string; status: string; recipientId: string; timestamp: number }
): object {
  const entryId = String(Math.floor(Math.random() * 1e15));
  const value: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    metadata: {
      display_phone_number: cfg.displayPhoneNumber,
      phone_number_id: cfg.phoneNumberId,
    },
  };

  if (options.type === 'message') {
    value.messages = [
      {
        from: options.from,
        id: options.messageId,
        timestamp: String(options.timestamp),
        type: 'text',
        text: { body: options.text },
      },
    ];
  } else {
    value.statuses = [
      {
        id: options.messageId,
        status: options.status,
        timestamp: String(options.timestamp),
        recipient_id: options.recipientId,
      },
    ];
  }

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: entryId,
        changes: [
          {
            field: 'messages',
            value,
          },
        ],
      },
    ],
  };
}

export { router as metaApiRouter };
