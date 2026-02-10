/**
 * Mock control API: config, messages list, simulate incoming message / status
 */

import { Router, Request, Response } from 'express';
import { getConfig, updateConfig, getDefaultConfig } from './config.js';
import { getMessages, addMessage, clearMessages } from './store.js';
import { buildWebhookPayload } from './meta-api.js';
import axios from 'axios';

const router = Router();

/**
 * GET /mock/config
 * Get current mock configuration
 */
router.get('/config', (_req: Request, res: Response) => {
  const cfg = getConfig();
  res.json({
    ...cfg,
    note: 'Set webhookUrl to your main app webhook (e.g. https://your-app.com/api/whatsapp/webhook) so simulated events are delivered.',
  });
});

/**
 * POST /mock/config
 * Update configuration (partial)
 * Body: { port?, apiVersion?, phoneNumberId?, displayPhoneNumber?, verifyToken?, webhookUrl?, acceptAnyToken? }
 */
router.post('/config', (req: Request, res: Response) => {
  const allowed: (keyof ReturnType<typeof getConfig>)[] = [
    'port',
    'apiVersion',
    'phoneNumberId',
    'displayPhoneNumber',
    'verifyToken',
    'webhookUrl',
    'acceptAnyToken',
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      (updates as Record<string, unknown>)[key] = req.body[key];
    }
  }
  updateConfig(updates as Partial<ReturnType<typeof getConfig>>);
  res.json(getConfig());
});

/**
 * GET /mock/config/defaults
 * Get default configuration values
 */
router.get('/config/defaults', (_req: Request, res: Response) => {
  res.json(getDefaultConfig());
});

/**
 * GET /mock/verify
 * Webhook verification (Meta-style). Main app can use this URL as "webhook" for verification.
 * Query: hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 */
router.get('/verify', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;
  const cfg = getConfig();

  if (mode !== 'subscribe') {
    return res.status(403).send('Forbidden');
  }
  if (!challenge) {
    return res.status(400).send('Missing hub.challenge');
  }
  if (token !== cfg.verifyToken) {
    return res.status(403).send('Forbidden');
  }
  res.type('text/plain').send(challenge);
});

/**
 * GET /mock/messages
 * List recent sent/received messages
 */
router.get('/messages', (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 500);
  res.json({ messages: getMessages(limit) });
});

/**
 * DELETE /mock/messages
 * Clear message history
 */
router.delete('/messages', (_req: Request, res: Response) => {
  clearMessages();
  res.json({ ok: true });
});

/**
 * POST /mock/simulate/incoming
 * Simulate an incoming message from a user. Forwards to webhookUrl if set.
 * Body: { from: string (e.g. "15551234567"), text: string }
 */
router.post('/simulate/incoming', async (req: Request, res: Response) => {
  const from = String(req.body?.from || req.body?.phone || '15550000000').replace(/\D/g, '') || '15550000000';
  const text = String(req.body?.text ?? req.body?.body ?? 'Hello from mock');
  const cfg = getConfig();

  const messageId = `wamid.in.${Date.now()}.${Math.random().toString(36).slice(2, 12)}`;
  const timestamp = Math.floor(Date.now() / 1000);

  addMessage({
    direction: 'in',
    from,
    to: cfg.displayPhoneNumber,
    text,
    wamId: messageId,
    meta: { simulated: true },
  });

  const payload = buildWebhookPayload(cfg, {
    type: 'message',
    from,
    messageId,
    text,
    timestamp,
  });

  if (cfg.webhookUrl) {
    try {
      await axios.post(cfg.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      res.json({
        ok: true,
        message: 'Incoming message simulated and forwarded to webhook',
        webhookUrl: cfg.webhookUrl,
        from,
        text: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
      });
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Unknown error';
      res.status(502).json({
        ok: false,
        error: 'Webhook delivery failed',
        detail: message,
        webhookUrl: cfg.webhookUrl,
      });
    }
  } else {
    res.json({
      ok: true,
      message: 'Incoming message simulated (no webhookUrl set; not forwarded)',
      webhookUrl: null,
      from,
      text: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
      payloadPreview: payload,
    });
  }
});

/**
 * POST /mock/simulate/status
 * Simulate a message status update (sent/delivered/read). Forwards to webhookUrl if set.
 * Body: { messageId: string (wamid from send), status: "sent"|"delivered"|"read", recipientId: string }
 */
router.post('/simulate/status', async (req: Request, res: Response) => {
  const messageId = String(req.body?.messageId ?? req.body?.wam_id ?? '');
  const status = String(req.body?.status ?? 'delivered').toLowerCase();
  const recipientId = String(req.body?.recipientId ?? req.body?.recipient_id ?? req.body?.to ?? '').replace(/\D/g, '') || '15550000000';
  const cfg = getConfig();

  if (!['sent', 'delivered', 'read'].includes(status)) {
    return res.status(400).json({ error: 'status must be sent, delivered, or read' });
  }

  const payload = buildWebhookPayload(cfg, {
    type: 'status',
    messageId: messageId || `wamid.${Date.now()}`,
    status,
    recipientId,
    timestamp: Math.floor(Date.now() / 1000),
  });

  if (cfg.webhookUrl) {
    try {
      await axios.post(cfg.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      res.json({
        ok: true,
        message: `Status "${status}" simulated and forwarded to webhook`,
        webhookUrl: cfg.webhookUrl,
      });
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Unknown error';
      res.status(502).json({
        ok: false,
        error: 'Webhook delivery failed',
        detail: message,
        webhookUrl: cfg.webhookUrl,
      });
    }
  } else {
    res.json({
      ok: true,
      message: `Status "${status}" simulated (no webhookUrl set; not forwarded)`,
      webhookUrl: null,
      payloadPreview: payload,
    });
  }
});

export { router as mockApiRouter };
