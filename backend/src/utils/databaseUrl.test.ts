import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDatabaseUrl } from './databaseUrl.js';

describe('normalizeDatabaseUrl', () => {
  it('keeps URLs that already include a user', () => {
    assert.strictEqual(
      normalizeDatabaseUrl('postgresql://postgres:secret@127.0.0.1:5432/pbookspro'),
      'postgresql://postgres:secret@127.0.0.1:5432/pbookspro'
    );
  });

  it('adds postgres user when host-only URL is provided', () => {
    assert.strictEqual(
      normalizeDatabaseUrl('postgresql://127.0.0.1:5432/pbookspro'),
      'postgresql://postgres:@127.0.0.1:5432/pbookspro'
    );
  });

  it('adds postgres user when URL has empty user slot', () => {
    assert.strictEqual(
      normalizeDatabaseUrl('postgresql://@127.0.0.1:5432/pbookspro'),
      'postgresql://postgres:@127.0.0.1:5432/pbookspro'
    );
  });
});
