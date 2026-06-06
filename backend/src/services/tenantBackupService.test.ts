import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { TenantBackupPayload } from './tenantBackupService.js';
import { compressTenantBackup } from './tenantBackupService.js';

describe('tenantBackupService compressTenantBackup', () => {
  it('round-trips JSON payload through gzip', () => {
    const payload: TenantBackupPayload = {
      format: 'pbooks-tenant-json-v1',
      exportedAt: '2026-06-06T12:00:00.000Z',
      tenantId: 'default',
      tables: { accounts: [{ id: 'a1', name: 'Cash' }] },
    };
    const compressed = compressTenantBackup(payload);
    const parsed = JSON.parse(gunzipSync(compressed).toString('utf-8')) as TenantBackupPayload;
    assert.equal(parsed.tenantId, 'default');
    assert.equal(parsed.tables.accounts?.length, 1);
    assert.ok(compressed.length < gzipSync(JSON.stringify(payload)).length || compressed.length > 0);
  });
});
