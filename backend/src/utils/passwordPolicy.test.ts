import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePassword } from './passwordPolicy.js';

describe('validatePassword', () => {
  it('rejects short passwords', () => {
    assert.equal(validatePassword('Ab1'), 'Password must be at least 8 characters.');
  });

  it('requires a letter and a number', () => {
    assert.equal(validatePassword('12345678'), 'Password must include at least one letter.');
    assert.equal(validatePassword('abcdefgh'), 'Password must include at least one number.');
  });

  it('accepts valid passwords', () => {
    assert.equal(validatePassword('Secure99'), null);
  });
});
