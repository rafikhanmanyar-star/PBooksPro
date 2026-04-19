import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  parseIsoDateOnly,
  validateOwnershipTransferOwners,
  primaryOwnerIdFromShares,
} from './propertyOwnershipValidation.js';

describe('propertyOwnershipValidation', () => {
  it('rejects bad totals', () => {
    const r = validateOwnershipTransferOwners([
      { ownerId: 'a', sharePercent: 50 },
      { ownerId: 'b', sharePercent: 40 },
    ]);
    assert.ok('error' in r);
  });

  it('accepts 100% within epsilon', () => {
    const r = validateOwnershipTransferOwners([
      { ownerId: 'a', sharePercent: 50 },
      { ownerId: 'b', sharePercent: 50.01 },
    ]);
    assert.ok('owners' in r);
    assert.equal(r.owners.length, 2);
  });

  it('parses ISO date', () => {
    const ok = parseIsoDateOnly('2025-03-15T00:00:00.000Z');
    assert.ok('ymd' in ok);
    assert.equal(ok.ymd, '2025-03-15');
    const bad = parseIsoDateOnly('not-a-date');
    assert.ok('error' in bad);
  });

  it('primary owner by percentage then id', () => {
    assert.equal(
      primaryOwnerIdFromShares([
        { ownerId: 'z', percentage: 40 },
        { ownerId: 'a', percentage: 60 },
      ]),
      'a'
    );
    assert.equal(
      primaryOwnerIdFromShares([
        { ownerId: 'm', percentage: 50 },
        { ownerId: 'n', percentage: 50 },
      ]),
      'm'
    );
  });
});
