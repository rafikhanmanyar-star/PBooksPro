import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCorsAllowAll,
  isOriginAllowed,
  parseCorsOriginsFromEnv,
  resolveExpressCorsOrigin,
  resolveSocketIoCorsOrigin,
} from './corsOrigins.js';

describe('corsOrigins', () => {
  it('allows localhost dev origins by default', () => {
    const origins = parseCorsOriginsFromEnv();
    assert.ok(origins.includes('http://localhost:5173'));
    assert.ok(isOriginAllowed('http://localhost:5173', origins));
    assert.ok(!isOriginAllowed('https://evil.example', origins));
  });

  it('allows Electron desktop origins (null and file://)', () => {
    const origins = parseCorsOriginsFromEnv();
    assert.ok(isOriginAllowed('null', origins));
    assert.ok(isOriginAllowed('file://', origins));
  });

  it('merges FRONTEND_URL and CORS_ORIGINS', () => {
    const prevFrontend = process.env.FRONTEND_URL;
    const prevOrigins = process.env.CORS_ORIGINS;
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.CORS_ORIGINS = 'https://staging.example.com';
    try {
      const origins = parseCorsOriginsFromEnv();
      assert.ok(origins.includes('https://app.example.com'));
      assert.ok(origins.includes('https://staging.example.com'));
    } finally {
      if (prevFrontend === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = prevFrontend;
      if (prevOrigins === undefined) delete process.env.CORS_ORIGINS;
      else process.env.CORS_ORIGINS = prevOrigins;
    }
  });

  it('resolveSocketIoCorsOrigin rejects disallowed origins', async () => {
    const prevAllowAll = process.env.CORS_ALLOW_ALL;
    delete process.env.CORS_ALLOW_ALL;
    const resolver = resolveSocketIoCorsOrigin();
    assert.notEqual(resolver, true);
    if (typeof resolver !== 'function') {
      assert.fail('expected callback resolver');
    }
    const allowed = await new Promise<boolean>((resolve, reject) => {
      resolver('http://localhost:5173', (err, allow) => {
        if (err) reject(err);
        else resolve(!!allow);
      });
    });
    const denied = await new Promise<boolean>((resolve) => {
      resolver('https://blocked.example', (err, allow) => {
        resolve(!!err && !allow);
      });
    });
    assert.equal(allowed, true);
    assert.equal(denied, true);
    if (prevAllowAll === undefined) delete process.env.CORS_ALLOW_ALL;
    else process.env.CORS_ALLOW_ALL = prevAllowAll;
  });

  it('includes production admin portal origin when NODE_ENV=production', () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const origins = parseCorsOriginsFromEnv();
      assert.ok(origins.includes('https://admin.pbookspro.com'));
      assert.ok(isOriginAllowed('https://admin.pbookspro.com', origins));
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('resolveExpressCorsOrigin allows admin portal in production', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevAllowAll = process.env.CORS_ALLOW_ALL;
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ALLOW_ALL;
    try {
      const resolver = resolveExpressCorsOrigin();
      assert.notEqual(resolver, true);
      if (typeof resolver !== 'function') {
        assert.fail('expected callback resolver');
      }
      const allowed = await new Promise<boolean>((resolve, reject) => {
        resolver('https://admin.pbookspro.com', (err, allow) => {
          if (err) reject(err);
          else resolve(!!allow);
        });
      });
      assert.equal(allowed, true);
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevAllowAll === undefined) delete process.env.CORS_ALLOW_ALL;
      else process.env.CORS_ALLOW_ALL = prevAllowAll;
    }
  });

  it('CORS_ALLOW_ALL returns true resolver', () => {
    const prev = process.env.CORS_ALLOW_ALL;
    process.env.CORS_ALLOW_ALL = 'true';
    try {
      assert.equal(resolveSocketIoCorsOrigin(), true);
      assert.equal(resolveExpressCorsOrigin(), true);
      assert.equal(isCorsAllowAll(), true);
    } finally {
      if (prev === undefined) delete process.env.CORS_ALLOW_ALL;
      else process.env.CORS_ALLOW_ALL = prev;
    }
  });
});
