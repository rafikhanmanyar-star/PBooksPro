import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeBackupHealthScore } from './drHealthScore.js';

describe('computeBackupHealthScore', () => {
  const base = {
    lastSuccessfulBackupAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    lastVerificationPassedAt: new Date(Date.now() - 24 * 3_600_000).toISOString(),
    lastRestoreTestPassedAt: new Date(Date.now() - 48 * 3_600_000).toISOString(),
    offsiteUploadOk: true,
    unacknowledgedCriticalAlerts: 0,
    schedulerEnabled: true,
    staleBackupHours: 48,
  };

  it('returns healthy score when all factors pass', () => {
    const result = computeBackupHealthScore(base);
    assert.ok(result.score >= 80);
    assert.equal(result.label, 'healthy');
    assert.equal(result.factors.length, 5);
  });

  it('returns critical when no backup and open alerts', () => {
    const result = computeBackupHealthScore({
      ...base,
      lastSuccessfulBackupAt: null,
      lastVerificationPassedAt: null,
      lastRestoreTestPassedAt: null,
      offsiteUploadOk: false,
      unacknowledgedCriticalAlerts: 2,
    });
    assert.ok(result.score < 50);
    assert.equal(result.label, 'critical');
  });

  it('degrades when backup is stale', () => {
    const result = computeBackupHealthScore({
      ...base,
      lastSuccessfulBackupAt: new Date(Date.now() - 72 * 3_600_000).toISOString(),
    });
    assert.ok(result.score < 100);
    const recent = result.factors.find((f) => f.id === 'recent_backup');
    assert.equal(recent?.status, 'fail');
  });
});
