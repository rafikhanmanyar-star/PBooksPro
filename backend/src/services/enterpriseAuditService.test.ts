import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditContextFromRequest,
  filterUnifiedAuditRowsForTenant,
  type UnifiedAuditRow,
} from './enterpriseAuditService.js';

function sampleRow(tenantId: string): UnifiedAuditRow {
  return {
    id: 'evt-1',
    source: 'audit_event',
    tenantId,
    occurredAt: '2026-06-10T12:00:00.000Z',
    userId: 'user_a',
    email: 'a@example.com',
    module: 'transactions',
    action: 'delete',
    entityType: 'transaction',
    entityId: 'tx-1',
    summary: 'Expense transaction deleted (100)',
    ipAddress: '127.0.0.1',
    userAgent: null,
    status: null,
    oldValue: null,
    newValue: null,
  };
}

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

  it('filterUnifiedAuditRowsForTenant keeps only matching tenant rows', () => {
    const rows = [sampleRow('org-a'), sampleRow('org-b'), sampleRow('org-a')];
    const filtered = filterUnifiedAuditRowsForTenant(rows, 'org-a');
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every((row) => row.tenantId === 'org-a'));
  });

  it('filterUnifiedAuditRowsForTenant returns empty when tenant id missing', () => {
    const filtered = filterUnifiedAuditRowsForTenant([sampleRow('org-a')], '  ');
    assert.deepEqual(filtered, []);
  });
});
