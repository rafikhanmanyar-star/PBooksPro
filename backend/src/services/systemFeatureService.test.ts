import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSystemInfo,
  getAppEdition,
  getFeaturesForEdition,
  isFeatureEnabled,
  normalizeAppEdition,
} from './systemFeatureService.js';

describe('systemFeatureService', () => {
  const originalEdition = process.env.APP_EDITION;

  beforeEach(() => {
    delete process.env.APP_EDITION;
  });

  afterEach(() => {
    if (originalEdition === undefined) {
      delete process.env.APP_EDITION;
    } else {
      process.env.APP_EDITION = originalEdition;
    }
  });

  it('defaults to desktop edition', () => {
    assert.equal(getAppEdition(), 'desktop');
    assert.equal(normalizeAppEdition(undefined), 'desktop');
  });

  it('normalizes cloud edition', () => {
    process.env.APP_EDITION = 'cloud';
    assert.equal(getAppEdition(), 'cloud');
  });

  it('enables application updates on desktop only', () => {
    assert.equal(isFeatureEnabled('applicationUpdates', 'desktop'), true);
    assert.equal(isFeatureEnabled('applicationUpdates', 'cloud'), false);
  });

  it('builds consistent system info payload', () => {
    process.env.APP_EDITION = 'cloud';
    const info = buildSystemInfo('1.2.3');
    assert.deepEqual(info, {
      edition: 'cloud',
      version: '1.2.3',
      features: getFeaturesForEdition('cloud'),
    });
    assert.equal(info.features.applicationUpdates, false);
    assert.equal(info.features.advancedReporting, true);
  });
});
