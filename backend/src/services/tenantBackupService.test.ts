import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
  compressTenantBackup,
  decompressTenantBackup,
  normalizeTenantBackupPayload,
  getSourceTenantId,
  type TenantBackupPayloadV2,
} from './tenantBackupService.js';
import { filterBackupTables, TENANT_BACKUP_TABLES } from './tenantBackupRegistry.js';

describe('tenantBackupService', () => {
  it('compresses and decompresses v2 payload', () => {
    const payload: TenantBackupPayloadV2 = {
      format: 'pbooks-tenant-json-v2',
      exportedAt: '2026-06-07T12:00:00.000Z',
      sourceTenantId: 'default',
      sourceTenantName: 'Default',
      scope: ['accounts'],
      tables: { accounts: [{ id: 'a1', name: 'Cash', tenant_id: 'default' }] },
    };
    const compressed = compressTenantBackup(payload);
    const parsed = decompressTenantBackup(compressed);
    assert.equal(getSourceTenantId(parsed), 'default');
    assert.equal(normalizeTenantBackupPayload(parsed).tables.accounts?.length, 1);
  });

  it('normalizes v1 payload and strips excluded tables', () => {
    const v1 = {
      format: 'pbooks-tenant-json-v1' as const,
      exportedAt: '2026-01-01T00:00:00.000Z',
      tenantId: 't1',
      tables: {
        accounts: [{ id: 'a1' }],
        users: [{ id: 'u1' }],
        app_settings: [{ key: 'x' }],
      },
    };
    const v2 = normalizeTenantBackupPayload(v1);
    assert.equal(v2.format, 'pbooks-tenant-json-v2');
    assert.equal(v2.sourceTenantId, 't1');
    assert.ok(v2.tables.accounts);
    assert.equal(v2.tables.users, undefined);
    assert.equal(v2.tables.app_settings, undefined);
  });

  it('round-trips through gzip', () => {
    const payload: TenantBackupPayloadV2 = {
      format: 'pbooks-tenant-json-v2',
      exportedAt: '2026-06-06T12:00:00.000Z',
      sourceTenantId: 'default',
      scope: ['accounts'],
      tables: { accounts: [{ id: 'a1', name: 'Cash' }] },
    };
    const compressed = compressTenantBackup(payload);
    const parsed = JSON.parse(gunzipSync(compressed).toString('utf-8')) as TenantBackupPayloadV2;
    assert.equal(parsed.sourceTenantId, 'default');
    assert.ok(compressed.length > 0 || gzipSync(JSON.stringify(payload)).length > 0);
  });
});

describe('tenantBackupRegistry', () => {
  it('includes required business tables', () => {
    assert.ok(TENANT_BACKUP_TABLES.includes('contacts'));
    assert.ok(TENANT_BACKUP_TABLES.includes('vendors'));
    assert.ok(TENANT_BACKUP_TABLES.includes('payroll_employees'));
    assert.ok(TENANT_BACKUP_TABLES.includes('transactions'));
  });

  it('filterBackupTables keeps only whitelisted tables', () => {
    const filtered = filterBackupTables({
      contacts: [{ id: 'c1' }],
      users: [{ id: 'u1' }],
      invoices: [{ id: 'i1' }],
    });
    assert.ok(filtered.contacts);
    assert.ok(filtered.invoices);
    assert.equal(filtered.users, undefined);
  });
});
