import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGAL_DOCUMENTS,
  validateAcceptancePayload,
  getRequiredDocuments,
  listLegalDocumentsPublic,
} from '../../constants/legalDocuments.js';

const currentVersion = LEGAL_DOCUMENTS[0]!.version;

function acceptance(type: string, version = currentVersion) {
  return { documentType: type, documentVersion: version };
}

describe('legal document registry', () => {
  it('lists all five public document types', () => {
    const all = listLegalDocumentsPublic();
    assert.equal(all.length, 5);
    const types = all.map((d) => d.type).sort();
    assert.deepEqual(types, [
      'data_retention_policy',
      'privacy_policy',
      'refund_policy',
      'subscription_agreement',
      'terms_of_service',
    ]);
  });

  it('requires terms and privacy for registration', () => {
    const required = getRequiredDocuments('registration').map((d) => d.type).sort();
    assert.deepEqual(required, ['privacy_policy', 'terms_of_service']);
  });

  it('requires subscription agreement and refund policy for checkout', () => {
    const required = getRequiredDocuments('checkout').map((d) => d.type).sort();
    assert.deepEqual(required, ['refund_policy', 'subscription_agreement']);
  });
});

describe('validateAcceptancePayload', () => {
  it('accepts complete registration payload', () => {
    const result = validateAcceptancePayload(
      [acceptance('terms_of_service'), acceptance('privacy_policy')],
      'registration'
    );
    assert.equal(result.valid, true);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.invalid, []);
  });

  it('rejects registration when documents are missing', () => {
    const result = validateAcceptancePayload([acceptance('terms_of_service')], 'registration');
    assert.equal(result.valid, false);
    assert.deepEqual(result.missing, ['privacy_policy']);
  });

  it('rejects wrong document version', () => {
    const result = validateAcceptancePayload(
      [acceptance('terms_of_service', '1999-01-01'), acceptance('privacy_policy')],
      'registration'
    );
    assert.equal(result.valid, false);
    assert.deepEqual(result.invalid, ['terms_of_service']);
  });

  it('accepts complete checkout payload', () => {
    const result = validateAcceptancePayload(
      [acceptance('subscription_agreement'), acceptance('refund_policy')],
      'checkout'
    );
    assert.equal(result.valid, true);
  });

  it('rejects checkout when subscription agreement is missing', () => {
    const result = validateAcceptancePayload([acceptance('refund_policy')], 'checkout');
    assert.equal(result.valid, false);
    assert.deepEqual(result.missing, ['subscription_agreement']);
  });
});
