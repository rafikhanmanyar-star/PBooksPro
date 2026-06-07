import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { assertProductionEnv } from '../utils/productionEnvCheck.js';

describe('assertProductionEnv', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'test-secret-at-least-16-chars';
    delete process.env.SEED_STAGING;
    delete process.env.ALLOW_STAGING_SEED_IN_PRODUCTION;
    delete process.env.STAGING_ADMIN_PASSWORD;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('passes with valid JWT_SECRET and no staging seed', () => {
    assert.doesNotThrow(() => assertProductionEnv());
  });

  it('blocks SEED_STAGING in production without explicit opt-in', () => {
    process.env.SEED_STAGING = '1';
    assert.throws(
      () => assertProductionEnv(),
      /SEED_STAGING=1 is not allowed in production/
    );
  });

  it('allows SEED_STAGING when ALLOW_STAGING_SEED_IN_PRODUCTION=true', () => {
    process.env.SEED_STAGING = '1';
    process.env.ALLOW_STAGING_SEED_IN_PRODUCTION = 'true';
    assert.doesNotThrow(() => assertProductionEnv());
  });

  it('rejects weak STAGING_ADMIN_PASSWORD when set', () => {
    process.env.SEED_STAGING = '1';
    process.env.ALLOW_STAGING_SEED_IN_PRODUCTION = 'true';
    process.env.STAGING_ADMIN_PASSWORD = 'short';
    assert.throws(
      () => assertProductionEnv(),
      /STAGING_ADMIN_PASSWORD does not meet policy/
    );
  });

  it('no-ops outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    assert.doesNotThrow(() => assertProductionEnv());
  });
});
