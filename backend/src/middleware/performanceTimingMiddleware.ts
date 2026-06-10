import type { Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import type { AuthedRequest } from './authMiddleware.js';
import type { RequestWithId } from './requestLogging.js';

const WARN_MS = 3000;
const CRITICAL_MS = 10000;

export type TimedRequest = AuthedRequest & RequestWithId & { perfStart?: number };

/**
 * Structured API timing logs: request start → response sent with total duration.
 * Flags slow requests: >3s warn, >10s critical (also captured in monitoring_events).
 */
export function performanceTimingMiddleware(req: TimedRequest, res: Response, next: NextFunction): void {
  const start = Date.now();
  req.perfStart = start;
  const path = req.originalUrl ?? req.url;
  const method = req.method;

  logger.debug('Request started', {
    requestId: req.requestId,
    method,
    path,
    userId: req.userId ?? null,
    tenantId: req.tenantId ?? null,
  });

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const severity =
      durationMs >= CRITICAL_MS ? 'critical' : durationMs >= WARN_MS ? 'warn' : 'info';

    const payload = {
      requestId: req.requestId,
      method,
      path,
      status: res.statusCode,
      durationMs,
      userId: req.userId ?? null,
      tenantId: req.tenantId ?? null,
      phase: 'response_sent',
    };

    if (durationMs >= WARN_MS) {
      logger.warn('Slow API request', { ...payload, severity });
    } else {
      logger.info('API timing', payload);
    }

    void import('../services/monitoring/monitoringCapture.js').then(({ captureMonitoringEvent }) => {
      if (durationMs < WARN_MS) return;
      captureMonitoringEvent({
        category: 'performance',
        severity: durationMs >= CRITICAL_MS ? 'critical' : 'warn',
        message: `API ${method} ${path} took ${durationMs}ms`,
        code: durationMs >= CRITICAL_MS ? 'SLOW_REQUEST_CRITICAL' : 'SLOW_REQUEST',
        route: path,
        method,
        statusCode: res.statusCode,
        durationMs,
        requestId: req.requestId,
        tenantId: req.tenantId ?? null,
        userId: req.userId ?? null,
        metadata: { warnThresholdMs: WARN_MS, criticalThresholdMs: CRITICAL_MS },
      });
    });
  });

  next();
}
