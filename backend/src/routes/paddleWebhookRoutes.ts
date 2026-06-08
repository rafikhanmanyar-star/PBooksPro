/**

 * Paddle webhook endpoint (public, signature-verified).

 */



import { Router } from 'express';

import { getPool } from '../db/pool.js';

import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';

import {

  isPaddleConfigured,

  verifyPaddleWebhookSignature,

} from '../services/billing/paddleBillingService.js';

import { processPaddleWebhookPayload } from '../services/billing/paddleWebhookProcessor.js';



export const paddleWebhookRouter = Router();



paddleWebhookRouter.post('/', async (req, res) => {

  const rawBody: Buffer | undefined = (req as { body?: Buffer }).body;

  if (!rawBody || !Buffer.isBuffer(rawBody)) {

    sendFailure(res, 400, 'INVALID_BODY', 'Raw body required for webhook verification.');

    return;

  }



  const signature = req.headers['paddle-signature'];

  const sigHeader = typeof signature === 'string' ? signature : undefined;



  const requireSignature =
    process.env.NODE_ENV === 'production' ||
    process.env.REQUIRE_PADDLE_WEBHOOK_SIGNATURE === 'true' ||
    isPaddleConfigured();

  if (requireSignature) {
    if (!process.env.PADDLE_WEBHOOK_SECRET?.trim()) {
      sendFailure(res, 503, 'WEBHOOK_NOT_CONFIGURED', 'Paddle webhook secret is required.');
      return;
    }
    if (!verifyPaddleWebhookSignature(rawBody, sigHeader)) {
      sendFailure(res, 401, 'INVALID_SIGNATURE', 'Paddle webhook signature verification failed.');
      return;
    }
  }



  let body: unknown;

  try {

    body = JSON.parse(rawBody.toString('utf8'));

  } catch {

    sendFailure(res, 400, 'INVALID_JSON', 'Webhook body is not valid JSON.');

    return;

  }



  const pool = getPool();

  const client = await pool.connect();

  try {

    await client.query('BEGIN');

    const result = await processPaddleWebhookPayload(client, body);

    await client.query('COMMIT');

    sendSuccess(res, { received: true, ...result });

  } catch (e) {

    await client.query('ROLLBACK').catch(() => undefined);

    handleRouteError(res, e, { route: 'POST /webhooks/paddle' });

  } finally {

    client.release();

  }

});


