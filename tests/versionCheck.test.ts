import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVersionJsonPath,
  isNewerDeployment,
  versionJsonUrl,
} from '../services/versionCheck.ts';

describe('versionCheck', () => {
  describe('isNewerDeployment', () => {
    it('detects when server version differs from embedded build', () => {
      assert.equal(isNewerDeployment('2026.06.12.abc1234', '2026.06.12.def5678'), true);
    });

    it('returns false when versions match', () => {
      assert.equal(isNewerDeployment('2026.06.12.abc1234', '2026.06.12.abc1234'), false);
    });

    it('returns false for empty server version', () => {
      assert.equal(isNewerDeployment('2026.06.12.abc1234', ''), false);
    });
  });

  describe('buildVersionJsonPath', () => {
    it('includes cache-bust query parameter', () => {
      const url = buildVersionJsonPath('/', true);
      assert.match(url, /version\.json\?t=\d+/);
    });

    it('can omit cache-bust query parameter', () => {
      const url = buildVersionJsonPath('/', false);
      assert.match(url, /version\.json$/);
      assert.doesNotMatch(url, /\?t=/);
    });
  });

  describe('versionJsonUrl', () => {
    it('falls back to root base when import.meta.env is unavailable', () => {
      const url = versionJsonUrl(true);
      assert.match(url, /version\.json\?t=\d+/);
    });
  });
});

describe('version check scenarios (integration expectations)', () => {
  it('scenario 1: fresh load after deploy uses new embedded version', () => {
    const embeddedAfterDeploy = '2026.06.12.newbuild';
    const serverVersion = '2026.06.12.newbuild';
    assert.equal(isNewerDeployment(embeddedAfterDeploy, serverVersion), false);
  });

  it('scenario 2: stale tab detects newer deployment', () => {
    const embeddedBeforeDeploy = '2026.06.12.oldbuild';
    const serverVersion = '2026.06.12.newbuild';
    assert.equal(isNewerDeployment(embeddedBeforeDeploy, serverVersion), true);
  });

  it('scenario 3: cache-busted version.json URL bypasses browser cache', () => {
    const url = buildVersionJsonPath('/', true);
    assert.ok(url.includes('?t='));
  });
});
