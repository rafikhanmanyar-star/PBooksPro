import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  metadataRowToDocumentApi,
  parseUpsertDocumentBody,
} from './types/index.js';
import { isR2Configured, DocumentStorageService } from './services/DocumentStorageService.js';

describe('parseUpsertDocumentBody', () => {
  it('maps camelCase API fields', () => {
    const parsed = parseUpsertDocumentBody({
      name: 'Lease PDF',
      type: 'agreement',
      entityId: 'ra_1',
      entityType: 'agreement',
      fileData: 'YWJj',
      fileName: 'lease.pdf',
      fileSize: 3,
      mimeType: 'application/pdf',
      version: 2,
    });
    assert.deepEqual(parsed, {
      id: undefined,
      name: 'Lease PDF',
      type: 'agreement',
      entityId: 'ra_1',
      entityType: 'agreement',
      fileData: 'YWJj',
      fileName: 'lease.pdf',
      fileSize: 3,
      mimeType: 'application/pdf',
      uploadedBy: undefined,
      userId: undefined,
      version: 2,
    });
  });

  it('maps snake_case bulk sync fields', () => {
    const parsed = parseUpsertDocumentBody({
      entity_id: 'bill_9',
      entity_type: 'bill',
      file_data: 'ZGF0YQ==',
      file_name: 'scan.png',
    });
    assert.equal(parsed.entityId, 'bill_9');
    assert.equal(parsed.entityType, 'bill');
    assert.equal(parsed.fileData, 'ZGF0YQ==');
    assert.equal(parsed.fileName, 'scan.png');
  });
});

describe('metadataRowToDocumentApi', () => {
  it('returns legacy-compatible API shape', () => {
    const api = metadataRowToDocumentApi(
      {
        id: 'doc_1',
        tenant_id: 't1',
        name: 'Invoice scan',
        type: 'bill',
        entity_type: 'bill',
        entity_id: 'bill_1',
        file_name: 'scan.pdf',
        storage_key: 't1/bill/doc_1/scan.pdf',
        mime_type: 'application/pdf',
        file_size: 100,
        uploaded_by: 'u1',
        uploaded_at: new Date('2026-01-15T10:00:00.000Z'),
        deleted_at: null,
        deleted_by: null,
        version: 1,
        inline_data: null,
        created_at: new Date('2026-01-15T10:00:00.000Z'),
        updated_at: new Date('2026-01-15T10:00:00.000Z'),
      },
      'YmFzZTY0'
    );
    assert.partialDeepStrictEqual(api, {
      id: 'doc_1',
      name: 'Invoice scan',
      type: 'bill',
      entityId: 'bill_1',
      entityType: 'bill',
      fileData: 'YmFzZTY0',
      fileName: 'scan.pdf',
      fileSize: 100,
      mimeType: 'application/pdf',
      uploadedBy: 'u1',
      version: 1,
    });
    assert.equal(api.uploadedAt, '2026-01-15T10:00:00.000Z');
  });
});

describe('isR2Configured', () => {
  it('returns false when env vars are missing', () => {
    const saved = {
      R2_BUCKET: process.env.R2_BUCKET,
      R2_ACCESS_KEY: process.env.R2_ACCESS_KEY,
      R2_SECRET_KEY: process.env.R2_SECRET_KEY,
    };
    delete process.env.R2_BUCKET;
    delete process.env.R2_ACCESS_KEY;
    delete process.env.R2_SECRET_KEY;
    assert.equal(isR2Configured(), false);
    if (saved.R2_BUCKET !== undefined) process.env.R2_BUCKET = saved.R2_BUCKET;
    if (saved.R2_ACCESS_KEY !== undefined) process.env.R2_ACCESS_KEY = saved.R2_ACCESS_KEY;
    if (saved.R2_SECRET_KEY !== undefined) process.env.R2_SECRET_KEY = saved.R2_SECRET_KEY;
  });
});

describe('DocumentStorageService.buildStorageKey', () => {
  it('prefixes storage keys with tenant id for isolation', () => {
    const svc = new DocumentStorageService('tenant-abc');
    const key = svc.buildStorageKey('doc_1', 'bill', 'scan.pdf');
    assert.ok(key.startsWith('tenant-abc/'));
    assert.equal(key, 'tenant-abc/bill/doc_1/scan.pdf');
  });
});

describe('decodeLegacyFileData', () => {
  it('decodes base64 file_data', async () => {
    const { decodeLegacyFileData } = await import('./services/documentBackfillService.js');
    const buf = decodeLegacyFileData('YWJj');
    assert.equal(buf.toString('utf8'), 'abc');
  });

  it('decodes data URLs', async () => {
    const { decodeLegacyFileData } = await import('./services/documentBackfillService.js');
    const buf = decodeLegacyFileData('data:application/pdf;base64,YWJj');
    assert.equal(buf.toString('utf8'), 'abc');
  });
});
