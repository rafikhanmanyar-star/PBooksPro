import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  mapLicenseTypeToBillingCycle,
  mapLicenseTypeToPlanCode,
  parsePaddleWebhook,
  verifyPaddleWebhookSignature,
} from './paddleService.js';
import { resolvePlanPrice } from './paddleBillingService.js';
import type { BillingPlanRow } from './billingPlanService.js';

describe('paddleService', () => {
  it('parses Paddle webhook payloads with event_id', () => {
    const event = parsePaddleWebhook({
      event_id: 'evt_01',
      event_type: 'transaction.completed',
      data: { id: 'txn_01', custom_data: { tenant_id: 't1', plan_code: 'starter' } },
    });
    assert.ok(event);
    assert.equal(event!.event_id, 'evt_01');
    assert.equal(event!.event_type, 'transaction.completed');
  });

  it('returns null for invalid webhook payloads', () => {
    assert.equal(parsePaddleWebhook(null), null);
    assert.equal(parsePaddleWebhook({ foo: 'bar' }), null);
  });

  it('verifies Paddle webhook signatures', () => {
    const secret = 'test_webhook_secret';
    const prev = process.env.PADDLE_WEBHOOK_SECRET;
    process.env.PADDLE_WEBHOOK_SECRET = secret;

    const raw = Buffer.from('{"event_id":"evt_1"}', 'utf8');
    const ts = '1700000000';
    const h1 = createHmac('sha256', secret).update(`${ts}:${raw.toString('utf8')}`).digest('hex');
    const header = `ts=${ts};h1=${h1}`;

    assert.equal(verifyPaddleWebhookSignature(raw, header), true);
    assert.equal(verifyPaddleWebhookSignature(raw, 'ts=1;h1=deadbeef'), false);

    process.env.PADDLE_WEBHOOK_SECRET = prev;
  });

  it('maps license types to plan codes', () => {
    assert.equal(mapLicenseTypeToPlanCode('yearly'), 'enterprise');
    assert.equal(mapLicenseTypeToBillingCycle('yearly'), 'annual');
    assert.equal(mapLicenseTypeToPlanCode('monthly', 'rental'), 'starter');
  });
});

describe('paddle webhook idempotency keys', () => {
  it('uses stable event_id as delivery id', () => {
    const body = {
      event_id: 'ntf_abc123',
      event_type: 'subscription.updated',
      data: { id: 'sub_1' },
    };
    const parsed = parsePaddleWebhook(body);
    assert.equal(parsed?.event_id, 'ntf_abc123');
  });
});

describe('billingPlanService helpers', () => {
  const plan: BillingPlanRow = {
    id: 'p1',
    plan_code: 'professional',
    name: 'Pro',
    description: '',
    monthly_price: '71.00',
    annual_price: '708.00',
    max_users: 50,
    max_projects: 100,
    max_storage_gb: 100,
    features_json: { modules: ['real_estate', 'rental'] },
    is_active: true,
    created_at: '',
    updated_at: '',
  };

  it('resolves plan prices', () => {
    assert.equal(resolvePlanPrice(plan, 'monthly'), 71);
    assert.equal(resolvePlanPrice(plan, 'annual'), 708);
  });
});
