/**
 * Backup health score (0–100) from DR metrics.
 */

export type HealthFactor = {
  id: string;
  label: string;
  weight: number;
  score: number;
  maxScore: number;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
};

export type HealthScoreResult = {
  score: number;
  label: 'healthy' | 'degraded' | 'critical';
  factors: HealthFactor[];
};

export type HealthInput = {
  lastSuccessfulBackupAt: string | null;
  lastVerificationPassedAt: string | null;
  lastRestoreTestPassedAt: string | null;
  offsiteUploadOk: boolean;
  unacknowledgedCriticalAlerts: number;
  schedulerEnabled: boolean;
  staleBackupHours: number;
};

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return ms / 3_600_000;
}

function recencyScore(hours: number | null, goodWithin: number, warnWithin: number, max: number): number {
  if (hours === null) return 0;
  if (hours <= goodWithin) return max;
  if (hours <= warnWithin) return Math.round(max * 0.5);
  return 0;
}

export function computeBackupHealthScore(input: HealthInput): HealthScoreResult {
  const factors: HealthFactor[] = [];

  const backupH = hoursSince(input.lastSuccessfulBackupAt);
  const backupScore = input.schedulerEnabled
    ? recencyScore(backupH, 26, input.staleBackupHours, 25)
    : 0;
  factors.push({
    id: 'recent_backup',
    label: 'Recent successful backup',
    weight: 25,
    score: backupScore,
    maxScore: 25,
    status: backupScore >= 25 ? 'ok' : backupScore > 0 ? 'warn' : 'fail',
    detail:
      backupH == null
        ? 'No successful backup recorded.'
        : `Last success ${backupH.toFixed(1)}h ago.`,
  });

  const verifyH = hoursSince(input.lastVerificationPassedAt);
  const verifyScore = recencyScore(verifyH, 168, 336, 25);
  factors.push({
    id: 'verification',
    label: 'Backup verification',
    weight: 25,
    score: verifyScore,
    maxScore: 25,
    status: verifyScore >= 25 ? 'ok' : verifyScore > 0 ? 'warn' : 'fail',
    detail:
      verifyH == null ? 'No verification passed yet.' : `Last passed ${verifyH.toFixed(1)}h ago.`,
  });

  const offsiteScore = input.offsiteUploadOk ? 20 : 0;
  factors.push({
    id: 'offsite',
    label: 'Offsite copy',
    weight: 20,
    score: offsiteScore,
    maxScore: 20,
    status: offsiteScore > 0 ? 'ok' : 'warn',
    detail: input.offsiteUploadOk
      ? 'Latest backup uploaded offsite.'
      : 'No completed offsite upload for latest backup.',
  });

  const testH = hoursSince(input.lastRestoreTestPassedAt);
  const testScore = recencyScore(testH, 168, 336, 20);
  factors.push({
    id: 'restore_test',
    label: 'Restore simulation',
    weight: 20,
    score: testScore,
    maxScore: 20,
    status: testScore >= 20 ? 'ok' : testScore > 0 ? 'warn' : 'fail',
    detail:
      testH == null ? 'No restore test passed yet.' : `Last passed ${testH.toFixed(1)}h ago.`,
  });

  const alertScore =
    input.unacknowledgedCriticalAlerts === 0 ? 10 : Math.max(0, 10 - input.unacknowledgedCriticalAlerts * 5);
  factors.push({
    id: 'alerts',
    label: 'Open critical alerts',
    weight: 10,
    score: alertScore,
    maxScore: 10,
    status: input.unacknowledgedCriticalAlerts === 0 ? 'ok' : 'fail',
    detail:
      input.unacknowledgedCriticalAlerts === 0
        ? 'No unacknowledged critical alerts.'
        : `${input.unacknowledgedCriticalAlerts} critical alert(s) open.`,
  });

  const score = Math.min(100, factors.reduce((s, f) => s + f.score, 0));
  let label: HealthScoreResult['label'] = 'healthy';
  if (score < 50) label = 'critical';
  else if (score < 80) label = 'degraded';

  return { score, label, factors };
}
