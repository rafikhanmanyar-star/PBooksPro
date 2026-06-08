import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditContextFromRequest } from './enterpriseAuditService.js';

describe('enterpriseAuditService', () => {
  it('auditContextFromRequest prefers x-forwarded-for', () => {
    const req = {
      headers: {
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
        'user-agent': 'PBooksTest/1.0',
      },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as import('express').Request;
    const ctx = auditContextFromRequest(req);
    assert.equal(ctx.ipAddress, '203.0.113.10');
    assert.equal(ctx.userAgent, 'PBooksTest/1.0');
  });

  it('auditContextFromRequest falls back to socket address', () => {
    const req = {
      headers: {},
      socket: { remoteAddress: '192.168.1.5' },
    } as unknown as import('express').Request;
    const ctx = auditContextFromRequest(req);
    assert.equal(ctx.ipAddress, '192.168.1.5');
  });
});
