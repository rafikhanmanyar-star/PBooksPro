import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { getSlowRequestThresholdMs } from '../constants/monitoring.js';
import type { AuthedRequest } from './authMiddleware.js';

export type RequestWithId = Request & { requestId?: string };

/** Assigns X-Request-Id and logs structured access lines on response finish. */
export function requestLoggingMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const start = Date.now();
  const path = req.originalUrl ?? req.url;
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    logger.info('HTTP request', {
      requestId,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs,
    });

    void import('../services/monitoring/monitoringCapture.js').then(({ captureMonitoringEvent }) => {
      const authed = req as AuthedRequest;
      const base = {
        route: path,
        method: req.method,
        statusCode: res.statusCode,
        durationMs,
        requestId,
        tenantId: authed.tenantId ?? null,
        userId: authed.userId ?? null,
      };

      if (res.statusCode >= 500) {
        captureMonitoringEvent({
          ...base,
          category: 'api_failure',
          severity: res.statusCode >= 500 ? 'error' : 'warn',
          message: `${req.method} ${path} → ${res.statusCode}`,
          code: 'HTTP_5XX',
        });
      }

      const slowThreshold = getSlowRequestThresholdMs();
      if (durationMs >= slowThreshold && !path.includes('/health')) {
        captureMonitoringEvent({
          ...base,
          category: 'performance',
          severity: durationMs >= slowThreshold * 2 ? 'warn' : 'info',
          message: `Slow request: ${req.method} ${path} (${durationMs}ms)`,
          code: 'SLOW_REQUEST',
          metadata: { thresholdMs: slowThreshold },
        });
      }
    });
  });
  next();
}
