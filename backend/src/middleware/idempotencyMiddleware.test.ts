import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import { idempotencyBodyMiddleware, type IdempotentRequest } from './idempotencyMiddleware.js';

function mockRes(): Response {
  return {} as Response;
}

function mockReq(method: string, body: unknown): IdempotentRequest {
  return { method, body, headers: {} } as IdempotentRequest;
}

describe('idempotencyBodyMiddleware', () => {
  it('unwraps strict { requestId, data } envelopes', () => {
    const req = mockReq('POST', {
      requestId: 'req-1',
      data: { amount: 100, description: 'test' },
    });
    const res = mockRes();
    let called = false;
    idempotencyBodyMiddleware(req, res, () => {
      called = true;
    });
    assert.equal(called, true);
    assert.equal(req.idempotencyKey, 'req-1');
    assert.deepEqual(req.body, { amount: 100, description: 'test' });
  });

  it('keeps flat bodies that include requestId and a nested data field', () => {
    const body = {
      id: 'log-1',
      requestId: 'req-2',
      action: 'CREATE',
      entityType: 'Transaction',
      entityId: 'tx-1',
      description: 'Created EXPENSE: rent (100)',
      data: { id: 'tx-1', type: 'EXPENSE', description: 'rent', amount: 100 },
    };
    const req = mockReq('POST', body);
    const res = mockRes();
    let called = false;
    idempotencyBodyMiddleware(req, res, () => {
      called = true;
    });
    assert.equal(called, true);
    assert.equal(req.idempotencyKey, 'req-2');
    assert.deepEqual(req.body, {
      id: 'log-1',
      action: 'CREATE',
      entityType: 'Transaction',
      entityId: 'tx-1',
      description: 'Created EXPENSE: rent (100)',
      data: { id: 'tx-1', type: 'EXPENSE', description: 'rent', amount: 100 },
    });
  });

  it('strips requestId from flat mutation bodies without unwrapping data', () => {
    const req = mockReq('POST', {
      requestId: 'req-3',
      name: 'Account',
      type: 'BANK',
    });
    const res = mockRes();
    idempotencyBodyMiddleware(req, res, () => undefined);
    assert.equal(req.idempotencyKey, 'req-3');
    assert.deepEqual(req.body, { name: 'Account', type: 'BANK' });
  });
});
