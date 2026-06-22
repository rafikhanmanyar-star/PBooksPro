import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { publicIntrospectionLimiter } from '../../../middleware/introspectionGuard.js';
import { sendFailure, sendSuccess } from '../../../utils/apiResponse.js';
import { runReadinessCheck } from '../../../services/monitoring/monitoringHealthService.js';
import { sendLivenessResponse } from '../../../routes/healthLiveness.js';
import { getPoolPressure } from '../../../db/pool.js';
import { getApiMetricsSummary, getPoolMetricsSummary } from '../../../services/telemetry/index.js';

export const monitoringPublicRouter = Router();

monitoringPublicRouter.get('/health', publicIntrospectionLimiter, (_req, res) => {
  sendLivenessResponse(res);
});

monitoringPublicRouter.get('/health/ready', publicIntrospectionLimiter, async (_req, res) => {
  try {
    const health = await runReadinessCheck();
    const status = health.status === 'unhealthy' ? 503 : 200;
    res.status(status).json({
      success: health.status !== 'unhealthy',
      data: {
        status: health.status,
        components: health.components,
        serverTime: new Date().toISOString(),
      },
      error: null,
    });
  } catch (e) {
    res.status(503).json({
      success: false,
      data: null,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: e instanceof Error ? e.message : 'Readiness check failed',
      },
    });
  }
});

export const monitoringIngestRouter = Router();

const clientErrorSchema = z.object({
  message: z.string().min(1).max(4000),
  stack: z.string().max(12000).optional(),
  componentStack: z.string().max(8000).optional(),
  url: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const telemetrySchema = z.object({
  metrics: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        value: z.number(),
        unit: z.enum(['ms', 'bytes', 'count', 'score']),
        tags: z.record(z.string()).optional(),
        timestamp: z.string().optional(),
      })
    )
    .max(50),
});

monitoringIngestRouter.post('/monitoring/client-errors', async (req, res) => {
  const parsed = clientErrorSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
    return;
  }

  const authed = req as AuthedRequest;
  const { captureMonitoringEvent } = await import('../../../services/monitoring/monitoringCapture.js');
  captureMonitoringEvent({
    category: 'application_error',
    severity: 'error',
    message: parsed.data.message,
    code: 'CLIENT_ERROR',
    tenantId: authed.tenantId ?? null,
    userId: authed.userId ?? null,
    route: parsed.data.url,
    stackTrace: parsed.data.stack ?? parsed.data.componentStack,
    metadata: parsed.data.metadata,
  });

  sendSuccess(res, { recorded: true });
});

monitoringIngestRouter.post('/monitoring/telemetry', async (req, res) => {
  const parsed = telemetrySchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
    return;
  }

  const authed = req as AuthedRequest;
  const { captureMonitoringEvent } = await import('../../../services/monitoring/monitoringCapture.js');

  for (const metric of parsed.data.metrics) {
    const isSlow = metric.unit === 'ms' && metric.value >= 500;
    captureMonitoringEvent({
      category: 'performance',
      severity: metric.unit === 'ms' && metric.value >= 1000 ? 'warn' : 'info',
      message: `Client ${metric.name}: ${metric.value}${metric.unit}`,
      code: isSlow ? 'CLIENT_SLOW_METRIC' : 'CLIENT_TELEMETRY',
      tenantId: authed.tenantId ?? null,
      userId: authed.userId ?? null,
      durationMs: metric.unit === 'ms' ? metric.value : undefined,
      metadata: { ...metric.tags, unit: metric.unit, clientTimestamp: metric.timestamp },
    });
  }

  sendSuccess(res, { recorded: parsed.data.metrics.length });
});

/** Cloud Performance Program — read-only pool pressure (tenant-authenticated). */
monitoringIngestRouter.get('/monitoring/pool-pressure', async (_req, res) => {
  const pressure = getPoolPressure();
  sendSuccess(res, {
    ...pressure,
    activeCount: Math.max(0, pressure.total - pressure.idle),
    idleCount: pressure.idle,
    waitingCount: pressure.waiting,
    sampled: process.env.PBOOKS_PERF_POOL_SAMPLE === '1',
    serverTime: new Date().toISOString(),
  });
});

/** Cloud Performance Program — API + pool summary (requires PBOOKS_PERF_BASELINE_EXPORT=1). */
monitoringIngestRouter.get('/monitoring/perf-baseline', async (_req, res) => {
  if (process.env.PBOOKS_PERF_BASELINE_EXPORT !== '1') {
    sendFailure(res, 404, 'NOT_FOUND', 'Performance baseline export is disabled.');
    return;
  }
  const windowMinutes = Math.min(Math.max(Number(_req.query.windowMinutes ?? 15), 1), 120);
  const pressure = getPoolPressure();
  sendSuccess(res, {
    generatedAt: new Date().toISOString(),
    windowMinutes,
    pool: {
      ...pressure,
      activeCount: Math.max(0, pressure.total - pressure.idle),
      idleCount: pressure.idle,
      waitingCount: pressure.waiting,
    },
    api: getApiMetricsSummary(windowMinutes),
    poolSamples: getPoolMetricsSummary(windowMinutes),
  });
});
