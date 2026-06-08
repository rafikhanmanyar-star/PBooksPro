import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMonitoringEnabled, getSlowRequestThresholdMs } from '../../constants/monitoring.js';
import { getObservabilityStatus, initObservabilityProviders } from './observabilityProvider.js';

describe('monitoring constants', () => {
  it('isMonitoringEnabled defaults true unless explicitly false', () => {
    const prev = process.env.MONITORING_ENABLED;
    delete process.env.MONITORING_ENABLED;
    assert.equal(isMonitoringEnabled(), true);
    process.env.MONITORING_ENABLED = 'false';
    assert.equal(isMonitoringEnabled(), false);
    if (prev === undefined) delete process.env.MONITORING_ENABLED;
    else process.env.MONITORING_ENABLED = prev;
  });

  it('getSlowRequestThresholdMs falls back to 3000', () => {
    const prev = process.env.MONITORING_SLOW_REQUEST_MS;
    delete process.env.MONITORING_SLOW_REQUEST_MS;
    assert.equal(getSlowRequestThresholdMs(), 3000);
    if (prev === undefined) delete process.env.MONITORING_SLOW_REQUEST_MS;
    else process.env.MONITORING_SLOW_REQUEST_MS = prev;
  });
});

describe('observabilityProvider', () => {
  it('initObservabilityProviders registers when env set', () => {
    const prevSentry = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = 'https://example@sentry.io/1';
    initObservabilityProviders();
    const status = getObservabilityStatus();
    assert.equal(status.sentry, true);
    assert.ok(status.registeredProviders.includes('sentry'));
    if (prevSentry === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = prevSentry;
    initObservabilityProviders();
  });
});
