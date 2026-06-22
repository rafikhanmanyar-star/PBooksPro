import type pg from 'pg';
import { getPool } from '../../db/pool.js';
import { isMonitoringEnabled } from '../../constants/monitoring.js';
import { recordMonitoringEvent, type RecordMonitoringEventInput } from './monitoringEventService.js';
import { evaluateAlertRules } from './monitoringAlertService.js';
import { forwardToObservability } from './observabilityProvider.js';
import { logger } from '../../utils/logger.js';

/** Non-blocking event capture — safe to call from hot paths. */
export function captureMonitoringEvent(input: RecordMonitoringEventInput): void {
  if (!isMonitoringEnabled()) return;

  void (async () => {
    let client: pg.PoolClient | null = null;
    try {
      client = await getPool().connect();
      const row = await recordMonitoringEvent(client, input);
      await evaluateAlertRules(client, input.category, input.severity ?? 'info', row.id, input.message);
      forwardToObservability({
        category: input.category,
        severity: input.severity ?? 'info',
        message: input.message,
        code: input.code,
        tenantId: input.tenantId,
        userId: input.userId,
        route: input.route,
        requestId: input.requestId,
        durationMs: input.durationMs,
        stack: input.stackTrace,
        metadata: input.metadata,
      });
    } catch (err) {
      logger.warn('[monitoring] capture failed', { err, category: input.category });
    } finally {
      client?.release();
    }
  })();
}
