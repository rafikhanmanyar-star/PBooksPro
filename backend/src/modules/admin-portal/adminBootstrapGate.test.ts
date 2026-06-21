import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isAdminBootstrapEnabled } from './adminBootstrapGate.js';

/**
 * Regression coverage for the unauthenticated admin bootstrap route gate.
 * The route (POST /api/admin/create-admin) must be UNAVAILABLE unless running
 * in local development with an explicit opt-in.
 */
describe('isAdminBootstrapEnabled (admin bootstrap route gate)', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.ENABLE_ADMIN_BOOTSTRAP;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('is unavailable by default (no env flags set)', () => {
    assert.equal(isAdminBootstrapEnabled({}), false);
  });

  it('is unavailable in production even with ENABLE_ADMIN_BOOTSTRAP=true', () => {
    assert.equal(
      isAdminBootstrapEnabled({ NODE_ENV: 'production', ENABLE_ADMIN_BOOTSTRAP: 'true' }),
      false
    );
  });

  it('is unavailable in staging even with ENABLE_ADMIN_BOOTSTRAP=true', () => {
    assert.equal(
      isAdminBootstrapEnabled({ NODE_ENV: 'staging', ENABLE_ADMIN_BOOTSTRAP: 'true' }),
      false
    );
  });

  it('is unavailable in development without the explicit opt-in flag', () => {
    assert.equal(isAdminBootstrapEnabled({ NODE_ENV: 'development' }), false);
    assert.equal(
      isAdminBootstrapEnabled({ NODE_ENV: 'development', ENABLE_ADMIN_BOOTSTRAP: 'false' }),
      false
    );
    assert.equal(
      isAdminBootstrapEnabled({ NODE_ENV: 'development', ENABLE_ADMIN_BOOTSTRAP: '1' }),
      false
    );
  });

  it('is available ONLY in development with ENABLE_ADMIN_BOOTSTRAP=true', () => {
    assert.equal(
      isAdminBootstrapEnabled({ NODE_ENV: 'development', ENABLE_ADMIN_BOOTSTRAP: 'true' }),
      true
    );
  });

  it('reads from process.env when no argument is supplied', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_ADMIN_BOOTSTRAP = 'true';
    assert.equal(isAdminBootstrapEnabled(), true);

    process.env.NODE_ENV = 'production';
    assert.equal(isAdminBootstrapEnabled(), false);
  });
});
