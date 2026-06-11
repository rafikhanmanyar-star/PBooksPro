import { Router } from 'express';
import { getPool } from '../../../db/pool.js';
import { publicIntrospectionLimiter } from '../../../middleware/introspectionGuard.js';
import {
  recordEmailClick,
  recordEmailOpen,
} from '../../../services/emailAutomation/emailAutomationQueueService.js';
import {
  recordUnsubscribe,
  verifyUnsubscribeSignature,
} from '../../../services/emailAutomation/emailAutomationUnsubscribeService.js';
import type { EmailAutomationCategory } from '../../../constants/emailAutomation.js';

export const emailAutomationPublicRouter = Router();

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

emailAutomationPublicRouter.get(
  '/email/track/open/:token',
  publicIntrospectionLimiter,
  async (req, res) => {
    const token = String(req.params.token ?? '').trim();
    if (token) {
      const client = await getPool().connect();
      try {
        await recordEmailOpen(client, token);
      } catch {
        /* best effort */
      } finally {
        client.release();
      }
    }
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.status(200).send(TRANSPARENT_GIF);
  }
);

emailAutomationPublicRouter.get(
  '/email/track/click/:token',
  publicIntrospectionLimiter,
  async (req, res) => {
    const token = String(req.params.token ?? '').trim();
    const target = typeof req.query.url === 'string' ? req.query.url : '';
    if (token) {
      const client = await getPool().connect();
      try {
        await recordEmailClick(client, token);
      } catch {
        /* best effort */
      } finally {
        client.release();
      }
    }
    if (target && /^https?:\/\//i.test(target)) {
      res.redirect(302, target);
      return;
    }
    res.status(400).send('Invalid redirect URL.');
  }
);

function unsubscribeHtml(message: string): string {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:24px;">
<h1 style="font-size:20px;color:#334155;">PBooks Pro</h1>
<p style="color:#475569;line-height:1.6;">${message}</p>
</body></html>`;
}

emailAutomationPublicRouter.get('/email/unsubscribe', publicIntrospectionLimiter, async (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
  const tenant = typeof req.query.tenant === 'string' && req.query.tenant ? req.query.tenant : null;
  const category = (typeof req.query.category === 'string' ? req.query.category : 'lifecycle') as EmailAutomationCategory;
  const sig = typeof req.query.sig === 'string' ? req.query.sig : '';
  const scope = req.query.scope === 'all' ? 'all' : 'category';

  if (!email || !sig || !verifyUnsubscribeSignature(email, tenant, category, sig)) {
    res.status(400).send(unsubscribeHtml('This unsubscribe link is invalid or expired.'));
    return;
  }

  const client = await getPool().connect();
  try {
    await recordUnsubscribe(client, email, tenant, scope === 'all' ? 'all' : category);
    res.status(200).send(
      unsubscribeHtml(
        scope === 'all'
          ? 'You have been unsubscribed from all PBooks Pro marketing and lifecycle emails.'
          : `You have been unsubscribed from ${category} emails from PBooks Pro.`
      )
    );
  } catch {
    res.status(500).send(unsubscribeHtml('Something went wrong. Please email support@pbookspro.com.'));
  } finally {
    client.release();
  }
});
